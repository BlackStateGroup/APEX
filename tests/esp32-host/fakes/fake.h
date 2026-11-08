#ifndef APEX_HOST_FAKE_H
#define APEX_HOST_FAKE_H
/* Deliberately minimal behavioral doubles, NOT SDK declarations or ABI evidence. */
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#define BLE_HS_CONN_HANDLE_NONE 65535
#define BLE_ERR_REM_USER_CONN_TERM 19
#define BLE_HS_ENOMEM 6
#define BLE_ATT_ERR_WRITE_NOT_PERMITTED 3
#define BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN 13
#define BLE_ATT_ERR_UNLIKELY 14
#define BLE_GATT_ACCESS_OP_WRITE_CHR 2
#define BLE_GATT_SVC_TYPE_PRIMARY 1
#define BLE_GATT_CHR_F_WRITE 8
#define BLE_GATT_CHR_F_NOTIFY 16
#define BLE_HS_ADV_F_DISC_GEN 2
#define BLE_HS_ADV_F_BREDR_UNSUP 4
#define BLE_GAP_CONN_MODE_UND 1
#define BLE_GAP_DISC_MODE_GEN 1
#define BLE_HS_FOREVER -1
#define BLE_GAP_EVENT_CONNECT 1
#define BLE_GAP_EVENT_DISCONNECT 2
#define BLE_GAP_EVENT_SUBSCRIBE 3
#define BLE_GAP_EVENT_ADV_COMPLETE 4
#define ESP_ERR_NVS_NO_FREE_PAGES 1
#define ESP_ERR_NVS_NEW_VERSION_FOUND 2
#define ESP_ERROR_CHECK(x) do { assert((x) == 0); } while (0)
typedef int esp_err_t;
typedef struct { uint8_t type; } ble_uuid_t;
typedef struct { ble_uuid_t u; uint8_t value[16]; } ble_uuid128_t;
#define BLE_UUID128_INIT(...) { {128}, {__VA_ARGS__} }
struct ble_npl_event { int unused; };
struct ble_npl_callout { int pending; };
struct os_mbuf { uint16_t len; uint8_t bytes[524]; };
#define OS_MBUF_PKTLEN(m) ((m)->len)
struct ble_gatt_access_ctxt { int op; struct os_mbuf *om; };
struct ble_gatt_chr_def { const ble_uuid_t *uuid; int (*access_cb)(uint16_t,uint16_t,struct ble_gatt_access_ctxt *,void *); uint16_t *val_handle; int flags; };
struct ble_gatt_svc_def { int type; const ble_uuid_t *uuid; struct ble_gatt_chr_def *characteristics; };
struct ble_hs_adv_fields { int flags; ble_uuid128_t *uuids128; int num_uuids128,uuids128_is_complete; uint8_t *name; size_t name_len; int name_is_complete; };
struct ble_gap_adv_params { int conn_mode, disc_mode; };
struct ble_gap_event { int type; struct { int status; uint16_t conn_handle; } connect; struct { uint16_t conn_handle, attr_handle; int cur_notify; } subscribe; };
static struct { void (*sync_cb)(void); } ble_hs_cfg;
static unsigned term_calls, notify_calls, allocations, frees, schedules, adv_calls;
static int term_rc, notify_rc, alloc_fail, flatten_fail;
static uint16_t fake_mtu=23;
static uint8_t delivered[32768];
static size_t delivered_len, chunks[2048], chunks_len;
static int ble_gap_terminate(uint16_t c,int r) { (void)c;(void)r;term_calls++;return term_rc; }
static void ble_npl_callout_stop(struct ble_npl_callout *c) { c->pending=0; }
static int ble_npl_callout_reset(struct ble_npl_callout *c,unsigned t) { assert(t==5); c->pending=1;schedules++;return 0; }
static unsigned ble_npl_time_ms_to_ticks32(unsigned t) {return t;}
static uint16_t ble_att_mtu(uint16_t c) {(void)c;return fake_mtu;}
static struct os_mbuf *ble_hs_mbuf_from_flat(const void *p,size_t n) {
    if(alloc_fail)return NULL;
    assert(n<=524);struct os_mbuf *m=malloc(sizeof(*m));assert(m);
    allocations++;m->len=(uint16_t)n;memcpy(m->bytes,p,n);return m;
}
static int ble_gatts_notify_custom(uint16_t c,uint16_t h,struct os_mbuf *m) {
    (void)c;(void)h;notify_calls++;
    if(!notify_rc) { assert(delivered_len+m->len<=sizeof(delivered));assert(chunks_len<2048);
        memcpy(delivered+delivered_len,m->bytes,m->len);delivered_len+=m->len;chunks[chunks_len++]=m->len; }
    free(m);frees++;return notify_rc;
}
static int ble_hs_mbuf_to_flat(struct os_mbuf *m,void *p,size_t n,void *out) {
    (void)out;if(flatten_fail)return 1;assert(m->len<=n);memcpy(p,m->bytes,m->len);return 0;
}
static int ble_gap_adv_set_fields(struct ble_hs_adv_fields *f){(void)f;return 0;}
static int ble_gap_adv_rsp_set_fields(struct ble_hs_adv_fields *f){(void)f;return 0;}
static int ble_gap_adv_start(uint8_t a,void *b,int c,struct ble_gap_adv_params *d,int (*e)(struct ble_gap_event *,void *),void *f) {
    (void)a;(void)b;(void)c;(void)d;(void)e;(void)f;adv_calls++;return 0;
}
static const char *ble_svc_gap_device_name(void){return "fake";}
static int ble_hs_util_ensure_addr(int a){(void)a;return 0;}
static int ble_hs_id_infer_auto(int a,uint8_t *b){(void)a;*b=0;return 0;}
/* Startup effects are fail-closed: the harness must never enter startup. */
static void forbidden(void){abort();}
static int nvs_flash_init(void){forbidden();return 0;}
static int nvs_flash_erase(void){forbidden();return 0;}
static int nimble_port_init(void){forbidden();return 0;}
static void nimble_port_run(void){forbidden();}
static void nimble_port_freertos_deinit(void){forbidden();}
static void ble_svc_gap_init(void){forbidden();}
static void ble_svc_gatt_init(void){forbidden();}
static int ble_svc_gap_device_name_set(const char *s){(void)s;forbidden();return 0;}
static int ble_gatts_count_cfg(const struct ble_gatt_svc_def *s){(void)s;forbidden();return 0;}
static int ble_gatts_add_svcs(const struct ble_gatt_svc_def *s){(void)s;forbidden();return 0;}
static void *nimble_port_get_dflt_eventq(void){forbidden();return NULL;}
static int ble_npl_callout_init(struct ble_npl_callout *a,void *b,void(*c)(struct ble_npl_event *),void *d){(void)a;(void)b;(void)c;(void)d;forbidden();return -1;}
static void nimble_port_freertos_init(void(*f)(void *)){(void)f;forbidden();}
#endif
