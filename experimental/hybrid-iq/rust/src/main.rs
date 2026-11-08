//! Host-only AXHF/AXHR parity harness. Uncompiled locally until the Rust CI gate.
use apex_hybrid_iq_host_proof::{analyze, RuntimePlan, Windows};
use std::io::{self, Read, Write};
use std::time::Instant;
const MAX_REQUEST: usize = 32 + 262_144 + (3 * 4096 - 2) * 8;
fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().expect("validated framing"))
}
fn run() -> Result<(), ()> {
    if std::env::args_os().count() != 1 { return Err(()); }
    let mut bytes = Vec::new();
    io::stdin().lock().take((MAX_REQUEST + 1) as u64).read_to_end(&mut bytes).map_err(|_| ())?;
    if bytes.len() < 32 || bytes.len() > MAX_REQUEST || &bytes[..8] != b"AXHF\x01\0\0\0" { return Err(()); }
    let length = u32_at(&bytes, 8) as usize;
    let n = u32_at(&bytes, 12) as usize;
    let iterations = u32_at(&bytes, 28);
    if !matches!(n, 256 | 512 | 1024 | 2048 | 4096) || length == 0 || length > 262_144 ||
        length % 4 != 0 || iterations == 0 || iterations > 1000 ||
        bytes.len() != 32 + length + (3 * n - 2) * 8 { return Err(()); }
    let windows = Windows { fft_size:n as u32, start_sample:u32_at(&bytes,16),
        hop_samples:u32_at(&bytes,20),frame_count:u32_at(&bytes,24) };
    let mut at = 32 + length;
    let mut read_values = |count: usize| -> Vec<f64> {
        (0..count).map(|_| {
            let value = f64::from_le_bytes(bytes[at..at + 8].try_into().expect("validated framing"));
            at += 8; value
        }).collect()
    };
    let hann = read_values(n); let cosine = read_values(n-1); let sine = read_values(n-1);
    let plan = RuntimePlan::from_runtime(hann,cosine,sine).map_err(|_| ())?;
    let data = &bytes[32..32+length];
    for _ in 0..3 { std::hint::black_box(analyze(data,windows,&plan).map_err(|_| ())?); }
    let start = Instant::now();
    let mut output = analyze(data,windows,&plan).map_err(|_| ())?;
    std::hint::black_box(output.values());
    for _ in 1..iterations {
        output = analyze(data,windows,&plan).map_err(|_| ())?;
        std::hint::black_box(output.values());
    }
    let elapsed = u64::try_from(start.elapsed().as_nanos()).map_err(|_| ())?;
    let mut response = Vec::with_capacity(24+output.values().len()*8);
    response.extend_from_slice(b"AXHR\x01\0\0\0");
    response.extend_from_slice(&windows.fft_size.to_le_bytes());
    response.extend_from_slice(&windows.frame_count.to_le_bytes());
    response.extend_from_slice(&elapsed.to_le_bytes());
    for value in output.values() { response.extend_from_slice(&value.to_le_bytes()); }
    io::stdout().lock().write_all(&response).map_err(|_| ())
}
fn main() {
    if run().is_err() { eprintln!("apex-hybrid-iq: rejected input"); std::process::exit(2); }
}
