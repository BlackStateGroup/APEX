#include "sdkconfig.h"
#if defined(CONFIG_BT_ENABLED) || defined(CONFIG_ESP_WIFI_ENABLED)
#error "The signed-read lab target must not enable Bluetooth or Wi-Fi"
#endif

#ifdef CONFIG_APEX_SIGNED_READ_LAB_OPT_IN
#include "lab_peer.h"
#include "monocypher.h"
#include "driver/usb_serial_jtag.h"
#include "esp_partition.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static apex_lab_peer_t peer;
static int transport_failed;

static void output(const uint8_t *bytes, size_t length, void *context) {
    size_t offset = 0;
    (void)context;
    while (offset < length) {
        int count = usb_serial_jtag_write_bytes(bytes + offset, length - offset, pdMS_TO_TICKS(100));
        if (count <= 0 || (size_t)count > length - offset) {
            transport_failed = 1;
            apex_lab_peer_close(&peer);
            return;
        }
        offset += (size_t)count;
    }
}

void app_main(void) {
    static uint8_t record[APEX_LAB_KEY_IMAGE_SIZE];
    const esp_partition_t *partition = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, 0x40, "lab_keys");
    /* No NVS initialisation, erase, writes, default keys, key generation or
     * provisioning endpoint. The partition image is supplied offline. */
    int ready = partition && partition->readonly && partition->size == 0x1000 &&
        esp_partition_read(partition, 0, record, sizeof(record)) == ESP_OK &&
        apex_lab_peer_init_record(&peer, 1, record, sizeof(record), output, NULL);
    crypto_wipe(record, sizeof(record));
    if (!ready) { apex_lab_peer_close(&peer); return; }
    usb_serial_jtag_driver_config_t config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
    config.tx_buffer_size = 1024; config.rx_buffer_size = 1024;
    if (usb_serial_jtag_driver_install(&config) != ESP_OK) { apex_lab_peer_close(&peer); return; }
    uint8_t bytes[256];
    while (peer.active && !transport_failed) {
        int count = usb_serial_jtag_read_bytes(bytes, sizeof(bytes), pdMS_TO_TICKS(50));
        if (count < 0) break;
        if (count > 0) apex_lab_peer_feed(&peer, bytes, (size_t)count);
        vTaskDelay(1);
    }
    apex_lab_peer_close(&peer);
    crypto_wipe(bytes, sizeof(bytes));
    (void)usb_serial_jtag_driver_uninstall();
}
#else
void app_main(void) { /* No key reads or USB service without explicit opt-in. */ }
#endif
