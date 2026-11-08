#ifndef APEX_HYBRID_IQ_KERNEL_H
#define APEX_HYBRID_IQ_KERNEL_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Host proof C ABI. The caller owns all buffers for the full call and guarantees
 * valid aligned pointers, initialized readable inputs, and a writable output
 * disjoint from every input. No pointer is retained. Rust can enforce these
 * conditions with owned Vecs and distinct immutable/mutable borrows.
 * Output is frame-major [real[n], imaginary[n]] in unshifted FFT order.
 * Exact-size capacities are required. Invalid requests write no output.
 * No sample rate, RF metadata, provenance, magnitude or peak enters this ABI. */
typedef struct {
  uint32_t fft_size, start_sample, hop_samples, frame_count;
} apex_iq_windows_v1;
enum { APEX_IQ_OK = 0, APEX_IQ_BOUNDS = 1, APEX_IQ_COEFFICIENT = 2, APEX_IQ_RUNTIME = 3 };
int apex_iq_fft_v1(const uint8_t* data, size_t data_len,
    apex_iq_windows_v1 windows,
    const double* hann, size_t hann_len,
    const double* cosine, const double* sine, size_t twiddle_len,
    double* output, size_t output_len);
#ifdef __cplusplus
}
#endif
#endif
