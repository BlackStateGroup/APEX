//! An isolated numerical proof, not an acquisition, evidence, or mobile API.
//!
//! Computes the numerical spectrum projection of APEX's existing TypeScript
//! `analyzeIqTimeFrequency`. Original-byte hashing, strict SigMF parsing, source
//! attribution, authorization, lifecycle fencing and UI remain outside this crate.
//! Bounds and the periodic Hann/complex-amplitude convention are unchanged.
#![forbid(unsafe_code)]

use std::f64::consts::PI;

pub mod wire;

pub const KERNEL_VERSION: &str = "apex-rust-iq-proof-v1";

pub const MAX_SAMPLES: usize = 65_536;
pub const MAX_DATA_BYTES: usize = MAX_SAMPLES * 4;
pub const MAX_FRAMES: usize = 64;
pub const MAX_CELLS: usize = 16_384;
pub const FFT_SIZES: [usize; 5] = [256, 512, 1024, 2048, 4096];
pub const DISPLAY_FLOOR_DB: f64 = -160.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    DataLength,
    SampleRate,
    CenterFrequency,
    FftSize,
    FrameCount,
    Hop,
    CellBudget,
    SampleRange,
    NonFinite,
    ComplexLength,
}

/// Explicit selections only. There is no default, padding or automatic fallback.
#[derive(Clone, Copy, Debug)]
pub struct Windows {
    pub fft_size: usize,
    pub start_sample: usize,
    pub hop_samples: usize,
    pub frame_count: usize,
}

#[derive(Clone, Debug)]
pub struct Bin {
    pub signed_bin: i32,
    pub raw_index: usize,
    pub offset_hz: f64,
    pub declared_rf_hz: f64,
    pub amplitude: f64,
    /// Exact zero amplitude has no finite dB value. This is not a noise estimate.
    pub db_relative_to_unit_amplitude: Option<f64>,
    pub display_db: f64,
}

