//! Unintegrated host proof: Rust owns memory and validates dimensions; C++ does
//! bounded FFT arithmetic using the exact coefficient plan supplied by JS.
//! JS must retain magnitude/log/peak projection. No RF/acquisition/provenance API.
//! This wrapper is source-only until cargo tests have actually passed.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(C)]
pub struct Windows {
    pub fft_size: u32,
    pub start_sample: u32,
    pub hop_samples: u32,
    pub frame_count: u32,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error { Bounds, Coefficient, Runtime, UnknownNativeStatus }
fn supported(n: usize) -> bool { matches!(n, 256 | 512 | 1024 | 2048 | 4096) }

/// Owned runtime-generated coefficients. Bounds checks do not establish that
/// values are canonical Hann/twiddle coefficients: the JS plan producer remains
/// trusted. Values are not recomputed using Rust trigonometry.
pub struct RuntimePlan { hann: Vec<f64>, cosine: Vec<f64>, sine: Vec<f64> }
impl RuntimePlan {
    pub fn from_runtime(hann: Vec<f64>, cosine: Vec<f64>, sine: Vec<f64>) -> Result<Self, Error> {
        let n = hann.len();
        if !supported(n) || cosine.len() != n - 1 || sine.len() != n - 1 { return Err(Error::Bounds); }
        if !hann.iter().all(|x| x.is_finite() && *x >= 0.0 && *x <= 1.0) ||
            !cosine.iter().chain(sine.iter()).all(|x| x.is_finite() && x.abs() <= 1.0) {
            return Err(Error::Coefficient);
        }
        Ok(Self { hann, cosine, sine })
    }
}
/// Frame-major [real[n], imaginary[n]], unshifted FFT order. The buffer is
/// newly allocated per call; the returned slice cannot mutate it.
pub struct ComplexFrames { windows: Windows, values: Vec<f64> }
impl ComplexFrames {
    pub fn windows(&self) -> Windows { self.windows }
    pub fn values(&self) -> &[f64] { &self.values }
}
extern "C" {
    fn apex_iq_fft_v1(data: *const u8, data_len: usize, windows: Windows,
        hann: *const f64, hann_len: usize, cosine: *const f64, sine: *const f64,
        twiddle_len: usize, output: *mut f64, output_len: usize) -> i32;
}

pub fn analyze(data: &[u8], windows: Windows, plan: &RuntimePlan) -> Result<ComplexFrames, Error> {
    let n = windows.fft_size as usize;
    if data.is_empty() || data.len() > 262_144 || data.len() % 4 != 0 || !supported(n) ||
        windows.frame_count == 0 || windows.frame_count > 64 || windows.hop_samples == 0 ||
        windows.hop_samples > 65_536 || n * windows.frame_count as usize > 16_384 ||
        plan.hann.len() != n { return Err(Error::Bounds); }
    let end = u64::from(windows.start_sample) + u64::from(windows.frame_count - 1) *
        u64::from(windows.hop_samples) + u64::from(windows.fft_size);
    if end > (data.len() / 4) as u64 { return Err(Error::Bounds); }
    let mut output = vec![0.0; 2 * n * windows.frame_count as usize];
    // SAFETY: Rust slices/Vecs provide initialized readable aligned input memory
    // for the exact supplied lengths. RuntimePlan privately preserves equal
    // cosine/sine lengths and required dimensions. `output` is a fresh, aligned,
    // initialized allocation disjoint from all borrowed input allocations.
    // All borrows live through this synchronous call. The reviewed C++ function
    // retains no pointers, allocates nothing, and throws no exceptions.
    let status = unsafe { apex_iq_fft_v1(data.as_ptr(), data.len(), windows,
        plan.hann.as_ptr(), plan.hann.len(), plan.cosine.as_ptr(), plan.sine.as_ptr(),
        plan.cosine.len(), output.as_mut_ptr(), output.len()) };
    match status {
        0 => Ok(ComplexFrames { windows, values: output }),
        1 => Err(Error::Bounds), 2 => Err(Error::Coefficient), 3 => Err(Error::Runtime),
        _ => Err(Error::UnknownNativeStatus),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn plan(n: usize) -> RuntimePlan { RuntimePlan::from_runtime(vec![0.5;n],vec![1.0;n-1],vec![0.0;n-1]).unwrap() }
    fn windows(n: usize) -> Windows { Windows { fft_size:n as u32,start_sample:0,hop_samples:n as u32,frame_count:1 } }
    #[test]
    fn zero_and_origin_impulse_are_owned_and_bounded() {
        for n in [256,512,1024,2048,4096] {
            let p=plan(n); let mut data=vec![0;n*4];
            let zero=analyze(&data,windows(n),&p).unwrap();
            assert_eq!(zero.windows(),windows(n)); assert!(zero.values().iter().all(|x| *x==0.0));
            data[0..2].copy_from_slice(&16384_i16.to_le_bytes());
            data[2..4].copy_from_slice(&(-8192_i16).to_le_bytes());
            let before=data.clone(); let result=analyze(&data,windows(n),&p).unwrap();
            assert_eq!(before,data); assert!(result.values()[..n].iter().all(|x| *x==0.25));
            assert!(result.values()[n..].iter().all(|x| *x== -0.125));
            data.fill(0); assert_eq!(result.values()[0],0.25); // output owns its data
        }
    }
    #[test]
    fn invalid_dimensions_and_nonfinite_coefficients_fail_closed() {
        let p=plan(256);let data=vec![0;1024];
        for w in [Windows{fft_size:257,..windows(256)},Windows{start_sample:u32::MAX,..windows(256)},
            Windows{hop_samples:0,..windows(256)},Windows{frame_count:0,..windows(256)},
            Windows{frame_count:u32::MAX,..windows(256)}] {
            assert!(matches!(analyze(&data,w,&p),Err(Error::Bounds)));
        }
        for length in [0,1,3,262148] {assert!(matches!(analyze(&vec![0;length],windows(256),&p),Err(Error::Bounds)));}
        for value in [f64::NAN,f64::INFINITY,-0.1,1.1] {
            let mut hann=vec![0.5;256];hann[255]=value;
            assert!(matches!(RuntimePlan::from_runtime(hann,vec![1.0;255],vec![0.0;255]),Err(Error::Coefficient)));
        }
        assert!(matches!(RuntimePlan::from_runtime(vec![0.5;256],vec![1.0;254],vec![0.0;255]),Err(Error::Bounds)));
    }
    #[test]
    fn overlapping_frame_layout_and_cell_budget() {
        let p=plan(256); let data=vec![0;262144];
        let w=Windows{frame_count:64,hop_samples:1,..windows(256)};
        assert_eq!(analyze(&data,w,&p).unwrap().values().len(),32768);
        let p=plan(4096); let w=Windows{frame_count:5,..windows(4096)};
        assert!(matches!(analyze(&data,w,&p),Err(Error::Bounds)));
    }
}
