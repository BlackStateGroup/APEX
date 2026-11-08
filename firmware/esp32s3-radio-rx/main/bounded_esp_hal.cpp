#include "bounded_esp_hal.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>

BoundedEspHal::BoundedEspHal(int sck, int miso, int mosi)
  : RadioLibHal(GPIO_MODE_INPUT, GPIO_MODE_OUTPUT, 0, 1, GPIO_INTR_POSEDGE, GPIO_INTR_NEGEDGE),
    sck_(sck), miso_(miso), mosi_(mosi) {}
int16_t BoundedEspHal::check(esp_err_t status) {
  if (status != ESP_OK && !failure_) failure_ = -11002;
  return failure_;
}
int16_t BoundedEspHal::init() {
  if (failure_ || device_) return failure_;
  if (!GPIO_IS_VALID_OUTPUT_GPIO(sck_) || !GPIO_IS_VALID_GPIO(miso_) || !GPIO_IS_VALID_OUTPUT_GPIO(mosi_)) return check(ESP_ERR_INVALID_ARG);
  spi_bus_config_t bus{};
  bus.sclk_io_num = sck_; bus.miso_io_num = miso_; bus.mosi_io_num = mosi_;
  bus.quadwp_io_num = -1; bus.quadhd_io_num = -1;
  bus.data4_io_num = -1; bus.data5_io_num = -1; bus.data6_io_num = -1; bus.data7_io_num = -1;
  bus.max_transfer_sz = sizeof(tx_);
  // Existing bus ownership is an error, not permission to share/reconfigure it.
  if (check(spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_DISABLED))) return failure_;
  bus_ = true;
  spi_device_interface_config_t config{};
  config.clock_speed_hz = 1000000; config.mode = 0; config.spics_io_num = -1; config.queue_size = 1;
  if (check(spi_bus_add_device(SPI2_HOST, &config, &device_))) { spi_bus_free(SPI2_HOST); bus_ = false; }
  return failure_;
}
void BoundedEspHal::pinMode(uint32_t pin, uint32_t mode) {
  if (!failure_) check(gpio_set_direction(static_cast<gpio_num_t>(pin), static_cast<gpio_mode_t>(mode)));
}
void BoundedEspHal::digitalWrite(uint32_t pin, uint32_t value) {
  check(gpio_set_level(static_cast<gpio_num_t>(pin), value));
}
uint32_t BoundedEspHal::digitalRead(uint32_t pin) {
  return failure_ ? 0 : uint32_t(gpio_get_level(static_cast<gpio_num_t>(pin)));
}
void BoundedEspHal::attachInterrupt(uint32_t, void (*)(void), uint32_t) { check(ESP_ERR_NOT_SUPPORTED); }
long BoundedEspHal::pulseIn(uint32_t, uint32_t, RadioLibTime_t) { check(ESP_ERR_NOT_SUPPORTED); return 0; }
void BoundedEspHal::delay(RadioLibTime_t ms) { if (ms) vTaskDelay(pdMS_TO_TICKS(ms) ? pdMS_TO_TICKS(ms) : 1); }
void BoundedEspHal::delayMicroseconds(RadioLibTime_t us) { esp_rom_delay_us(uint32_t(us)); }
RadioLibTime_t BoundedEspHal::millis() { return RadioLibTime_t(esp_timer_get_time() / 1000); }
RadioLibTime_t BoundedEspHal::micros() { return RadioLibTime_t(esp_timer_get_time()); }
void BoundedEspHal::yield() { vTaskDelay(1); }
int16_t BoundedEspHal::spiTransfer(uint8_t* out, size_t length, uint8_t* in) {
  if (failure_) return failure_;
  if (!device_ || pending_ || !out || !in || !length || length > sizeof(tx_)) return check(ESP_ERR_INVALID_STATE);
  std::memcpy(tx_, out, length); std::memset(rx_, 0, sizeof(rx_));
  transaction_ = {}; transaction_.length = length * 8; transaction_.tx_buffer = tx_; transaction_.rx_buffer = rx_;
  const auto wait = pdMS_TO_TICKS(10) ? pdMS_TO_TICKS(10) : 1;
  if (check(spi_device_queue_trans(device_, &transaction_, wait))) return failure_;
  pending_ = true;
  spi_transaction_t* completed = nullptr;
  if (check(spi_device_get_trans_result(device_, &completed, wait))) return failure_;
  pending_ = false;
  if (completed != &transaction_) return check(ESP_ERR_INVALID_STATE);
  std::memcpy(in, rx_, length); return 0;
}
int16_t BoundedEspHal::term() {
  // Do not free buffers/device while an uncertain queued transaction owns them.
  if (pending_) {
    spi_transaction_t* completed = nullptr;
    if (spi_device_get_trans_result(device_, &completed, 0) != ESP_OK) return check(ESP_ERR_TIMEOUT);
    pending_ = false;
  }
  if (device_) { check(spi_bus_remove_device(device_)); device_ = nullptr; }
  if (bus_) { check(spi_bus_free(SPI2_HOST)); bus_ = false; }
  return failure_;
}
