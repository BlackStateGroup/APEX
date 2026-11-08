#ifndef APEX_BOUNDED_ESP_HAL_H
#define APEX_BOUNDED_ESP_HAL_H
#include <Hal.h>
#include "driver/spi_master.h"

// Dedicated SPI2 bus, queue depth one, finite 10 ms queue/ACK waits. No ISR, tone,
// shared-bus takeover, SPI retries or RF commands. ReceiveOnlyHal wraps this.
class BoundedEspHal final : public RadioLibHal {
 public:
  BoundedEspHal(int sck, int miso, int mosi);
  int16_t init() override;
  int16_t term() override;
  void pinMode(uint32_t pin, uint32_t mode) override;
  void digitalWrite(uint32_t pin, uint32_t value) override;
  uint32_t digitalRead(uint32_t pin) override;
  void attachInterrupt(uint32_t, void (*)(void), uint32_t) override;
  void detachInterrupt(uint32_t) override {}
  void delay(RadioLibTime_t ms) override;
  void delayMicroseconds(RadioLibTime_t us) override;
  RadioLibTime_t millis() override;
  RadioLibTime_t micros() override;
  long pulseIn(uint32_t, uint32_t, RadioLibTime_t) override;
  int16_t spiBegin() override { return init(); }
  void spiBeginTransaction() override {}
  int16_t spiTransfer(uint8_t* out, size_t length, uint8_t* in) override;
  void spiEndTransaction() override {}
  int16_t spiEnd() override { return term(); }
  void yield() override;
 private:
  int sck_, miso_, mosi_;
  spi_device_handle_t device_ = nullptr;
  bool bus_ = false, pending_ = false;
  int16_t failure_ = 0;
  alignas(4) uint8_t tx_[64]{}, rx_[64]{};
  spi_transaction_t transaction_{};
  int16_t check(esp_err_t status);
};
#endif
