#include "../firmware/radio_rx/cc1101_receiver.h"
#include <array>
#include <cassert>
#include <cstring>
#include <deque>
#include <iostream>
#include <limits>
#include <vector>
using namespace apex::rx;

// Synthetic register/FIFO model, not a radio emulator or hardware observation.
class ModelHal final : public RadioLibHal {
 public:
  std::array<std::uint8_t, 64> registers{};
  std::array<std::uint8_t, 8> pa{};
  std::deque<std::uint8_t> fifo;
  std::vector<std::vector<std::uint8_t>> transactions;
  unsigned long time = 0, micro_reads = 0;
  bool rx = false, fail_next = false;
  ModelHal() : RadioLibHal(0, 1, 0, 1, 1, 2) { reset(); }
  void reset() { registers.fill(0); registers[0x31] = 0x14; registers[0x35] = 1; registers[0x17] = 0x30; fifo.clear(); rx = false; }
  void pinMode(std::uint32_t, std::uint32_t) override {}
  void digitalWrite(std::uint32_t, std::uint32_t) override {}
  std::uint32_t digitalRead(std::uint32_t) override { return fifo.empty() ? 0 : 1; }
  void attachInterrupt(std::uint32_t, void (*)(void), std::uint32_t) override { assert(false); }
  void detachInterrupt(std::uint32_t) override {}
  void delay(RadioLibTime_t n) override { time += n; }
  void delayMicroseconds(RadioLibTime_t n) override { time += (n + 999) / 1000; }
  RadioLibTime_t millis() override { return time; }
  RadioLibTime_t micros() override { return time * 1000 + ++micro_reads; }
  long pulseIn(std::uint32_t, std::uint32_t, RadioLibTime_t) override { return 0; }
  void yield() override { ++time; }
  std::int16_t spiBegin() override { return 0; }
  void spiBeginTransaction() override {}
  void spiEndTransaction() override {}
  std::int16_t spiEnd() override { return 0; }
  std::int16_t spiTransfer(std::uint8_t* out, std::size_t n, std::uint8_t* in) override {
    transactions.emplace_back(out, out + n); std::memset(in, 0, n);
    if (fail_next) { fail_next = false; return -10005; }
    const auto command = out[0];
    if (n == 1) {
      if (command == 0x30) reset();
      if (command == 0x34) { rx = true; registers[0x35] = 13; }
      if (command == 0x36) { rx = false; registers[0x35] = 1; }
      if (command == 0x3a) fifo.clear();
      return 0;
    }
    const unsigned address = command & 0x3f;
    for (std::size_t i = 1; i < n; ++i) {
      if (command & 0x80) {
        if (address == 0x3f) { if (!fifo.empty()) { in[i] = fifo.front(); fifo.pop_front(); } }
        else if (address == 0x3e) in[i] = pa.at(i - 1);
        else in[i] = registers.at(address + ((command & 0x40) ? i - 1 : 0));
      } else if (address == 0x3e) pa.at(i - 1) = out[i];
      else registers.at(address + i - 1) = out[i];
    }
    return 0;
  }
  void packet(std::vector<std::uint8_t> bytes, bool crc = true, int advertised = -1) {
    assert(rx); fifo.push_back(std::uint8_t(advertised < 0 ? bytes.size() : advertised));
    for (auto b : bytes) fifo.push_back(b);
    fifo.push_back(200); fifo.push_back(std::uint8_t((crc ? 128 : 0) | 42));
    rx = false; registers[0x35] = 1;
  }
};

