// AXIQ/AXIR is shared test framing only; it is not a production protocol or ABI.
#include "iq.hpp"
#include <chrono>
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
static_assert(sizeof(double) == 8 && std::numeric_limits<double>::is_iec559, "IEEE-754 f64 required");
constexpr std::size_t header_size = 48;
constexpr std::size_t max_request = header_size + apex_iq::max_data_bytes;
std::uint32_t get32(const std::vector<std::uint8_t>& bytes, std::size_t at) {
  std::uint32_t value = 0;
  for (std::size_t j = 0; j < 4; ++j) value |= static_cast<std::uint32_t>(bytes[at + j]) << (j * 8);
  return value;
}
double get_double(const std::vector<std::uint8_t>& bytes, std::size_t at) {
  std::uint64_t bits = 0;
  for (std::size_t j = 0; j < 8; ++j) bits |= static_cast<std::uint64_t>(bytes[at + j]) << (j * 8);
  double value = 0; std::memcpy(&value, &bits, sizeof(value)); return value;
}
void put32(std::vector<std::uint8_t>& bytes, std::uint32_t value) {
  for (std::size_t j = 0; j < 4; ++j) bytes.push_back(static_cast<std::uint8_t>(value >> (j * 8)));
}
void put64(std::vector<std::uint8_t>& bytes, std::uint64_t value) {
  for (std::size_t j = 0; j < 8; ++j) bytes.push_back(static_cast<std::uint8_t>(value >> (j * 8)));
}
void put_double(std::vector<std::uint8_t>& bytes, double value) {
  std::uint64_t bits = 0; std::memcpy(&bits, &value, sizeof(bits)); put64(bytes, bits);
}
std::vector<std::uint8_t> encode(const apex_iq::Result& report, std::uint64_t elapsed_ns) {
  std::vector<std::uint8_t> bytes{'A', 'X', 'I', 'R', 1, 0, 0, 0};
  bytes.reserve(40 + report.frames.size() * (24 + report.windows.fft_size * 56));
  put32(bytes, report.windows.fft_size); put32(bytes, report.windows.frame_count);
  put64(bytes, elapsed_ns); put_double(bytes, report.bin_spacing_hz); put_double(bytes, report.window_duration_seconds);
  for (const auto& frame : report.frames) {
    put32(bytes, frame.start_sample); put32(bytes, frame.end_sample);
    put32(bytes, static_cast<std::uint32_t>(frame.peak_index)); put32(bytes, 0);
    put_double(bytes, frame.window_sum);
    for (const auto& bin : frame.bins) {
      put32(bytes, static_cast<std::uint32_t>(bin.signed_bin)); put32(bytes, bin.raw_index);
      put_double(bytes, bin.offset_hz); put_double(bytes, bin.declared_rf_hz); put_double(bytes, bin.amplitude);
      bytes.push_back(bin.has_db ? 1 : 0); bytes.insert(bytes.end(), 7, 0);
      put_double(bytes, bin.db); put_double(bytes, bin.display_db);
    }
  }
  return bytes;
}
// Separate translation units and a volatile observable keep every timed result
// alive without relying on output serialization inside the compute timer.
volatile double consumed = 0;
void consume(const apex_iq::Result& report) { consumed = report.frames.back().bins.back().amplitude; }
}
int main(int argc, char**) {
  if (argc != 1) { std::cerr << "apex-cpp-iq-proof: no arguments accepted\n"; return 2; }
  try {
    std::vector<std::uint8_t> bytes;
    bytes.reserve(max_request + 1);
    char c;
    while (bytes.size() <= max_request && std::cin.get(c)) bytes.push_back(static_cast<std::uint8_t>(static_cast<unsigned char>(c)));
    if (std::cin.bad() || bytes.size() > max_request) throw std::invalid_argument("length");
    if (bytes.size() < header_size || std::memcmp(bytes.data(), "AXIQ\1\0\1\0", 8) != 0) throw std::invalid_argument("header");
    const auto length = get32(bytes, 8), iterations = get32(bytes, 28);
    if (length == 0 || length > apex_iq::max_data_bytes || length % 4 != 0 || bytes.size() != header_size + length || iterations == 0 || iterations > 1000)
      throw std::invalid_argument("length or iteration bound");
    const apex_iq::Windows windows{get32(bytes, 12), get32(bytes, 16), get32(bytes, 20), get32(bytes, 24)};
    const double fs = get_double(bytes, 32), fc = get_double(bytes, 40);
    const std::vector<std::uint8_t> data(bytes.begin() + header_size, bytes.end());
    for (int i = 0; i < 3; ++i) consume(apex_iq::analyze(data, fs, fc, windows));
    const auto start = std::chrono::steady_clock::now();
    auto result = apex_iq::analyze(data, fs, fc, windows); consume(result);
    for (std::uint32_t i = 1; i < iterations; ++i) { result = apex_iq::analyze(data, fs, fc, windows); consume(result); }
    const auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - start).count();
    const auto output = encode(result, static_cast<std::uint64_t>(elapsed));
    std::cout.write(reinterpret_cast<const char*>(output.data()), static_cast<std::streamsize>(output.size()));
    if (!std::cout) { std::cerr << "apex-cpp-iq-proof: output failed\n"; return 3; }
    return 0;
  } catch (const std::invalid_argument&) {
    std::cerr << "apex-cpp-iq-proof: rejected input\n"; return 2;
  } catch (const std::exception&) {
    std::cerr << "apex-cpp-iq-proof: computation failed\n"; return 3;
  }
}
