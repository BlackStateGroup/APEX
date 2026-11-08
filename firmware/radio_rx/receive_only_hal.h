#ifndef APEX_RECEIVE_ONLY_HAL_H
#define APEX_RECEIVE_ONLY_HAL_H
#include <Hal.h>
#include <cstdint>
#include <cstddef>

namespace apex::rx {
// CC1101-specific SPI firewall. This is not a general-purpose RadioLib HAL.
bool allowed_cc1101_transfer(const std::uint8_t* bytes, std::size_t length);
class ReceiveOnlyHal final : public RadioLibHal {
 public:
  ReceiveOnlyHal(RadioLibHal& platform, std::uint32_t cs, std::uint32_t irq);
  bool healthy() const { return failure_ == 0; }
  std::int16_t failure() const { return failure_; }
  void pinMode(std::uint32_t pin, std::uint32_t mode) override;
  void digitalWrite(std::uint32_t pin, std::uint32_t value) override;
  std::uint32_t digitalRead(std::uint32_t pin) override;
  void attachInterrupt(std::uint32_t, void (*)(void), std::uint32_t) override;
  void detachInterrupt(std::uint32_t) override {}
  void delay(RadioLibTime_t ms) override;
  void delayMicroseconds(RadioLibTime_t us) override;
  RadioLibTime_t millis() override { return platform_.millis(); }
  RadioLibTime_t micros() override { return platform_.micros(); }
  long pulseIn(std::uint32_t, std::uint32_t, RadioLibTime_t) override;
  std::int16_t spiBegin() override;
  void spiBeginTransaction() override;
  std::int16_t spiTransfer(std::uint8_t* out, std::size_t length, std::uint8_t* in) override;
  void spiEndTransaction() override;
  std::int16_t spiEnd() override;
  std::int16_t init() override;
  std::int16_t term() override;
  void yield() override { platform_.yield(); }
 private:
  RadioLibHal& platform_;
  std::uint32_t cs_, irq_;
  std::int16_t failure_ = 0;
  std::int16_t latch(std::int16_t status);
};
}
#endif