struct Harness {
  ModelHal hal;
  Cc1101Receiver receiver{hal, 10, 9};
  std::vector<apex_frame_t> replies;
  apex_stream_t decoder{};
  bool fail_output = false;
  std::size_t output_attempts = 0, partial_bytes = 0;
  Service service;
  explicit Harness(bool enabled = true)
    : service(receiver, [](void* p) { return std::uint64_t(static_cast<ModelHal*>(p)->time); }, &hal,
      [](const std::uint8_t* bytes, std::size_t n, void* p) {
        auto& h = *static_cast<Harness*>(p); ++h.output_attempts;
        if (h.fail_output) {
          apex_stream_feed(&h.decoder, bytes, std::min(n, h.partial_bytes));
          return false;
        }
        apex_stream_feed(&h.decoder, bytes, n); return true;
      }, this, enabled) {
    apex_stream_init(&decoder, [](const apex_frame_t* f, void* p) { static_cast<Harness*>(p)->replies.push_back(*f); }, this);
  }
  apex_frame_t request(std::uint8_t op, std::vector<std::uint8_t> payload = {}, std::size_t split = 0) {
    apex_frame_t f{}; f.kind = APEX_REQUEST; f.opcode = op; f.id = 7; f.length = std::uint16_t(payload.size());
    std::copy(payload.begin(), payload.end(), f.payload); std::uint8_t bytes[APEX_MAX_FRAME]{};
    const auto n = apex_encode(&f, bytes, sizeof(bytes)); assert(n);
    const auto before = replies.size();
    if (split && split < n) { service.feed(bytes, split); service.feed(bytes + split, n - split); }
    else service.feed(bytes, n);
    assert(replies.size() == before + 1); assert(replies.back().id == 7); assert(replies.back().opcode == op);
    return replies.back();
  }
  apex_frame_t start(std::uint16_t ms = 1000, std::uint16_t count = 64) {
    return request(start_opcode, {1, 1, std::uint8_t(ms), std::uint8_t(ms >> 8), std::uint8_t(count), std::uint8_t(count >> 8)});
  }
  apex_frame_t poll(std::uint32_t capture = 1) { return request(poll_opcode, {std::uint8_t(capture), std::uint8_t(capture >> 8), std::uint8_t(capture >> 16), std::uint8_t(capture >> 24)}); }
  apex_frame_t stop() { return request(stop_opcode, {1,0,0,0}); }
};

