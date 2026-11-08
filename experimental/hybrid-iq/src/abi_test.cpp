#include "kernel.h"
#include <algorithm>
#include <cassert>
#include <cfenv>
#include <cmath>
#include <iostream>
#include <limits>
#include <vector>
int main() {
  std::vector<uint8_t> data(1024, 0);
  std::vector<double> hann(256, 0.5), cosine(255, 1), sine(255, 0), output(512, 12345);
  apex_iq_windows_v1 w{256, 0, 256, 1};
  auto call = [&] { return apex_iq_fft_v1(data.data(), data.size(), w, hann.data(), hann.size(), cosine.data(), sine.data(), cosine.size(), output.data(), output.size()); };
  auto unchanged = [&] { assert(std::all_of(output.begin(), output.end(), [](double x){ return x == 12345; })); };
  for (uint32_t n : {0U, 128U, 257U, 8192U, 0xffffffffU}) { w.fft_size = n; assert(call() == APEX_IQ_BOUNDS); unchanged(); }
  w.fft_size = 256;
  for (uint32_t start : {1U, 0xffffffffU}) { w.start_sample = start; assert(call() == APEX_IQ_BOUNDS); unchanged(); }
  w.start_sample = 0;
  for (uint32_t count : {0U, 65U, 0xffffffffU}) { w.frame_count = count; assert(call() == APEX_IQ_BOUNDS); unchanged(); }
  w.frame_count = 1;
  for (uint32_t hop : {0U, 65537U, 0xffffffffU}) { w.hop_samples = hop; assert(call() == APEX_IQ_BOUNDS); unchanged(); }
  w.hop_samples = 256;
  for (double x : {-1.0, 1.1, std::numeric_limits<double>::infinity(), std::numeric_limits<double>::quiet_NaN()}) {
    hann[255] = x; assert(call() == APEX_IQ_COEFFICIENT); unchanged();
  }
  hann[255] = 0.5;
  for (auto* a : {&cosine, &sine}) {
    const double saved = a->back();
    for (double x : {-1.1, 1.1, std::numeric_limits<double>::infinity(), std::numeric_limits<double>::quiet_NaN()}) {
      a->back() = x; assert(call() == APEX_IQ_COEFFICIENT); unchanged();
    }
    a->back() = saved;
  }
  assert(apex_iq_fft_v1(nullptr, data.size(), w, hann.data(), 256, cosine.data(), sine.data(), 255, output.data(), 512) == APEX_IQ_BOUNDS); unchanged();
  assert(apex_iq_fft_v1(data.data(), data.size(), w, hann.data(), 255, cosine.data(), sine.data(), 255, output.data(), 512) == APEX_IQ_BOUNDS); unchanged();
  assert(apex_iq_fft_v1(data.data(), data.size(), w, hann.data(), 256, cosine.data(), sine.data(), 254, output.data(), 512) == APEX_IQ_BOUNDS); unchanged();
  assert(apex_iq_fft_v1(data.data(), data.size(), w, hann.data(), 256, cosine.data(), sine.data(), 255, output.data(), 511) == APEX_IQ_BOUNDS); unchanged();
  assert(std::fesetround(FE_DOWNWARD) == 0); assert(call() == APEX_IQ_RUNTIME); unchanged();
  assert(std::fesetround(FE_TONEAREST) == 0); assert(call() == APEX_IQ_OK);
  assert(std::all_of(output.begin(), output.end(), [](double x){ return x == 0; }));
  std::cout << "C ABI bounds, late coefficient failures, unchanged-on-rejection, rounding refusal, zero transform passed\n";
}
