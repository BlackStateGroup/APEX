/* Reviewed derivative of the preserved esp32s3/main/ble_accessory.c.
 * Host-fake tested only; ESP-IDF API/ABI and physical operation unvalidated.
 * This unauthenticated peer exposes identity, capability report and ping only.
 */
#include "sdkconfig.h"
#if defined(CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN) && CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN
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

/* notify_custom consumes its mbuf only in the enabled notification branch.
 * Refuse an incompatible config rather than leak on its ENOTSUP early return. */
#ifndef MYNEWT_VAL
#error "APEX requires the NimBLE MYNEWT_VAL configuration interface"
#elif !MYNEWT_VAL(BLE_GATT_NOTIFY)
#error "APEX reviewed BLE requires BLE_GATT_NOTIFY enabled"
#endif

/* UUIDs encoded least-significant byte first, matching packages/core/ble-transport.ts. */
#define AXP_UUID(n) BLE_UUID128_INIT(0x01,0xa1,0xb7,0xd2,0x76,0x77,0x16,0xa8,0x97,0x4a,0x32,0x86,n,0x00,0x1d,0x6f)
static const ble_uuid128_t service_uuid = AXP_UUID(1);
static const ble_uuid128_t write_uuid = AXP_UUID(2);
static const ble_uuid128_t notify_uuid = AXP_UUID(3);
static uint16_t notify_handle;
static uint16_t connection = BLE_HS_CONN_HANDLE_NONE;
static uint8_t address_type;
static bool subscribed;
static bool fenced; /* Retained until confirmed disconnect; terminate is only a request. */
static apex_device_t peer;
static struct ble_npl_callout tx_timer;
/* All state below is touched only on the NimBLE host event queue. */
static struct { size_t length; size_t offset; uint8_t bytes[APEX_MAX_FRAME]; } queue[4];
static unsigned first, count, retries;
static int gap_event(struct ble_gap_event *event, void *argument);

static void reset_peer(void) {
    ble_npl_callout_stop(&tx_timer);
    first = count = retries = 0; subscribed = false; fenced = false;
    apex_device_init(&peer, NULL, NULL);
}
static void fence(void) {
    /* Clear locally BEFORE terminate, including when the request fails. */
    fenced = true; subscribed = false;
    ble_npl_callout_stop(&tx_timer);
    first = count = retries = 0;
    if (connection != BLE_HS_CONN_HANDLE_NONE)
        (void)ble_gap_terminate(connection, BLE_ERR_REM_USER_CONN_TERM);
}
static void schedule(void) {
    if (ble_npl_callout_reset(&tx_timer, ble_npl_time_ms_to_ticks32(5))) fence();
}
typedef struct { size_t length; uint8_t bytes[APEX_MAX_FRAME]; } staged_frame_t;
/* Static staging avoids several kilobytes on the host task stack. All callbacks
 * and this non-reentrant transaction are confined to the NimBLE host queue. */
