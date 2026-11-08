#pragma once
// Original, isolated host compute experiment. Not an AXP or mobile interface.
#include <cstddef>
#include <cstdint>
#include <vector>

namespace apex_iq {
constexpr std::size_t max_data_bytes = 262144;
struct Windows { std::uint32_t fft_size, start_sample, hop_samples, frame_count; };
struct Bin {
  std::int32_t signed_bin;
  std::uint32_t raw_index;
  double offset_hz, declared_rf_hz, amplitude;
  bool has_db;
  double db, display_db;
};
struct Frame {
  std::uint32_t start_sample, end_sample;
  std::int32_t peak_index;
  double window_sum;
  std::vector<Bin> bins;
};
struct Result {
  Windows windows;
  double bin_spacing_hz, window_duration_seconds;
  std::vector<Frame> frames;
};
// Preserves the copied-input FFT and periodic-Hann arithmetic order of APEX's
// TypeScript reference. No acquisition, metadata trust, hashing or UI behavior.
Result analyze(const std::vector<std::uint8_t>& data, double sample_rate,
               double center_frequency, Windows windows);
}  // namespace apex_iq
