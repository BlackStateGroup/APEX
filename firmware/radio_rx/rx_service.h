#ifndef APEX_RADIO_RX_SERVICE_H
#define APEX_RADIO_RX_SERVICE_H
#include <cstddef>
#include <cstdint>
extern "C" {
#include "../core/apex.h"
}

namespace apex::rx {
constexpr std::size_t packet_bytes = 60, queue_packets = 8;
constexpr std::uint16_t max_events = 64, min_duration_ms = 50, max_duration_ms = 30000;
constexpr std::uint8_t start_opcode = 0x60, poll_opcode = 0x61, stop_opcode = 0x62;
struct Packet {
  std::uint8_t bytes[packet_bytes]{};
  std::uint8_t length = 0, lqi = 0;
  std::int16_t rssi_tenths_dbm = 0;
  std::uint32_t elapsed_ms = 0;
};
enum class Reception { none, packet, crc_rejected, length_rejected, failure };
class Receiver {
 public:
  virtual ~Receiver() = default;
  virtual bool initialize() = 0;
  virtual bool arm() = 0;
  virtual Reception poll(Packet& packet) = 0;
  virtual bool stop() = 0;
  virtual std::int16_t error() const = 0;
};
enum class State : std::uint8_t { idle, running, stopped, expired, event_limit, fault };
using Clock = std::uint64_t (*)(void*);
// Synchronous, non-reentrant output. Return true only after the whole frame was
// accepted within the transport deadline. False (including a partial write) is
// terminal; the service must never retry that frame or accept further commands.
using Output = bool (*)(const std::uint8_t*, std::size_t, void*);

// Single-task owner. No ISR callbacks, allocations, RF transmission, or implicit re-arm.
class Service {
 public:
  Service(Receiver& receiver, Clock clock, void* clock_context,
          Output output, void* output_context, bool enabled = true);
  void feed(const std::uint8_t* bytes, std::size_t length);
  void tick();
  void shutdown();
  void fail_transport();
  bool transport_failed() const { return transport_failed_; }
  State state() const { return state_; }
 private:
  Receiver& receiver_;
  Clock clock_;
  void* clock_context_;
  Output output_;
  void* output_context_;
  apex_stream_t stream_{};
  Packet queue_[queue_packets]{};
  std::size_t head_ = 0, queued_ = 0;
  State state_ = State::idle;
  std::uint32_t capture_ = 0;
  std::uint64_t started_ = 0, deadline_ = 0, last_clock_ = 0;
  std::uint16_t limit_ = 0, observed_ = 0, accepted_ = 0, dropped_ = 0, rejected_ = 0;
  bool initialized_ = false, have_clock_ = false;
  bool transport_failed_ = false;
  bool enabled_;
  static void receive(const apex_frame_t* frame, void* self);
  void dispatch(const apex_frame_t& frame);
  bool now(std::uint64_t& value);
  void finish(State state);
  void respond(const apex_frame_t& request, bool take_packet);
  void json(const apex_frame_t& request, const char* text, bool error = false);
  void send(const apex_frame_t& response);
};
}
#endif