static struct {
    apex_device_t device;
    staged_frame_t frames[4];
    unsigned count;
    unsigned capacity;
    bool overflow;
} staged;
static void collect(const uint8_t *bytes, size_t length, void *context) {
    (void)context;
    if (!length || length > APEX_MAX_FRAME || staged.count >= staged.capacity) {
        staged.overflow = true; return;
    }
    staged_frame_t *frame = &staged.frames[staged.count++];
    memcpy(frame->bytes, bytes, length); frame->length = length;
}
static void ready(void) {
    memcpy(queue[0].bytes, "AXP_READY", 9);
    queue[0].length = 9; queue[0].offset = 0;
    first = 0; count = 1; schedule();
}
static void transmit(struct ble_npl_event *event) {
    (void)event;
    if (fenced || !subscribed || !count || connection == BLE_HS_CONN_HANDLE_NONE) return;
    uint16_t mtu = ble_att_mtu(connection);
    if (mtu < 23) { fence(); return; } /* Invalid negotiated ATT MTU. */
    size_t chunk = mtu - 3;
    if (chunk > 244) chunk = 244;
    size_t remaining = queue[first].length - queue[first].offset;
    if (chunk > remaining) chunk = remaining;
    struct os_mbuf *packet = ble_hs_mbuf_from_flat(queue[first].bytes + queue[first].offset, chunk);
    /* notify_custom consumes its mbuf on success AND error. */
    int rc = packet ? ble_gatts_notify_custom(connection, notify_handle, packet) : BLE_HS_ENOMEM;
    if (rc) {
        if (++retries >= 10) { fence(); return; }
    } else {
        retries = 0; queue[first].offset += chunk;
        if (queue[first].offset == queue[first].length) { first = (first + 1) % 4; --count; }
    }
    if (count) schedule();
}
static int access_characteristic(uint16_t conn, uint16_t handle, struct ble_gatt_access_ctxt *context, void *argument) {
    (void)handle; (void)argument;
    if (context->op != BLE_GATT_ACCESS_OP_WRITE_CHR || conn != connection || !subscribed || fenced) return BLE_ATT_ERR_WRITE_NOT_PERMITTED;
    uint16_t length = OS_MBUF_PKTLEN(context->om); uint8_t bytes[244];
    if (!length || length > sizeof(bytes)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(context->om, bytes, sizeof(bytes), NULL)) return BLE_ATT_ERR_UNLIKELY;
    staged.device = peer;
    /* apex_device_t embeds a stream whose context points to its owning device.
     * A shallow copy alone would dispatch through and mutate the live device. */
    staged.device.stream.context = &staged.device;
    staged.device.output = collect; staged.device.context = NULL;
    staged.count = 0; staged.capacity = 4 - count; staged.overflow = false;
    apex_device_feed(&staged.device, bytes, length);
    if (staged.overflow) return BLE_ATT_ERR_INSUFFICIENT_RES;
    /* Commit parser and every generated response together. Rejected writes
     * leave the parser, queue and existing retry deadline completely intact.
     * This is valid ONLY while portable dispatch has no external side effects. */
    peer = staged.device; peer.stream.context = &peer;
    peer.output = NULL; peer.context = NULL;
    bool was_empty = count == 0;
    for (unsigned i = 0; i < staged.count; ++i) {
        unsigned slot = (first + count++) % 4;
        memcpy(queue[slot].bytes, staged.frames[i].bytes, staged.frames[i].length);
        queue[slot].length = staged.frames[i].length; queue[slot].offset = 0;
    }
    if (was_empty && count) schedule();
    return fenced ? BLE_ATT_ERR_UNLIKELY : 0;
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
    if (connection != BLE_HS_CONN_HANDLE_NONE) return;
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
        /* Do not let duplicate/foreign connection callbacks reset a live stream. */
        if (connection != BLE_HS_CONN_HANDLE_NONE) {
            if (event->connect.status == 0 && event->connect.conn_handle != connection)
                (void)ble_gap_terminate(event->connect.conn_handle, BLE_ERR_REM_USER_CONN_TERM);
            break;
        }
        reset_peer();
        if (event->connect.status == 0) connection = event->connect.conn_handle;
        else advertise();
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        if (event->disconnect.conn.conn_handle != connection) break;
        reset_peer(); connection = BLE_HS_CONN_HANDLE_NONE; advertise(); break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.conn_handle == connection && event->subscribe.attr_handle == notify_handle && !fenced) {
            if (event->subscribe.cur_notify && !subscribed) {
                subscribed = true; ready();
            } else if (!event->subscribe.cur_notify && subscribed) {
                /* Re-enable requires a NEW connection; never silently restart
                 * framed bytes or insert another READY into this stream. */
                fence();
            }
        }
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        if (connection == BLE_HS_CONN_HANDLE_NONE) advertise();
        break;
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
    /* No destructive recovery. Initialization errors stop startup. */
    ESP_ERROR_CHECK(result); ESP_ERROR_CHECK(nimble_port_init());
    ble_hs_cfg.sync_cb = synchronised;
    ble_svc_gap_init(); ble_svc_gatt_init();
    ESP_ERROR_CHECK(ble_svc_gap_device_name_set("APEX Laboratory"));
    ESP_ERROR_CHECK(ble_gatts_count_cfg(services)); ESP_ERROR_CHECK(ble_gatts_add_svcs(services));
    apex_device_init(&peer, NULL, NULL);
    /* Pinned FreeRTOS NPL returns -1 on allocation/timer creation failure.
     * Abort startup before the host task can subscribe and reset a null timer.
     * No cleanup/retry is attempted after partial NimBLE initialization. */
    ESP_ERROR_CHECK(ble_npl_callout_init(&tx_timer, nimble_port_get_dflt_eventq(), transmit, NULL));
    nimble_port_freertos_init(host_task);
}

#else
/* Historical USB app_main calls this symbol; default build starts no radio. */
void apex_ble_start(void) {}
#endif
