#![forbid(unsafe_code)]

use apex_iq_proof::wire::{parse_request, run_request, MAX_REQUEST};
use std::io::{Read, Write};

fn main() {
    if std::env::args_os().len() != 1 {
        eprintln!("apex-iq-proof: no arguments accepted");
        std::process::exit(2);
    }
    let mut bytes = Vec::new();
    let read = std::io::stdin().lock().take((MAX_REQUEST + 1) as u64).read_to_end(&mut bytes);
    if read.is_err() || bytes.len() > MAX_REQUEST {
        eprintln!("apex-iq-proof: invalid bounded input");
        std::process::exit(2);
    }
    let output = parse_request(&bytes).map_err(|_| ())
        .and_then(|request| run_request(&request).map_err(|_| ()));
    match output {
        Ok(bytes) => {
            if std::io::stdout().lock().write_all(&bytes).is_err() {
                eprintln!("apex-iq-proof: output failed");
                std::process::exit(3);
            }
        }
        Err(()) => {
            // Do not echo source bytes, arbitrary metadata or paths in errors.
            eprintln!("apex-iq-proof: rejected input");
            std::process::exit(2);
        }
    }
}
