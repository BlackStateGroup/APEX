//! Experimental host proof framing. Not AXP, an FFI ABI or a transport protocol.
//! Read one bounded request to EOF and emit one bounded result. No pointer casts.

use crate::{TimeFrequency, Windows, MAX_DATA_BYTES};

pub const REQUEST_HEADER: usize = 48;
pub const MAX_REQUEST: usize = REQUEST_HEADER + MAX_DATA_BYTES;
pub const MAX_ITERATIONS: u32 = 1000;

#[derive(Debug)]
pub struct Request<'a> {
    data: &'a [u8],
    sample_rate: f64,
    center_frequency: f64,
    windows: Windows,
    iterations: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WireError { Header, Version, Mode, Length, Iterations }

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("checked fixed header"))
}
fn f64_at(bytes: &[u8], offset: usize) -> f64 {
    f64::from_le_bytes(bytes[offset..offset + 8].try_into().expect("checked fixed header"))
}

pub fn parse_request(bytes: &[u8]) -> Result<Request<'_>, WireError> {
    if bytes.len() < REQUEST_HEADER || &bytes[..4] != b"AXIQ" { return Err(WireError::Header); }
    if bytes[4..6] != [1, 0] { return Err(WireError::Version); }
    if bytes[6..8] != [1, 0] { return Err(WireError::Mode); }
    let size = u32_at(bytes, 8) as usize;
    if size == 0 || size > MAX_DATA_BYTES || size % 4 != 0 || bytes.len() != REQUEST_HEADER + size {
        return Err(WireError::Length);
    }
    let iterations = u32_at(bytes, 28);
    if iterations == 0 || iterations > MAX_ITERATIONS { return Err(WireError::Iterations); }
    Ok(Request {
        data: &bytes[REQUEST_HEADER..], sample_rate: f64_at(bytes, 32), center_frequency: f64_at(bytes, 40),
        windows: Windows {
            fft_size: u32_at(bytes, 12) as usize, start_sample: u32_at(bytes, 16) as usize,
            hop_samples: u32_at(bytes, 20) as usize, frame_count: u32_at(bytes, 24) as usize,
        },
        iterations,
    })
}

/// Internal-use response encoder. The caller supplies a report produced by the
/// kernel, not untrusted externally populated result structures.
pub(crate) fn encode_response(report: &TimeFrequency, elapsed_ns: u64) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(40 + report.frames.len() * (24 + 56 * report.windows.fft_size));
    bytes.extend_from_slice(b"AXIR");
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&0_u16.to_le_bytes());
    bytes.extend_from_slice(&(report.windows.fft_size as u32).to_le_bytes());
    bytes.extend_from_slice(&(report.frames.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&elapsed_ns.to_le_bytes());
    bytes.extend_from_slice(&report.bin_spacing_hz.to_le_bytes());
    bytes.extend_from_slice(&report.window_duration_seconds.to_le_bytes());
    for frame in &report.frames {
        bytes.extend_from_slice(&(frame.start_sample as u32).to_le_bytes());
        bytes.extend_from_slice(&(frame.end_sample_exclusive as u32).to_le_bytes());
        bytes.extend_from_slice(&frame.peak_index.map_or(-1_i32, |index| index as i32).to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&frame.window_sum.to_le_bytes());
        for bin in &frame.bins {
            bytes.extend_from_slice(&bin.signed_bin.to_le_bytes());
            bytes.extend_from_slice(&(bin.raw_index as u32).to_le_bytes());
            bytes.extend_from_slice(&bin.offset_hz.to_le_bytes());
            bytes.extend_from_slice(&bin.declared_rf_hz.to_le_bytes());
            bytes.extend_from_slice(&bin.amplitude.to_le_bytes());
            bytes.push(u8::from(bin.db_relative_to_unit_amplitude.is_some()));
            bytes.extend_from_slice(&[0; 7]);
            bytes.extend_from_slice(&bin.db_relative_to_unit_amplitude.unwrap_or(0.0).to_le_bytes());
            bytes.extend_from_slice(&bin.display_db.to_le_bytes());
        }
    }
    bytes
}

/// Run a bounded request in the host proof. Timing includes repeated validation,
/// allocation, compute and dropping previous results; excludes parsing, warmup,
/// serialization, process startup, transport, preparation/hashing and UI.
pub fn run_request(request: &Request<'_>) -> Result<Vec<u8>, crate::Error> {
    use std::hint::black_box;
    use std::time::Instant;
    // This harness-only warmup has the same three-iteration count as the JS side.
    for _ in 0..3 {
        black_box(crate::analyze_windows(request.data, request.sample_rate, request.center_frequency, request.windows)?);
    }
    let start = Instant::now();
    let mut result = crate::analyze_windows(black_box(request.data), request.sample_rate, request.center_frequency, request.windows)?;
    black_box(&result);
    for _ in 1..request.iterations {
        result = crate::analyze_windows(black_box(request.data), request.sample_rate, request.center_frequency, request.windows)?;
        black_box(&result);
    }
    let elapsed_ns = u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX);
    Ok(encode_response(&result, elapsed_ns))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn valid() -> Vec<u8> {
        let mut bytes = vec![0; REQUEST_HEADER + 1024];
        bytes[..4].copy_from_slice(b"AXIQ");
        bytes[4] = 1; bytes[6] = 1;
        for (offset, value) in [(8, 1024_u32), (12, 256), (16, 0), (20, 256), (24, 1), (28, 1)] {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        bytes[32..40].copy_from_slice(&1024_f64.to_le_bytes());
        bytes
    }
    #[test]
    fn exact_lengths_modes_versions_and_iteration_limit() {
        let bytes = valid();
        assert_eq!(parse_request(&bytes).unwrap().data.len(), 1024);
        for end in 0..bytes.len() { assert!(parse_request(&bytes[..end]).is_err()); }
        let mut trailing = bytes.clone(); trailing.push(0);
        assert_eq!(parse_request(&trailing).unwrap_err(), WireError::Length);
        for offset in [0, 4, 5, 6, 7] {
            let mut bad = bytes.clone(); bad[offset] ^= 2;
            assert!(parse_request(&bad).is_err());
        }
        for value in [0_u32, 1001, u32::MAX] {
            let mut bad = bytes.clone(); bad[28..32].copy_from_slice(&value.to_le_bytes());
            assert_eq!(parse_request(&bad).unwrap_err(), WireError::Iterations);
        }
    }
    #[test]
    fn response_size_null_marker_and_version_are_exact() {
        let bytes = valid();
        let result = run_request(&parse_request(&bytes).unwrap()).unwrap();
        assert_eq!(result.len(), 40 + 24 + 256 * 56);
        assert_eq!(&result[..8], b"AXIR\x01\x00\x00\x00");
        assert_eq!(i32::from_le_bytes(result[48..52].try_into().unwrap()), -1);
        assert_eq!(result[64 + 32], 0);
    }
}
