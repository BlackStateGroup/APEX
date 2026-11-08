#include "kernel.h"
#include <algorithm>
#include <cfenv>
#include <cmath>
#include <limits>
#if defined(__FAST_MATH__)
#error "Fast math violates the hybrid proof contract"
#endif
static_assert(sizeof(double) == 8 && std::numeric_limits<double>::is_iec559,
              "IEEE-754 binary64 required");
namespace {
bool supported(uint32_t n) { return n == 256 || n == 512 || n == 1024 || n == 2048 || n == 4096; }
double sample(const uint8_t* data, size_t at) {
  const int bits = static_cast<int>(data[at]) | (static_cast<int>(data[at + 1]) << 8);
  return static_cast<double>(bits < 32768 ? bits : bits - 65536) / 32768.0;
}
}
extern "C" int apex_iq_fft_v1(const uint8_t* data, size_t data_len,
    apex_iq_windows_v1 w, const double* hann, size_t hann_len,
    const double* cosine, const double* sine, size_t twiddle_len,
    double* output, size_t output_len) {
  // Validate all dimensions before products, indexing or writes. Supported
  // dimensions make later size_t arithmetic safe even on 32-bit hosts.
  if (!data || !hann || !cosine || !sine || !output ||
      data_len == 0 || data_len > 262144 || data_len % 4 != 0 ||
      !supported(w.fft_size) || w.frame_count < 1 || w.frame_count > 64 ||
      w.hop_samples < 1 || w.hop_samples > 65536 ||
      w.fft_size * w.frame_count > 16384 || hann_len != w.fft_size ||
      twiddle_len != w.fft_size - 1 || output_len != 2 * w.fft_size * w.frame_count)
    return APEX_IQ_BOUNDS;
  const uint64_t end = static_cast<uint64_t>(w.start_sample) +
      static_cast<uint64_t>(w.frame_count - 1) * w.hop_samples + w.fft_size;
  if (end > data_len / 4) return APEX_IQ_BOUNDS;
  // JS uses nearest rounding. Refuse a caller's altered rounding mode rather
  // than changing process state. Compiler flags also forbid fused contraction.
  if (std::fegetround() != FE_TONEAREST) return APEX_IQ_RUNTIME;
  for (size_t k = 0; k < hann_len; ++k)
    if (!std::isfinite(hann[k]) || hann[k] < 0 || hann[k] > 1) return APEX_IQ_COEFFICIENT;
  for (size_t k = 0; k < twiddle_len; ++k)
    if (!std::isfinite(cosine[k]) || !std::isfinite(sine[k]) ||
        std::abs(cosine[k]) > 1 || std::abs(sine[k]) > 1) return APEX_IQ_COEFFICIENT;
  const size_t n = w.fft_size;
  for (size_t frame = 0; frame < w.frame_count; ++frame) {
    double* re = output + frame * 2 * n;
    double* im = re + n;
    const size_t start = w.start_sample + frame * w.hop_samples;
    for (size_t k = 0; k < n; ++k) {
      re[k] = sample(data, (start + k) * 4) * hann[k];
      im[k] = sample(data, (start + k) * 4 + 2) * hann[k];
    }
    for (size_t i = 1, j = 0; i < n; ++i) {
      size_t bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) { std::swap(re[i], re[j]); std::swap(im[i], im[j]); }
    }
    for (size_t size = 2; size <= n; size *= 2) {
      for (size_t start_fft = 0; start_fft < n; start_fft += size) {
        for (size_t j = 0; j < size / 2; ++j) {
          const double c = cosine[size / 2 - 1 + j], s = sine[size / 2 - 1 + j];
          const size_t a = start_fft + j, b = a + size / 2;
          const double tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] = re[a] + tr; im[a] = im[a] + ti;
        }
      }
    }
  }
  // With |input| <= 1, |coefficients| <= 1, n <= 4096 there is no overflow.
  // This ABI allocates no memory, throws no exceptions, and retains no state.
  return APEX_IQ_OK;
}
