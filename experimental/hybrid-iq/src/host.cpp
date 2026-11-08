// Host proof framing only; not AXP, not a mobile bridge.
#include "kernel.h"
#include <chrono>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <vector>
namespace {
constexpr size_t header_size = 32;
constexpr size_t max_request = header_size + 262144 + (3 * 4096 - 2) * 8;
uint32_t get32(const std::vector<uint8_t>& b, size_t at) {
  uint32_t x = 0; for (size_t i = 0; i < 4; ++i) x |= static_cast<uint32_t>(b[at + i]) << (8 * i); return x;
}
double get_double(const std::vector<uint8_t>& b, size_t at) {
  uint64_t x = 0; for (size_t i = 0; i < 8; ++i) x |= static_cast<uint64_t>(b[at + i]) << (8 * i);
  double d = 0; std::memcpy(&d, &x, 8); return d;
}
void put32(std::vector<uint8_t>& b, uint32_t x) { for (size_t i = 0; i < 4; ++i) b.push_back(static_cast<uint8_t>(x >> (8 * i))); }
void put64(std::vector<uint8_t>& b, uint64_t x) { for (size_t i = 0; i < 8; ++i) b.push_back(static_cast<uint8_t>(x >> (8 * i))); }
void put_double(std::vector<uint8_t>& b, double d) { uint64_t x = 0; std::memcpy(&x, &d, 8); put64(b, x); }
volatile double consumed = 0;
}
int main(int argc, char**) {
  if (argc != 1) { std::cerr << "apex-hybrid-iq: rejected input\n"; return 2; }
  try {
    std::vector<uint8_t> b; b.reserve(max_request + 1); char c;
    while (b.size() <= max_request && std::cin.get(c)) b.push_back(static_cast<uint8_t>(static_cast<unsigned char>(c)));
    if (std::cin.bad() || b.size() < header_size || b.size() > max_request ||
        std::memcmp(b.data(), "AXHF\1\0\0\0", 8) != 0) throw std::invalid_argument("header");
    const uint32_t length = get32(b, 8), n = get32(b, 12), iterations = get32(b, 28);
    if (!(n == 256 || n == 512 || n == 1024 || n == 2048 || n == 4096) ||
        length < 4 || length > 262144 || length % 4 != 0 || iterations < 1 || iterations > 1000 ||
        b.size() != header_size + length + (3 * n - 2) * 8) throw std::invalid_argument("length");
    const apex_iq_windows_v1 w{n, get32(b, 16), get32(b, 20), get32(b, 24)};
    if (w.frame_count < 1 || w.frame_count > 64 || w.frame_count * n > 16384) throw std::invalid_argument("frames");
    std::vector<double> hann(n), cosine(n - 1), sine(n - 1), output(2 * n * w.frame_count);
    size_t at = header_size + length;
    for (auto* values : {&hann, &cosine, &sine}) for (auto& value : *values) { value = get_double(b, at); at += 8; }
    auto call = [&] {
      const int status = apex_iq_fft_v1(b.data() + header_size, length, w,
          hann.data(), hann.size(), cosine.data(), sine.data(), cosine.size(), output.data(), output.size());
      if (status != APEX_IQ_OK) throw std::invalid_argument("kernel");
      consumed = output.back();
    };
    for (int i = 0; i < 3; ++i) call();
    const auto start = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < iterations; ++i) call();
    const auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - start).count();
    std::vector<uint8_t> response{'A','X','H','R',1,0,0,0};
    response.reserve(24 + output.size() * 8); put32(response, n); put32(response, w.frame_count);
    put64(response, static_cast<uint64_t>(elapsed));
    for (double value : output) put_double(response, value);
    std::cout.write(reinterpret_cast<const char*>(response.data()), static_cast<std::streamsize>(response.size()));
    return std::cout ? 0 : 3;
  } catch (const std::invalid_argument&) { std::cerr << "apex-hybrid-iq: rejected input\n"; return 2; }
    catch (const std::exception&) { std::cerr << "apex-hybrid-iq: computation failed\n"; return 3; }
}