void guard_tests() {
  for (unsigned command = 0; command < 256; ++command) {
    const std::uint8_t b = std::uint8_t(command);
    const bool expected = command == 0x30 || command == 0x33 || command == 0x34 || command == 0x36 || command == 0x39 || command == 0x3a || command == 0x3b || command == 0x3d;
    assert(allowed_cc1101_transfer(&b, 1) == expected);
  }
  for (auto bytes : std::vector<std::vector<std::uint8_t>>{{0x35}, {0x31}, {0xb5,0}, {0xb1,0}, {0xf5,0,0}, {0x7f,1,2}, {0x3f,1}, {0x17,2}, {0x17,8}, {0x18,2}, {0x08,0x30}, {0x56,0,0x08}, {0x6e,0,0}}) {
    assert(!allowed_cc1101_transfer(bytes.data(), bytes.size()));
    ModelHal model; ReceiveOnlyHal guard(model, 10, 9); std::uint8_t in[64]{};
    assert(guard.spiTransfer(bytes.data(), bytes.size(), in) != 0); assert(model.transactions.empty()); assert(!guard.healthy());
    std::uint8_t safe[] = {0x34}; assert(guard.spiTransfer(safe, 1, in) != 0); assert(model.transactions.empty());
  }
  assert(!allowed_cc1101_transfer(nullptr, 1));
  std::uint8_t large[65]{}; assert(!allowed_cc1101_transfer(large, sizeof(large)));
  std::uint8_t read_state[] = {0xf5, 0}; assert(allowed_cc1101_transfer(read_state, 2));
}
void linked_driver_test() {
  Harness h; assert(h.hal.transactions.empty());
  const auto initial = h.start(); assert(initial.kind == APEX_RESPONSE);
  if (initial.payload[1] != 1) {
    std::cerr << "Driver init error: " << h.receiver.error() << " after " << h.hal.transactions.size() << " SPI operations\n";
    for (std::size_t i = 0; i < std::min<std::size_t>(50, h.hal.transactions.size()); ++i) {
      for (auto byte : h.hal.transactions[i]) std::cerr << std::hex << unsigned(byte) << ' ';
      std::cerr << '\n';
    }
  }
  assert(initial.payload[1] == 1); assert(h.hal.rx);
  assert(h.hal.registers[6] == 60); assert((h.hal.registers[8] & 7) == 5); assert(h.hal.registers[4] == 0x12 && h.hal.registers[5] == 0xad);
  h.hal.packet({1,2,3}); const auto response = h.poll();
  assert(response.length == 34 && response.payload[3] == 1 && response.payload[17] == 3);
  assert(response.payload[30] == 42); assert(std::memcmp(response.payload + 31, "\1\2\3", 3) == 0);
  assert(response.payload[28] == 4 && response.payload[29] == 0xfc); // -102.0 dBm, synthetic.
  assert(h.hal.rx); h.stop(); assert(!h.hal.rx); assert(h.service.state() == State::stopped);
  for (const auto& bytes : h.hal.transactions) assert(allowed_cc1101_transfer(bytes.data(), bytes.size()));
  assert(h.poll().payload[3] == 0);
}
void protocol_tests() {
  for (std::size_t split = 1; split < 18; ++split) {
    Harness h; auto reply = h.request(start_opcode, {1,1,0xe8,3,1,0}, split); assert(reply.payload[1] == 1); h.stop();
  }
  Harness h;
  for (auto op : {0x04, 0x5f, 0x63, 0xff}) assert(h.request(std::uint8_t(op)).kind == APEX_ERROR);
  assert(h.request(1).kind == APEX_RESPONSE); assert(h.request(2).kind == APEX_RESPONSE);
  assert(h.request(3,{1,2,3}).length == 3); assert(h.hal.transactions.empty());
  for (auto data : std::vector<std::vector<std::uint8_t>>{{}, {1,1,1,0,1,0}, {1,1,0xff,0xff,1,0}, {1,1,0xe8,3,0,0}, {1,1,0xe8,3,65,0}, {1,2,0xe8,3,1,0}, {2,1,0xe8,3,1,0}, {1,1,0xe8,3,1,0,0}})
    assert(h.request(start_opcode, data).kind == APEX_ERROR);
  assert(h.hal.transactions.empty()); assert(h.poll().kind == APEX_ERROR);
  assert(h.start().kind == APEX_RESPONSE); assert(h.start().kind == APEX_ERROR);
  assert(h.poll(2).kind == APEX_ERROR); h.stop();
  const auto next = h.start(); assert(next.payload[4] == 2); assert(h.poll(1).kind == APEX_ERROR); assert(h.poll(2).kind == APEX_RESPONSE);
  h.service.shutdown();
  Harness disabled(false); assert(disabled.start().kind == APEX_ERROR);
  const auto caps = disabled.request(2);
  const std::string cap_text(reinterpret_cast<const char*>(caps.payload), caps.length);
  assert(cap_text.find("radio.rx") == std::string::npos && disabled.hal.transactions.empty());
  Harness corrupt;
  apex_frame_t f{}; f.kind = APEX_RESPONSE; f.opcode = start_opcode; f.id = 1; f.length = 6;
  const std::uint8_t payload[] = {1,1,0xe8,3,1,0}; std::memcpy(f.payload,payload,6);
  std::uint8_t bytes[APEX_MAX_FRAME]{}; auto count = apex_encode(&f,bytes,sizeof(bytes));
  corrupt.service.feed(bytes,count); assert(corrupt.replies.empty());
  f.kind = APEX_REQUEST; count = apex_encode(&f,bytes,sizeof(bytes)); bytes[count-1] ^= 1;
  corrupt.service.feed(bytes,count); assert(corrupt.replies.empty() && corrupt.hal.transactions.empty());
}
void budgets_and_expiry() {
  Harness h; h.start(1000, 12);
  for (int i = 0; i < 12; ++i) { h.hal.packet({std::uint8_t(i)}); h.service.tick(); }
  assert(h.service.state() == State::event_limit && !h.hal.rx);
  assert(h.start().kind == APEX_ERROR); // Undrained evidence is not overwritten.
  for (int i = 0; i < 8; ++i) { auto p = h.poll(); assert(p.payload[31] == i); assert(p.payload[12] == 4); assert(p.payload[8] == 12); }
  assert(h.poll().payload[3] == 0); assert(h.start().payload[4] == 2); h.service.shutdown();
  Harness expired; expired.start(500); expired.hal.time += 500; expired.service.tick(); assert(expired.service.state() == State::expired && !expired.hal.rx);
  const auto before = expired.hal.transactions.size(); expired.service.tick(); assert(before == expired.hal.transactions.size());
  Harness maximum; maximum.start(1000,1); maximum.hal.packet(std::vector<std::uint8_t>(60,0xa5));
  auto record = maximum.poll(); assert(record.length == 91 && record.payload[17] == 60); assert(!maximum.hal.rx);
  unsigned arms = 0; for (const auto& t : maximum.hal.transactions) if (t.size() == 1 && t[0] == 0x34) ++arms;
  assert(arms == 1);
}
void startup_lease_tests() {
  // Pinned CC1101::config() has an unconditional 150 ms delay. These are
  // synthetic clock observations, not a bound on real hardware initialization.
  for (const auto duration : {50, 149, 150}) {
    Harness h;
    const auto first = h.start(std::uint16_t(duration));
    assert(h.hal.time == 150 && first.kind == APEX_RESPONSE);
    assert(first.payload[1] == std::uint8_t(State::expired) && first.payload[4] == 1);
    assert(first.payload[3] == 0 && first.payload[8] == 0 && !h.hal.rx);
    unsigned resets = 0, arms = 0;
    for (const auto& t : h.hal.transactions) {
      if (t.size() == 1 && t[0] == 0x30) ++resets;
      if (t.size() == 1 && t[0] == 0x34) ++arms;
    }
    assert(resets == 1 && arms == 0);
    const auto transactions = h.hal.transactions.size();
    h.service.tick(); assert(h.hal.transactions.size() == transactions);

    // Only a fresh explicit request can use the completed initialization.
    // Preserve the useful 50 ms warm lease without resetting/extending it.
    const auto warm = h.start(50);
    assert(warm.payload[1] == std::uint8_t(State::running) && warm.payload[4] == 2);
    assert(warm.payload[18] == 0 && h.hal.time == 150 && h.hal.rx);
    resets = arms = 0;
    for (const auto& t : h.hal.transactions) {
      if (t.size() == 1 && t[0] == 0x30) ++resets;
      if (t.size() == 1 && t[0] == 0x34) ++arms;
    }
    assert(resets == 1 && arms == 1);
    h.hal.time += 49; h.service.tick(); assert(h.service.state() == State::running);
    ++h.hal.time; h.service.tick(); assert(h.service.state() == State::expired && !h.hal.rx);
  }
  // A minimally longer cold lease retains only its remainder after setup.
  Harness remainder; assert(remainder.start(151).payload[1] == std::uint8_t(State::running));
  assert(remainder.hal.time == 150 && remainder.hal.rx);
  ++remainder.hal.time; remainder.service.tick();
  assert(remainder.service.state() == State::expired && !remainder.hal.rx);
  Harness too_short; assert(too_short.start(49).kind == APEX_ERROR && too_short.hal.transactions.empty());
}
void rejected_and_faults() {
  Harness crc; crc.start(1000,2); crc.hal.packet({7},false); crc.service.tick(); assert(crc.hal.rx);
  crc.hal.packet({8}); auto result = crc.poll(); assert(result.payload[14] == 1 && result.payload[10] == 1 && result.payload[31] == 8); assert(!crc.hal.rx);
  Harness bad; bad.start(); bad.hal.packet({9},true,61); result = bad.poll(); assert(result.payload[1] == std::uint8_t(State::fault)); assert(result.payload[3] == 0); assert(bad.start().kind == APEX_ERROR);
  Harness spi; spi.start(); spi.hal.fail_next = true; spi.hal.packet({1}); spi.poll(); assert(spi.service.state() == State::fault); assert(spi.start().kind == APEX_ERROR);
  Harness clock; clock.start(); clock.hal.time = 0; clock.service.tick(); assert(clock.service.state() == State::fault);
  Harness cap; cap.start(); std::vector<std::uint8_t> too_big(4097); cap.service.feed(too_big.data(),too_big.size()); assert(cap.service.state() == State::fault);
}
std::vector<std::uint8_t> encoded(std::uint8_t op, const std::vector<std::uint8_t>& payload = {}) {
  apex_frame_t request{}; request.kind = APEX_REQUEST; request.opcode = op; request.id = 1;
  request.length = std::uint16_t(payload.size()); std::copy(payload.begin(), payload.end(), request.payload);
  std::vector<std::uint8_t> bytes(APEX_MAX_FRAME);
  const auto size = apex_encode(&request, bytes.data(), bytes.size()); assert(size);
  bytes.resize(size); return bytes;
}
void append(std::vector<std::uint8_t>& target, const std::vector<std::uint8_t>& frame) {
  target.insert(target.end(), frame.begin(), frame.end());
}
void output_failure_tests() {
  const auto start = encoded(start_opcode, {1,1,0xe8,3,64,0});
  const auto poll = encoded(poll_opcode, {1,0,0,0});
  const auto stop = encoded(stop_opcode, {1,0,0,0});
  const auto info = encoded(1);
  auto info_start = info; append(info_start, start);
  // Every chunk split, including concatenated INFO+START: no SPI after the
  // first reply fails and no second reply attempt, even for partial output.
  for (std::size_t split = 0; split <= info_start.size(); ++split) {
    Harness h; h.fail_output = true; h.partial_bytes = split % 7;
    h.service.feed(info_start.data(), split);
    h.service.feed(info_start.data() + split, info_start.size() - split);
    assert(h.service.transport_failed() && h.service.state() == State::fault);
    assert(h.hal.transactions.empty() && !h.hal.rx && h.output_attempts == 1 && h.replies.empty());
    h.service.shutdown(); h.service.tick(); h.service.feed(start.data(), start.size());
    assert(h.service.state() == State::fault && h.hal.transactions.empty() && h.output_attempts == 1);
  }
  // A failed START response must stop immediately after the authorized arm.
  Harness started; started.fail_output = true;
  started.service.feed(start.data(), start.size());
  assert(started.service.transport_failed() && started.service.state() == State::fault && !started.hal.rx);
  unsigned arms = 0;
  for (const auto& t : started.hal.transactions) if (t.size() == 1 && t[0] == 0x34) ++arms;
  assert(arms == 1 && started.output_attempts == 1);
  const auto after_start_failure = started.hal.transactions.size();
  started.service.tick(); started.service.feed(info_start.data(), info_start.size());
  assert(started.hal.transactions.size() == after_start_failure && started.output_attempts == 1);

  // Failed POLL or STOP output cannot be followed by queued STOP/START, and
  // output failure while already stopped is equally terminal.
  for (const auto op : {poll_opcode, stop_opcode, std::uint8_t(1)}) {
    Harness h; h.start();
    if (op == 1) h.stop();
    else if (op == poll_opcode) h.hal.packet({7});
    const auto previous_attempts = h.output_attempts;
    h.fail_output = true; h.partial_bytes = 5;
    auto batch = op == poll_opcode ? poll : op == stop_opcode ? stop : info;
    append(batch, stop); append(batch, start);
    h.service.feed(batch.data(), batch.size());
    assert(h.service.transport_failed() && h.service.state() == State::fault && !h.hal.rx);
    assert(h.output_attempts == previous_attempts + 1);
    const auto transactions = h.hal.transactions.size();
    h.service.tick(); h.service.shutdown(); h.service.feed(start.data(), start.size());
    assert(h.hal.transactions.size() == transactions && h.output_attempts == previous_attempts + 1);
  }
  // Transport read failures use the same latch, before the next tick. A
  // partially buffered request cannot become live when more bytes arrive.
  Harness read_failure; read_failure.start();
  read_failure.service.feed(info_start.data(), 3);
  read_failure.service.fail_transport();
  assert(!read_failure.hal.rx && read_failure.service.transport_failed());
  const auto transactions = read_failure.hal.transactions.size();
  const auto attempts = read_failure.output_attempts;
  read_failure.service.tick(); read_failure.service.feed(info_start.data() + 3, info_start.size() - 3);
  assert(read_failure.hal.transactions.size() == transactions && read_failure.output_attempts == attempts);

  ModelHal hal; Cc1101Receiver receiver(hal, 10, 9);
  Service no_output(receiver, [](void*) { return std::uint64_t(0); }, nullptr, nullptr, nullptr);
  no_output.feed(start.data(), start.size()); no_output.tick();
  assert(no_output.transport_failed() && no_output.state() == State::fault && hal.transactions.empty());
}
int main() {
  guard_tests(); linked_driver_test(); protocol_tests(); budgets_and_expiry(); startup_lease_tests(); rejected_and_faults(); output_failure_tests();
  std::cout << "PASS: SPI firewall, real pinned RadioLib linked against synthetic register model, AXP receive protocol, fragmentation, malformed inputs, stale captures, FIFO/queue/event/deadline bounds, cold/warm startup lease boundaries, CRC/SPI faults, terminal output/read failures and buffered-command rejection.\n";
}
