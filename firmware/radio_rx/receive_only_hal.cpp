#include "receive_only_hal.h"
#include <cstring>
namespace apex::rx {
namespace { constexpr std::int16_t denied = -11001; }
bool allowed_cc1101_transfer(const std::uint8_t* bytes, std::size_t length) {
  if (!bytes || !length || length > 64) return false;
  const auto command = bytes[0];
  if (length == 1) {
    // Reset, calibration, RX, idle, power-down, FIFO flush, and no-op only.
    // Explicitly excludes STX (0x35), SFSTXON (0x31), wake-on-radio and XOFF.
    return command == 0x30 || command == 0x33 || command == 0x34 || command == 0x36 ||
      command == 0x39 || command == 0x3a || command == 0x3b || command == 0x3d;
  }
  const std::uint8_t address = command & 0x3f;
  const bool burst = (command & 0x40) != 0;
  if (!burst && length != 2) return false;
  if (command & 0x80) {
    // 0x30..0x3d share addresses with command strobes. Status reads must use
    // the documented burst bit, exactly one returned byte, never 0xb5/STX.
    if (address >= 0x30 && address <= 0x3d) return burst && length == 2;
    if (address == 0x3e) return length <= 9;
    if (address == 0x3f) return true; // RX FIFO read, bounded above to 63 bytes.
    return address <= 0x2e && std::size_t(address) + length - 2 <= 0x2e;
  }
  // No TX FIFO writes, no command strobes disguised as register writes.
  if (address == 0x3f || (address > 0x2e && address != 0x3e)) return false;
  if (address == 0x3e) return length <= 9; // PA table configuration is not RF TX.
  if (std::size_t(address) + length - 2 > 0x2e) return false;
  for (std::size_t i = 1; i < length; ++i) {
    const auto reg = std::uint8_t(address + i - 1);
    // RXOFF/TXOFF must both stay idle. Reject automatic transitions to TX/FSTXON.
    if (reg == 0x17 && (bytes[i] & 0x0f)) return false; // MCSM1
    // Disable GDO pin-controlled TX as well as software strobes.
    if (reg == 0x18 && (bytes[i] & 0x02)) return false; // MCSM0
    // No synchronous/asynchronous/random modem output modes.
    if (reg == 0x08 && (bytes[i] & 0x30)) return false; // PKTCTRL0.PKT_FORMAT
  }
  return true;
}
ReceiveOnlyHal::ReceiveOnlyHal(RadioLibHal& platform, std::uint32_t cs, std::uint32_t irq)
  : RadioLibHal(platform.GpioModeInput, platform.GpioModeOutput, platform.GpioLevelLow,
      platform.GpioLevelHigh, platform.GpioInterruptRising, platform.GpioInterruptFalling),
    platform_(platform), cs_(cs), irq_(irq) {}
std::int16_t ReceiveOnlyHal::latch(std::int16_t status) {
  if (status && !failure_) failure_ = status;
  return failure_;
}
void ReceiveOnlyHal::pinMode(std::uint32_t pin, std::uint32_t mode) {
  if (!healthy()) return;
  if ((pin == cs_ && mode == GpioModeOutput) || (pin == irq_ && mode == GpioModeInput)) platform_.pinMode(pin, mode);
  else latch(denied);
}
void ReceiveOnlyHal::digitalWrite(std::uint32_t pin, std::uint32_t value) {
  // Deselect is still permitted following a failed/uncertain SPI operation.
  if (pin == cs_ && (value == GpioLevelHigh || (healthy() && value == GpioLevelLow))) platform_.digitalWrite(pin, value);
  else if (healthy()) latch(denied);
}
std::uint32_t ReceiveOnlyHal::digitalRead(std::uint32_t pin) {
  if (!healthy()) return GpioLevelLow;
  if (pin != irq_) { latch(denied); return GpioLevelLow; }
  return platform_.digitalRead(pin);
}
void ReceiveOnlyHal::attachInterrupt(std::uint32_t, void (*)(void), std::uint32_t) { latch(denied); }
long ReceiveOnlyHal::pulseIn(std::uint32_t, std::uint32_t, RadioLibTime_t) { latch(denied); return 0; }
void ReceiveOnlyHal::delay(RadioLibTime_t ms) { if (ms > 250) latch(denied); else platform_.delay(ms); }
void ReceiveOnlyHal::delayMicroseconds(RadioLibTime_t us) { if (us > 10000) latch(denied); else platform_.delayMicroseconds(us); }
std::int16_t ReceiveOnlyHal::spiBegin() { return healthy() ? latch(platform_.spiBegin()) : failure_; }
void ReceiveOnlyHal::spiBeginTransaction() { if (healthy()) platform_.spiBeginTransaction(); }
std::int16_t ReceiveOnlyHal::spiTransfer(std::uint8_t* out, std::size_t length, std::uint8_t* in) {
  if (in && length <= 64) std::memset(in, 0, length);
  if (!healthy()) return failure_;
  if (!in || !allowed_cc1101_transfer(out, length)) return latch(denied);
  return latch(platform_.spiTransfer(out, length, in));
}
void ReceiveOnlyHal::spiEndTransaction() { platform_.spiEndTransaction(); }
std::int16_t ReceiveOnlyHal::spiEnd() { return latch(platform_.spiEnd()); }
std::int16_t ReceiveOnlyHal::init() { return healthy() ? latch(platform_.init()) : failure_; }
std::int16_t ReceiveOnlyHal::term() { return latch(platform_.term()); }
}
