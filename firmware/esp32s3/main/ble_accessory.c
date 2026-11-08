/* APEX laboratory AXP transport. ESP-IDF/NimBLE APIs researched in R11.
 * This unauthenticated peer exposes identity, capability report and ping only.
 */
#include <string.h>
#include <stdbool.h>
#include "apex.h"
#include "ble_accessory.h"
#include "esp_err.h"
#include "nvs_flash.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

/* UUIDs encoded least-significant byte first, matching packages/core/ble-transport.ts. */
#define AXP_UUID(n) BLE_UUID128_INIT(0x01,0xa1,0xb7,0xd2,0x76,0x77,0x16,0xa8,0x97,0x4a,0x32,0x86,n,0x00,0x1d,0x6f)
static const ble_uuid128_t service_uuid = AXP_UUID(1);
static const ble_uuid128_t write_uuid = AXP_UUID(2);
static const ble_uuid128_t notify_uuid = AXP_UUID(3);
static uint16_t notify_handle;
static uint16_t connection = BLE_HS_CONN_HANDLE_NONE;
static uint8_t address_type;
static bool subscribed;
static apex_device_t peer;
static struct ble_npl_callout tx_timer;
/* All state below is touched only on the NimBLE host event queue. */
static struct { size_t length; size_t offset; uint8_t bytes[APEX_MAX_FRAME]; } queue[4];
static unsigned first, count, retries;
static int gap_event(struct ble_gap_event *event, void *argument);

static void reset_peer(void) {
    ble_npl_callout_stop(&tx_timer);
    first = count = retries = 0; subscribed = false;
    apex_stream_init(&peer.stream, peer.stream.receive, peer.stream.context);
}
static void schedule(void) { ble_npl_callout_reset(&tx_timer, ble_npl_time_ms_to_ticks32(5)); }
static void output(const uint8_t *bytes, size_t length, void *context) {
    (void)context;
    if (!subscribed || connection == BLE_HS_CONN_HANDLE_NONE || !length || length > APEX_MAX_FRAME) return;
    if (count == 4) { ble_gap_terminate(connection, BLE_ERR_REM_USER_CONN_TERM); return; }
    unsigned slot = (first + count) % 4;
    memcpy(queue[slot].bytes, bytes, length); queue[slot].length = length; queue[slot].offset = 0;
    ++count; if (count == 1) schedule();
}
static void transmit(struct ble_npl_event *event) {
    (void)event;
    if (!subscribed || !count || connection == BLE_HS_CONN_HANDLE_NONE) return;
    uint16_t mtu = ble_att_mtu(connection);
    size_t chunk = mtu > 3 ? mtu - 3 : 20;
    if (chunk > 244) chunk = 244;
    size_t remaining = queue[first].length - queue[first].offset;
    if (chunk > remaining) chunk = remaining;
    struct os_mbuf *packet = ble_hs_mbuf_from_flat(queue[first].bytes + queue[first].offset, chunk);
    /* notify_custom consumes its mbuf on success AND error. */
    int rc = packet ? ble_gatts_notify_custom(connection, notify_handle, packet) : BLE_HS_ENOMEM;
    if (rc) {
        if (++retries >= 10) { ble_gap_terminate(connection, BLE_ERR_REM_USER_CONN_TERM); return; }
    } else {
        retries = 0; queue[first].offset += chunk;
        if (queue[first].offset == queue[first].length) { first = (first + 1) % 4; --count; }
    }
    if (count) schedule();
}
static int access_characteristic(uint16_t conn, uint16_t handle, struct ble_gatt_access_ctxt *context, void *argument) {
    (void)handle; (void)argument;
    if (context->op != BLE_GATT_ACCESS_OP_WRITE_CHR || conn != connection || !subscribed) return BLE_ATT_ERR_WRITE_NOT_PERMITTED;
    uint16_t length = OS_MBUF_PKTLEN(context->om); uint8_t bytes[244];
    if (!length || length > sizeof(bytes)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(context->om, bytes, sizeof(bytes), NULL)) return BLE_ATT_ERR_UNLIKELY;
    apex_device_feed(&peer, bytes, length); return 0;
}
static const struct ble_gatt_svc_def services[] = {
    { .type = BLE_GATT_SVC_TYPE_PRIMARY, .uuid = &service_uuid.u,
      .characteristics = (struct ble_gatt_chr_def[]) {
        { .uuid = &write_uuid.u, .access_cb = access_characteristic, .flags = BLE_GATT_CHR_F_WRITE },
        { .uuid = &notify_uuid.u, .access_cb = access_characteristic, .val_handle = &notify_handle, .flags = BLE_GATT_CHR_F_NOTIFY },
        { 0 }
      } },
    { 0 }
};
static void advertise(void) {
    struct ble_hs_adv_fields fields = { 0 };
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128 = (ble_uuid128_t *)&service_uuid; fields.num_uuids128 = 1; fields.uuids128_is_complete = 1;
    if (ble_gap_adv_set_fields(&fields)) return;
    struct ble_hs_adv_fields scan = { 0 };
    const char *name = ble_svc_gap_device_name();
    scan.name = (uint8_t *)name; scan.name_len = strlen(name); scan.name_is_complete = 1;
    if (ble_gap_adv_rsp_set_fields(&scan)) return;
    struct ble_gap_adv_params params = { .conn_mode = BLE_GAP_CONN_MODE_UND, .disc_mode = BLE_GAP_DISC_MODE_GEN };
    (void)ble_gap_adv_start(address_type, NULL, BLE_HS_FOREVER, &params, gap_event, NULL);
}
static int gap_event(struct ble_gap_event *event, void *argument) {
    (void)argument;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        reset_peer();
        if (event->connect.status == 0) connection = event->connect.conn_handle;
        else { connection = BLE_HS_CONN_HANDLE_NONE; advertise(); }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        reset_peer(); connection = BLE_HS_CONN_HANDLE_NONE; advertise(); break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.conn_handle == connection && event->subscribe.attr_handle == notify_handle) {
            reset_peer(); subscribed = event->subscribe.cur_notify;
            if (subscribed) output((const uint8_t *)"AXP_READY", 9, NULL);
        }
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE: advertise(); break;
    default: break;
    }
    return 0;
}
static void synchronised(void) {
    if (!ble_hs_util_ensure_addr(0) && !ble_hs_id_infer_auto(0, &address_type)) advertise();
}
static void host_task(void *argument) { (void)argument; nimble_port_run(); nimble_port_freertos_deinit(); }
void apex_ble_start(void) {
    esp_err_t result = nvs_flash_init();
    if (result == ESP_ERR_NVS_NO_FREE_PAGES || result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase()); result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(result); ESP_ERROR_CHECK(nimble_port_init());
    ble_hs_cfg.sync_cb = synchronised;
    ble_svc_gap_init(); ble_svc_gatt_init();
    ESP_ERROR_CHECK(ble_svc_gap_device_name_set("APEX Laboratory"));
    ESP_ERROR_CHECK(ble_gatts_count_cfg(services)); ESP_ERROR_CHECK(ble_gatts_add_svcs(services));
    apex_device_init(&peer, output, NULL);
    ble_npl_callout_init(&tx_timer, nimble_port_get_dflt_eventq(), transmit, NULL);
    nimble_port_freertos_init(host_task);
}
