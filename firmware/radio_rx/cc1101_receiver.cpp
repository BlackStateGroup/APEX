#include "cc1101_receiver.h"
namespace apex::rx {
Cc1101Receiver::Cc1101Receiver(RadioLibHal& platform, std::uint32_t cs, std::uint32_t irq)
  : guarded_(platform, cs, irq), module_(&guarded_, cs, irq, RADIOLIB_NC), radio_(&module_), irq_(irq) {}
bool Cc1101Receiver::checked(std::int16_t result) {
  if (!guarded_.healthy()) { error_ = guarded_.failure(); return false; }
  if (result != RADIOLIB_ERR_NONE) { error_ = result; return false; }
  return true;
}
bool Cc1101Receiver::initialize() {
  if (initialized_ || error()) return false;
  ConfigFSK_t config{};
  config.frequency = 433920000; config.bitRate = 4800;
  config.frequencyDeviation = 5000; config.receiverBandwidth = 58000;
  config.power = -30; config.preambleLength = 16;
  if (!checked(radio_.begin(config)) || !checked(radio_.variablePacketLengthMode(packet_bytes)) ||
      !checked(radio_.setCrcFiltering(true)) || !checked(radio_.standby())) return false;
  initialized_ = true; return true;
}
bool Cc1101Receiver::arm() {
  if (!initialized_ || error() || armed_) return false;
  if (!checked(radio_.startReceive())) return false;
  armed_ = true; return true;
}
Reception Cc1101Receiver::poll(Packet& packet) {
  if (!initialized_ || !armed_ || error()) return Reception::failure;
  if (!guarded_.digitalRead(irq_)) return guarded_.healthy() ? Reception::none : Reception::failure;
  // <=60 bytes plus length/status fits the 64-byte FIFO. Thus GDO0 indicates
  // packet end, rather than an intermediate FIFO-full event requiring ISR drain.
  const auto length = radio_.getPacketLength();
  if (!guarded_.healthy()) return Reception::failure;
  if (!length || length > packet_bytes) {
    error_ = RADIOLIB_ERR_PACKET_TOO_LONG; stop(); return Reception::failure;
  }
  packet = Packet{};
  const auto result = radio_.readData(packet.bytes, length);
  armed_ = false;
  if (!guarded_.healthy()) { error_ = guarded_.failure(); return Reception::failure; }
  if (result == RADIOLIB_ERR_CRC_MISMATCH) return Reception::crc_rejected;
  if (!checked(result)) return Reception::failure;
  packet.length = std::uint8_t(length);
  packet.rssi_tenths_dbm = std::int16_t(radio_.getRSSI() * 10.0f);
  packet.lqi = radio_.getLQI();
  return Reception::packet;
}
bool Cc1101Receiver::stop() {
  armed_ = false;
  if (!guarded_.healthy()) return false;
  return checked(radio_.finishReceive());
}
}
