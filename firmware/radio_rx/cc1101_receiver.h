#ifndef APEX_CC1101_RECEIVER_H
#define APEX_CC1101_RECEIVER_H
#include "rx_service.h"
#include "receive_only_hal.h"
#include <modules/CC1101/CC1101.h>
namespace apex::rx {
// Fixed profile 1: 433.920 MHz, 2-FSK 4.8 kbit/s, +/-5 kHz, 58 kHz RX BW,
// 16-bit preamble, 0x12AD sync, variable packet length <=60, CRC filtering.
// This is one explicit lab packet format, not a universal RF decoder.
class Cc1101Receiver final : public Receiver {
 public:
  Cc1101Receiver(RadioLibHal& platform, std::uint32_t cs, std::uint32_t irq);
  bool initialize() override;
  bool arm() override;
  Reception poll(Packet& packet) override;
  bool stop() override;
  std::int16_t error() const override { return guarded_.healthy() ? error_ : guarded_.failure(); }
 private:
  ReceiveOnlyHal guarded_;
  Module module_;
  CC1101 radio_;
  std::uint32_t irq_;
  std::int16_t error_ = 0;
  bool initialized_ = false, armed_ = false;
  bool checked(std::int16_t result);
};
}
#endif
