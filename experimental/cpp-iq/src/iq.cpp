#include "iq.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <utility>
#ifdef APEX_FROZEN_COEFFICIENTS
#include "coefficients.hpp"
#endif

namespace apex_iq {
namespace {
#ifndef APEX_FROZEN_COEFFICIENTS
constexpr double pi = 3.141592653589793238462643383279502884;
#endif
bool supported(std::uint32_t n) {
  return n == 256 || n == 512 || n == 1024 || n == 2048 || n == 4096;
}
void validate(const std::vector<std::uint8_t>& data, double fs, double fc, Windows w) {
  if (data.empty() || data.size() > max_data_bytes || data.size() % 4 != 0 ||
      !std::isfinite(fs) || fs < 1 || fs > 1e9 || !std::isfinite(fc) || std::abs(fc) > 1e12 ||
      !supported(w.fft_size) || w.frame_count < 1 || w.frame_count > 64 ||
      w.hop_samples < 1 || w.hop_samples > 65536 || w.frame_count * w.fft_size > 16384) {
    throw std::invalid_argument("invalid bounded input");
  }
  const std::uint64_t end = static_cast<std::uint64_t>(w.start_sample) +
      static_cast<std::uint64_t>(w.frame_count - 1) * w.hop_samples + w.fft_size;
  if (end > data.size() / 4) throw std::invalid_argument("window range");
}
double ci16(const std::vector<std::uint8_t>& data, std::size_t offset) {
  const int raw = static_cast<int>(data[offset]) | (static_cast<int>(data[offset + 1]) << 8);
  return static_cast<double>(raw < 32768 ? raw : raw - 65536) / 32768.0;
}
std::pair<std::vector<double>, std::vector<double>> fft(
    const std::vector<double>& real, const std::vector<double>& imaginary) {
  const auto finite = [](double value) { return std::isfinite(value); };
  if (real.size() != imaginary.size() || !std::all_of(real.begin(), real.end(), finite) ||
      !std::all_of(imaginary.begin(), imaginary.end(), finite)) throw std::invalid_argument("FFT input");
  std::vector<double> re(real), im(imaginary);
  const std::size_t n = re.size();
  for (std::size_t i = 1, j = 0; i < n; ++i) {
    std::size_t bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) { std::swap(re[i], re[j]); std::swap(im[i], im[j]); }
  }
  for (std::size_t size = 2; size <= n; size *= 2) {
    for (std::size_t start = 0; start < n; start += size) {
      for (std::size_t j = 0; j < size / 2; ++j) {
#ifdef APEX_FROZEN_COEFFICIENTS
        const double c = coefficients::cosine[size / 2 - 1 + j], s = coefficients::sine[size / 2 - 1 + j];
#else
        const double angle = -2 * pi * static_cast<double>(j) / static_cast<double>(size);
        const double c = std::cos(angle), s = std::sin(angle);
#endif
        const std::size_t a = start + j, b = a + size / 2;
        const double tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] = re[a] + tr; im[a] = im[a] + ti;
      }
    }
  }
  if (!std::all_of(re.begin(), re.end(), finite) || !std::all_of(im.begin(), im.end(), finite))
    throw std::overflow_error("FFT overflow");
  return {std::move(re), std::move(im)};
}
Frame window(const std::vector<std::uint8_t>& data, double fs, double fc,
             std::uint32_t n, std::uint32_t start) {
  std::vector<double> real(n), imaginary(n);
  double window_sum = 0;
  for (std::uint32_t k = 0; k < n; ++k) {
#ifdef APEX_FROZEN_COEFFICIENTS
    const double w = coefficients::hann[n - 256 + k];
#else
    const double w = 0.5 - 0.5 * std::cos(2 * pi * k / n);
#endif
    window_sum += w;
    const std::size_t at = static_cast<std::size_t>(start + k) * 4;
    real[k] = ci16(data, at) * w;
    imaginary[k] = ci16(data, at + 2) * w;
  }
  auto transformed = fft(real, imaginary);
  Frame frame{start, start + n, -1, window_sum, {}};
  frame.bins.reserve(n);
  double peak_amplitude = 0;
  for (std::uint32_t k = 0; k < n; ++k) {
    const std::int32_t signed_bin = static_cast<std::int32_t>(k) - static_cast<std::int32_t>(n / 2);
    const std::uint32_t raw_index = (k + n / 2) % n;
    const double amplitude = std::hypot(transformed.first[raw_index], transformed.second[raw_index]) / window_sum;
    const bool has_db = amplitude != 0;
    const double db = has_db ? 20 * std::log10(amplitude) : 0;
    const double offset_hz = signed_bin * fs / n;
    if (!std::isfinite(amplitude) || !std::isfinite(db)) throw std::overflow_error("nonfinite output");
    frame.bins.push_back({signed_bin, raw_index, offset_hz, fc + offset_hz, amplitude,
                         has_db, db, has_db ? std::max(-160.0, db) : -160.0});
    if (amplitude > peak_amplitude) {
      peak_amplitude = amplitude;
      frame.peak_index = static_cast<std::int32_t>(k);
    }
  }
  return frame;
}
}  // namespace
Result analyze(const std::vector<std::uint8_t>& data, double fs, double fc, Windows w) {
  validate(data, fs, fc, w);
  Result result{w, fs / w.fft_size, w.fft_size / fs, {}};
  result.frames.reserve(w.frame_count);
  for (std::uint32_t index = 0; index < w.frame_count; ++index)
    result.frames.push_back(window(data, fs, fc, w.fft_size, w.start_sample + index * w.hop_samples));
  return result;
}
}  // namespace apex_iq
