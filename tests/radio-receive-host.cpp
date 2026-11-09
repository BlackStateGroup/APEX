// Original synthetic receiver; actual AXP parser and receive service. No RadioLib/RF.
#include "../firmware/radio_rx/rx_service.h"
#include <cstdio>
#include <cstring>
#include <poll.h>
#include <unistd.h>
using namespace apex::rx;
struct Synthetic final : Receiver {
  const char* mode;
  std::uint64_t time = 0;
  unsigned initializes = 0, arms = 0, polls = 0, stops = 0;
  std::int16_t last_error = 0;
  explicit Synthetic(const char* m) : mode(m) {}
  bool is(const char* m) const { return std::strcmp(mode, m) == 0; }
  bool initialize() override {
    ++initializes; time += 150;
    if (is("initialize-failure")) { last_error = -701; return false; }
    return true;
  }
  bool arm() override { ++arms; return true; }
  Reception poll(Packet& p) override {
    ++polls; time += 5;
    if (is("quiet") || is("stop-failure")) return Reception::none;
    const unsigned index = (polls - 1) % 5;
    if (index == 1) return Reception::crc_rejected;
    if (index == 3) return Reception::length_rejected;
    p.length = 4; p.bytes[0] = 0; p.bytes[1] = 255; p.bytes[2] = 128; p.bytes[3] = std::uint8_t(index);
    p.rssi_tenths_dbm = std::int16_t(-735 - index); p.lqi = std::uint8_t(201 + index);
    return Reception::packet;
  }
  bool stop() override {
    ++stops;
    if (is("stop-failure")) { last_error = -702; return false; }
    return true;
  }
  std::int16_t error() const override { return last_error; }
};
static std::uint64_t clock_value(void* p) { return static_cast<Synthetic*>(p)->time; }
static bool output(const std::uint8_t* b, std::size_t n, void*) {
  return std::fwrite(b, 1, n, stdout) == n && std::fflush(stdout) == 0;
}
// Each transport write has a little-endian length envelope. This ensures feed and
// dispatch ticks are deterministic regardless of OS pipe fragmentation/coalescing.
static bool exact(std::uint8_t* b, std::size_t n) {
  while (n) {
    pollfd fd{STDIN_FILENO, POLLIN, 0};
    if (::poll(&fd, 1, 5000) <= 0) return false;
    const auto count = ::read(STDIN_FILENO, b, n);
    if (count <= 0) return false;
    b += count; n -= std::size_t(count);
  }
  return true;
}
int main(int argc, char** argv) {
  const char* mode = argc == 2 ? argv[1] : "enabled";
  Synthetic receiver(mode);
  if (!receiver.is("enabled") && !receiver.is("quiet") && !receiver.is("disabled") &&
      !receiver.is("initialize-failure") && !receiver.is("stop-failure")) return 2;
  Service service(receiver, clock_value, &receiver, output, nullptr, !receiver.is("disabled"));
  std::uint8_t header[2], bytes[4096];
  while (exact(header, 2)) {
    const auto n = std::size_t(header[0]) + std::size_t(header[1]) * 256;
    if (!n || n > sizeof(bytes) || !exact(bytes, n)) break;
    service.feed(bytes, n);
    if (service.transport_failed()) break;
  }
  service.shutdown();
  std::fprintf(stderr, "{\"initializes\":%u,\"arms\":%u,\"polls\":%u,\"stops\":%u}\n",
               receiver.initializes, receiver.arms, receiver.polls, receiver.stops);
  return service.transport_failed() ? 1 : 0;
}
