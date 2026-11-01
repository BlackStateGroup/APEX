#include "apex.h"
#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static apex_device_t device;
static void output(const uint8_t *bytes, size_t length, void *context) {
    size_t offset = 0u;
    (void)context;
    while (offset < length) {
        int count = usb_serial_jtag_write_bytes(bytes + offset, length - offset, pdMS_TO_TICKS(100));
        if (count <= 0) return; /* Host timeout reports an incomplete response. */
        offset += (size_t)count;
    }
}
void app_main(void) {
    uint8_t bytes[256];
    usb_serial_jtag_driver_config_t config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
    config.tx_buffer_size = 1024; config.rx_buffer_size = 1024;
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&config));
    apex_device_init(&device, output, NULL);
    for (;;) {
        int count = usb_serial_jtag_read_bytes(bytes, sizeof(bytes), pdMS_TO_TICKS(50));
        if (count > 0) apex_device_feed(&device, bytes, (size_t)count);
        vTaskDelay(1);
    }
}
