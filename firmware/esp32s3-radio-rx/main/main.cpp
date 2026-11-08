#include "bounded_esp_hal.h"
#include "cc1101_receiver.h"
#include "driver/gpio.h"
#include "driver/usb_serial_jtag.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

namespace {
#ifdef CONFIG_APEX_RADIO_RX_ENABLE
constexpr bool enabled = true;
constexpr int pins[] = {CONFIG_APEX_RADIO_SCK, CONFIG_APEX_RADIO_MISO, CONFIG_APEX_RADIO_MOSI, CONFIG_APEX_RADIO_CS, CONFIG_APEX_RADIO_GDO0};
constexpr bool valid_pins() {
  for (unsigned i = 0; i < 5; ++i) {
    if (pins[i] < 0 || pins[i] > 48 || pins[i] == 19 || pins[i] == 20) return false;
    for (unsigned j = 0; j < i; ++j) if (pins[i] == pins[j]) return false;
  }
  return true;
}
static_assert(valid_pins(), "Select distinct reviewed pins; GPIO19/20 belong to USB");
static_assert(GPIO_IS_VALID_OUTPUT_GPIO(CONFIG_APEX_RADIO_CS), "CS must be an output-capable pin");
static_assert(GPIO_IS_VALID_GPIO(CONFIG_APEX_RADIO_GDO0), "GDO0 must be a valid input pin");
#else
constexpr bool enabled = false;
#endif
std::uint64_t clock_ms(void*) { return std::uint64_t(esp_timer_get_time() / 1000); }
bool output(const std::uint8_t* bytes, std::size_t length, void*) {
  const auto deadline = esp_timer_get_time() + 25000;
  std::size_t offset = 0;
  while (offset < length) {
    if (esp_timer_get_time() >= deadline) return false;
    const int n = usb_serial_jtag_write_bytes(bytes + offset, length - offset, pdMS_TO_TICKS(5));
    if (n <= 0 || std::size_t(n) > length - offset) return false;
    offset += std::size_t(n);
  }
  return esp_timer_get_time() < deadline;
}
}
extern "C" void app_main() {
  // Static storage keeps SPI buffers valid even after an uncertain timeout.
  static BoundedEspHal platform(CONFIG_APEX_RADIO_SCK, CONFIG_APEX_RADIO_MISO, CONFIG_APEX_RADIO_MOSI);
  static apex::rx::Cc1101Receiver receiver(platform, CONFIG_APEX_RADIO_CS, CONFIG_APEX_RADIO_GDO0);
  static apex::rx::Service service(receiver, clock_ms, nullptr, output, nullptr, enabled);
  usb_serial_jtag_driver_config_t config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
  config.tx_buffer_size = 1024; config.rx_buffer_size = 1024;
  if (usb_serial_jtag_driver_install(&config) != ESP_OK) return;
  std::uint8_t bytes[128]{};
  for (;;) {
    if (service.transport_failed()) { service.shutdown(); for (;;) vTaskDelay(pdMS_TO_TICKS(1000)); }
    service.tick();
    const int n = usb_serial_jtag_read_bytes(bytes, sizeof(bytes), pdMS_TO_TICKS(5));
    if (n > 0) service.feed(bytes, std::size_t(n));
    else if (n < 0) service.fail_transport();
    vTaskDelay(1);
  }
}
