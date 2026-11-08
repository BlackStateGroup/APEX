#include "rx_service.h"
#include <cstring>
#include <limits>

namespace apex::rx {
namespace {
std::uint16_t get16(const std::uint8_t* p) { return std::uint16_t(p[0] | (std::uint16_t(p[1]) << 8)); }
std::uint32_t get32(const std::uint8_t* p) { return get16(p) | (std::uint32_t(get16(p + 2)) << 16); }
void put16(std::uint8_t* p, std::uint16_t n) { p[0] = std::uint8_t(n); p[1] = std::uint8_t(n >> 8); }
void put32(std::uint8_t* p, std::uint32_t n) { put16(p, std::uint16_t(n)); put16(p + 2, std::uint16_t(n >> 16)); }
constexpr char invalid[] = "{\"code\":\"INVALID_ARGUMENT\"}";
}
Service::Service(Receiver& receiver, Clock clock, void* clock_context,
                 Output output, void* output_context, bool enabled)
    : receiver_(receiver), clock_(clock), clock_context_(clock_context),
      output_(output), output_context_(output_context), enabled_(enabled) {
  apex_stream_init(&stream_, &Service::receive, this);
  if (!output_) fail_transport();
}
bool Service::now(std::uint64_t& value) {
  if (!clock_) { finish(State::fault); return false; }
  value = clock_(clock_context_);
  if (have_clock_ && value < last_clock_) { finish(State::fault); return false; }
  last_clock_ = value; have_clock_ = true; return true;
}
void Service::finish(State state) {
  const bool must_stop = state_ == State::running;
  state_ = state;
  if (must_stop && !receiver_.stop()) state_ = State::fault;
}
void Service::shutdown() { finish(state_ == State::fault ? State::fault : State::stopped); }
void Service::fail_transport() {
  transport_failed_ = true;
  finish(State::fault);
}
void Service::feed(const std::uint8_t* bytes, std::size_t length) {
  if (transport_failed_) return;
  if (!bytes && length) { finish(State::fault); return; }
  // A caller cannot make one parser turn process an unbounded transport chunk.
  if (length > 4096) { finish(State::fault); return; }
  tick();
  // The shared parser has a void receive callback, so submit one byte at a time
  // and stop immediately when a response fails. Never dispatch a buffered START
  // after a failed reply from an earlier request in the same transport chunk.
  for (std::size_t i = 0; i < length && !transport_failed_; ++i)
    apex_stream_feed(&stream_, bytes + i, 1);
}
void Service::tick() {
  if (transport_failed_ || state_ != State::running) return;
  std::uint64_t time = 0;
  if (!now(time)) return;
  if (time >= deadline_) { finish(State::expired); return; }
  Packet packet{};
  const auto result = receiver_.poll(packet);
  if (!now(time)) return;
  // Never publish a packet collected after the capture lease expired.
  if (time >= deadline_) { finish(State::expired); return; }
  if (result == Reception::none) return;
  if (result == Reception::failure) { finish(State::fault); return; }
  ++observed_;
  if (result != Reception::packet || packet.length == 0 || packet.length > packet_bytes) {
    ++rejected_;
  } else {
    ++accepted_;
    packet.elapsed_ms = std::uint32_t(time - started_);
    if (queued_ == queue_packets) ++dropped_;
    else { queue_[(head_ + queued_) % queue_packets] = packet; ++queued_; }
  }
  if (observed_ >= limit_) finish(State::event_limit);
  else {
    if (!now(time)) return;
    if (time >= deadline_) { finish(State::expired); return; }
    if (!receiver_.arm()) finish(State::fault);
    if (state_ == State::running && now(time) && time >= deadline_) finish(State::expired);
  }
}
void Service::receive(const apex_frame_t* frame, void* self) {
  static_cast<Service*>(self)->dispatch(*frame);
}
void Service::dispatch(const apex_frame_t& request) {
  if (transport_failed_ || request.kind != APEX_REQUEST) return;
  tick();
  if (request.opcode == 1 || request.opcode == 2) {
    if (request.length) { json(request, invalid, true); return; }
    json(request, request.opcode == 1
      ? "{\"id\":\"apex-radio-rx-dev\",\"board\":\"esp32s3-cc1101\",\"firmware\":\"0.1.0-rx\",\"protocol\":1,\"source\":\"accessory\"}"
      : enabled_ ? "{\"operations\":[\"system.info\",\"system.capabilities\",\"system.ping\",\"radio.rx.start\",\"radio.rx.poll\",\"radio.rx.stop\"]}"
      : "{\"operations\":[\"system.info\",\"system.capabilities\",\"system.ping\"]}");
  } else if (request.opcode == 3) {
    auto reply = request; reply.kind = APEX_RESPONSE; send(reply);
  } else if (request.opcode == start_opcode) {
    if (!enabled_) { json(request, "{\"code\":\"NOT_CONFIGURED\"}", true); return; }
    if (request.length != 6 || request.payload[0] != 1 || request.payload[1] != 1 ||
        get16(request.payload + 2) < min_duration_ms || get16(request.payload + 2) > max_duration_ms ||
        get16(request.payload + 4) == 0 || get16(request.payload + 4) > max_events) {
      json(request, invalid, true); return;
    }
    if (state_ == State::fault || capture_ == std::numeric_limits<std::uint32_t>::max()) {
      json(request, "{\"code\":\"SESSION_CLOSED\"}", true); return;
    }
    if (state_ == State::running || queued_) { json(request, "{\"code\":\"BUSY\"}", true); return; }
    std::uint64_t time = 0;
    if (!now(time) || time > std::numeric_limits<std::uint64_t>::max() - max_duration_ms) {
      finish(State::fault); json(request, "{\"code\":\"CLOCK_FAILURE\"}", true); return;
    }
    ++capture_; started_ = time; deadline_ = time + get16(request.payload + 2);
    limit_ = get16(request.payload + 4); observed_ = accepted_ = dropped_ = rejected_ = 0;
    head_ = 0;
    if (!initialized_) {
      if (!receiver_.initialize()) { finish(State::fault); respond(request, false); return; }
      initialized_ = true;
    }
    if (!now(time)) { respond(request, false); return; }
    if (time >= deadline_) { state_ = State::expired; respond(request, false); return; }
    // Mark active before arm so any uncertain failure still attempts a safe stop.
    state_ = State::running;
    if (!receiver_.arm()) finish(State::fault);
    if (state_ == State::running && now(time) && time >= deadline_) finish(State::expired);
    respond(request, false);
  } else if (request.opcode == poll_opcode || request.opcode == stop_opcode) {
    if (request.length != 4 || !capture_ || get32(request.payload) != capture_) {
      json(request, invalid, true); return;
    }
    if (request.opcode == stop_opcode && state_ == State::running) finish(State::stopped);
    respond(request, request.opcode == poll_opcode);
  } else json(request, "{\"code\":\"UNSUPPORTED_OPERATION\"}", true);
}
void Service::respond(const apex_frame_t& request, bool take_packet) {
  apex_frame_t response{}; response.kind = APEX_RESPONSE; response.opcode = request.opcode; response.id = request.id;
  auto* p = response.payload;
  p[0] = 1; p[1] = std::uint8_t(state_); p[2] = 1;
  const bool has_packet = take_packet && queued_;
  p[3] = has_packet ? 1 : 0;
  put32(p + 4, capture_); put16(p + 8, observed_); put16(p + 10, accepted_);
  put16(p + 12, dropped_); put16(p + 14, rejected_);
  p[16] = std::uint8_t(queued_ - (has_packet ? 1 : 0));
  put32(p + 18, std::uint32_t((last_clock_ >= started_ && last_clock_ - started_ <= max_duration_ms)
    ? last_clock_ - started_ : max_duration_ms));
  put16(p + 22, std::uint16_t(receiver_.error()));
  response.length = 24;
  if (has_packet) {
    const auto& record = queue_[head_]; p[17] = record.length;
    put32(p + 24, record.elapsed_ms); put16(p + 28, std::uint16_t(record.rssi_tenths_dbm)); p[30] = record.lqi;
    std::memcpy(p + 31, record.bytes, record.length);
    response.length = std::uint16_t(31 + record.length);
    queue_[head_] = Packet{}; head_ = (head_ + 1) % queue_packets; --queued_;
  }
  send(response);
}
void Service::json(const apex_frame_t& request, const char* text, bool error) {
  apex_frame_t response{}; response.kind = error ? APEX_ERROR : APEX_RESPONSE;
  response.opcode = request.opcode; response.id = request.id;
  response.length = std::uint16_t(std::strlen(text)); std::memcpy(response.payload, text, response.length); send(response);
}
void Service::send(const apex_frame_t& response) {
  if (transport_failed_) return;
  std::uint8_t bytes[APEX_MAX_FRAME]{};
  const auto count = apex_encode(&response, bytes, sizeof(bytes));
  if (!count || !output_ || !output_(bytes, count, output_context_)) fail_transport();
}
}