#[derive(Clone, Debug)]
pub struct Spectrum {
    pub start_sample: usize,
    pub end_sample_exclusive: usize,
    pub window_sum: f64,
    pub bins: Vec<Bin>,
    /// Index in the shifted bins vector. First strict maximum wins, as in TS.
    /// All-zero transformed data has no peak.
    pub peak_index: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct TimeFrequency {
    pub windows: Windows,
    pub bin_spacing_hz: f64,
    pub window_duration_seconds: f64,
    pub frames: Vec<Spectrum>,
}

fn validate(data: &[u8], sample_rate: f64, center_frequency: f64, windows: Windows) -> Result<(), Error> {
    if data.is_empty() || data.len() > MAX_DATA_BYTES || data.len() % 4 != 0 {
        return Err(Error::DataLength);
    }
    if !sample_rate.is_finite() || !(1.0..=1e9).contains(&sample_rate) {
        return Err(Error::SampleRate);
    }
    if !center_frequency.is_finite() || center_frequency.abs() > 1e12 {
        return Err(Error::CenterFrequency);
    }
    if !FFT_SIZES.contains(&windows.fft_size) { return Err(Error::FftSize); }
    if windows.frame_count == 0 || windows.frame_count > MAX_FRAMES { return Err(Error::FrameCount); }
    if windows.hop_samples == 0 || windows.hop_samples > MAX_SAMPLES { return Err(Error::Hop); }
    if windows.frame_count.checked_mul(windows.fft_size).ok_or(Error::CellBudget)? > MAX_CELLS {
        return Err(Error::CellBudget);
    }
    let final_start = (windows.frame_count - 1).checked_mul(windows.hop_samples)
        .and_then(|offset| windows.start_sample.checked_add(offset)).ok_or(Error::SampleRange)?;
    let end = final_start.checked_add(windows.fft_size).ok_or(Error::SampleRange)?;
    if end > data.len() / 4 { return Err(Error::SampleRange); }
    Ok(())
}

/// Same negative-exponential, unnormalized, radix-2 transform convention as TS.
/// Inputs are borrowed immutably and copied. This is not a zero-copy API.
pub fn fft_complex_forward(real: &[f64], imaginary: &[f64]) -> Result<(Vec<f64>, Vec<f64>), Error> {
    let n = real.len();
    if !FFT_SIZES.contains(&n) { return Err(Error::FftSize); }
    if imaginary.len() != n { return Err(Error::ComplexLength); }
    if real.iter().chain(imaginary.iter()).any(|value| !value.is_finite()) { return Err(Error::NonFinite); }
    let mut re = real.to_vec();
    let mut im = imaginary.to_vec();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 { j ^= bit; bit >>= 1; }
        j ^= bit;
        if i < j { re.swap(i, j); im.swap(i, j); }
    }
    let mut size = 2;
    while size <= n {
        for start in (0..n).step_by(size) {
            for j in 0..size / 2 {
                // Preserve the baseline arithmetic order. No fast-math or FMA
                // substitution is requested. libm rounding can still differ.
                let angle = -2.0 * PI * j as f64 / size as f64;
                let c = angle.cos();
                let s = angle.sin();
                let a = start + j;
                let b = a + size / 2;
                let tr = re[b] * c - im[b] * s;
                let ti = re[b] * s + im[b] * c;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        size *= 2;
    }
    if re.iter().chain(im.iter()).any(|value| !value.is_finite()) { return Err(Error::NonFinite); }
    Ok((re, im))
}

/// Computes only explicitly selected windows from signed-int16 little-endian
/// I+jQ data. This does not validate a recording's identity or declared metadata.
/// All ranges are checked before allocating FFT/output arrays. Allocation is
/// bounded by the profile, but no total heap or hard-real-time guarantee is made.
pub fn analyze_windows(data: &[u8], sample_rate: f64, center_frequency: f64, windows: Windows)
    -> Result<TimeFrequency, Error>
{
    validate(data, sample_rate, center_frequency, windows)?;
    let mut frames = Vec::with_capacity(windows.frame_count);
    for index in 0..windows.frame_count {
        let start = windows.start_sample + index * windows.hop_samples;
        frames.push(window_spectrum(data, sample_rate, center_frequency, windows.fft_size, start)?);
    }
    Ok(TimeFrequency {
        windows,
        bin_spacing_hz: sample_rate / windows.fft_size as f64,
        window_duration_seconds: windows.fft_size as f64 / sample_rate,
        frames,
    })
}

fn window_spectrum(data: &[u8], sample_rate: f64, center_frequency: f64, n: usize, start: usize)
    -> Result<Spectrum, Error>
{
    let mut re = vec![0.0; n];
    let mut im = vec![0.0; n];
    let mut window_sum = 0.0;
    for k in 0..n {
        let w = 0.5 - 0.5 * (2.0 * PI * k as f64 / n as f64).cos();
        window_sum += w;
        let offset = (start + k) * 4;
        re[k] = i16::from_le_bytes([data[offset], data[offset + 1]]) as f64 / 32768.0 * w;
        im[k] = i16::from_le_bytes([data[offset + 2], data[offset + 3]]) as f64 / 32768.0 * w;
    }
    let (transformed_re, transformed_im) = fft_complex_forward(&re, &im)?;
    let mut bins = Vec::with_capacity(n);
    let mut peak_index = None;
    let mut peak_amplitude = 0.0;
    for k in 0..n {
        let signed_bin = k as i32 - n as i32 / 2;
        let raw_index = (k + n / 2) % n;
        let amplitude = transformed_re[raw_index].hypot(transformed_im[raw_index]) / window_sum;
        let db = if amplitude == 0.0 { None } else { Some(20.0 * amplitude.log10()) };
        let offset_hz = signed_bin as f64 * sample_rate / n as f64;
        if amplitude > peak_amplitude { peak_amplitude = amplitude; peak_index = Some(k); }
        bins.push(Bin {
            signed_bin, raw_index, offset_hz, declared_rf_hz: center_frequency + offset_hz,
            amplitude, db_relative_to_unit_amplitude: db,
            display_db: db.unwrap_or(DISPLAY_FLOOR_DB).max(DISPLAY_FLOOR_DB),
        });
    }
    Ok(Spectrum { start_sample: start, end_sample_exclusive: start + n, window_sum, bins, peak_index })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(n: usize) -> Windows {
        Windows { fft_size: n, start_sample: 0, hop_samples: n, frame_count: 1 }
    }
    fn pack(pairs: &[(i16, i16)]) -> Vec<u8> {
        pairs.iter().flat_map(|(i, q)| i.to_le_bytes().into_iter().chain(q.to_le_bytes())).collect()
    }
    fn near(actual: f64, expected: f64, tolerance: f64) {
        assert!((actual - expected).abs() <= tolerance, "{actual} != {expected}");
    }

    #[test]
    fn zeros_and_hann_zero_endpoint_have_no_peak() {
        for n in FFT_SIZES {
            for endpoint in [false, true] {
                let mut pairs = vec![(0, 0); n];
                if endpoint { pairs[0] = (32767, -32768); }
                let report = analyze_windows(&pack(&pairs), 1024.0, 0.0, options(n)).unwrap();
                assert_eq!(report.frames[0].peak_index, None);
                for bin in &report.frames[0].bins {
                    assert_eq!(bin.amplitude, 0.0);
                    assert_eq!(bin.db_relative_to_unit_amplitude, None);
                    assert_eq!(bin.display_db, -160.0);
                }
            }
        }
    }

    #[test]
    fn signed_tones_dc_nyquist_and_immutable_input() {
        for n in FFT_SIZES {
            for sign in [-1_i16, 1_i16] {
                let pattern = [(16384, 0), (0, 16384 * sign), (-16384, 0), (0, -16384 * sign)];
                let pairs: Vec<_> = (0..n).map(|k| pattern[k % 4]).collect();
                let data = pack(&pairs);
                let snapshot = data.clone();
                let report = analyze_windows(&data, 8192.0, 1e6, options(n)).unwrap();
                let spectrum = &report.frames[0];
                let peak = &spectrum.bins[spectrum.peak_index.unwrap()];
                assert_eq!(peak.signed_bin, sign as i32 * n as i32 / 4);
                near(peak.amplitude, 0.5, 1e-12);
                near(peak.offset_hz, sign as f64 * 2048.0, 0.0);
                assert_eq!(data, snapshot);
            }
        }
        let dc = analyze_windows(&pack(&vec![(8192, -4096); 256]), 1024.0, 0.0, options(256)).unwrap();
        let peak = dc.frames[0].peak_index.unwrap();
        assert_eq!(dc.frames[0].bins[peak].signed_bin, 0);
        near(dc.frames[0].bins[peak].amplitude, 5.0_f64.sqrt() / 8.0, 1e-12);
        let nyquist: Vec<_> = (0..256).map(|k| (if k % 2 == 0 { 16384 } else { -16384 }, 0)).collect();
        let nyquist = analyze_windows(&pack(&nyquist), 1024.0, 0.0, options(256)).unwrap();
        assert_eq!(nyquist.frames[0].peak_index, Some(0));
    }

    #[test]
    fn raw_fft_matches_independent_quadratic_dft() {
        let re: Vec<_> = (0..256).map(|k| ((k * 137 % 1001) as f64 - 500.0) / 32768.0).collect();
        let im: Vec<_> = (0..256).map(|k| ((k * 163 % 977) as f64 - 488.0) / 32768.0).collect();
        let (r, i) = fft_complex_forward(&re, &im).unwrap();
        for k in 0..256 {
            let mut expected_re = 0.0;
            let mut expected_im = 0.0;
            for j in 0..256 {
                let phase = -2.0 * PI * k as f64 * j as f64 / 256.0;
                expected_re += re[j] * phase.cos() - im[j] * phase.sin();
                expected_im += re[j] * phase.sin() + im[j] * phase.cos();
            }
            near(r[k], expected_re, 1e-9 * (1.0 + expected_re.abs()));
            near(i[k], expected_im, 1e-9 * (1.0 + expected_im.abs()));
        }
    }

    #[test]
    fn bounds_overflows_and_invalid_floats_fail_closed() {
        let data = vec![0; MAX_DATA_BYTES];
        for length in [0, 1, 3, MAX_DATA_BYTES + 4] {
            assert_eq!(analyze_windows(&vec![0; length], 1024.0, 0.0, options(256)).unwrap_err(), Error::DataLength);
        }
        for fs in [0.0, -1.0, 1e9 + 1.0, f64::INFINITY, f64::NAN] {
            assert_eq!(analyze_windows(&data, fs, 0.0, options(256)).unwrap_err(), Error::SampleRate);
        }
        for fc in [-1e12 - 1.0, 1e12 + 1.0, f64::INFINITY, f64::NAN] {
            assert_eq!(analyze_windows(&data, 1024.0, fc, options(256)).unwrap_err(), Error::CenterFrequency);
        }
        for n in [0, 128, 257, 8192, usize::MAX] {
            assert_eq!(analyze_windows(&data, 1024.0, 0.0, options(n)).unwrap_err(), Error::FftSize);
        }
        for start in [MAX_SAMPLES - 255, usize::MAX] {
            let w = Windows { start_sample: start, ..options(256) };
            assert_eq!(analyze_windows(&data, 1024.0, 0.0, w).unwrap_err(), Error::SampleRange);
        }
        for count in [0, 65, usize::MAX] {
            let w = Windows { frame_count: count, ..options(256) };
            assert_eq!(analyze_windows(&data, 1024.0, 0.0, w).unwrap_err(), Error::FrameCount);
        }
        for hop in [0, MAX_SAMPLES + 1, usize::MAX] {
            let w = Windows { hop_samples: hop, ..options(256) };
            assert_eq!(analyze_windows(&data, 1024.0, 0.0, w).unwrap_err(), Error::Hop);
        }
        let w = Windows { frame_count: 5, ..options(4096) };
        assert_eq!(analyze_windows(&data, 1024.0, 0.0, w).unwrap_err(), Error::CellBudget);
        let w = Windows { start_sample: MAX_SAMPLES - 256, ..options(256) };
        assert!(analyze_windows(&data, 1.0, -1e12, w).is_ok());
    }

    #[test]
    fn overlapping_gapped_and_maximum_windows_remain_explicit() {
        let data = vec![0; MAX_DATA_BYTES];
        for (n, count, hop) in [(256, 64, 1), (256, 64, 256), (256, 64, 1024), (4096, 4, 4096)] {
            let windows = Windows { fft_size: n, start_sample: 0, hop_samples: hop, frame_count: count };
            let report = analyze_windows(&data, 1e9, 1e12, windows).unwrap();
            assert_eq!(report.frames.len(), count);
            for (index, frame) in report.frames.iter().enumerate() {
                assert_eq!(frame.start_sample, index * hop);
                assert_eq!(frame.end_sample_exclusive, index * hop + n);
                assert_eq!(frame.bins.len(), n);
            }
        }
    }

    #[test]
    fn raw_fft_refuses_nonfinite_overflow_and_wrong_lengths() {
        assert_eq!(fft_complex_forward(&[0.0; 4], &[0.0; 4]).unwrap_err(), Error::FftSize);
        assert_eq!(fft_complex_forward(&[0.0; 256], &[0.0; 512]).unwrap_err(), Error::ComplexLength);
        for value in [f64::NAN, f64::INFINITY, f64::MAX] {
            assert_eq!(fft_complex_forward(&[value; 256], &[0.0; 256]).unwrap_err(), Error::NonFinite);
        }
    }
}
