// Host-only, dependency-free build. No network, package fetch, or toolchain install.
use std::{env, path::PathBuf, process::Command};
fn run(command: &mut Command) {
    let status = command.status().expect("existing host build tool must run");
    assert!(status.success(), "host build tool failed: {command:?}");
}
fn main() {
    assert_eq!(env::var("HOST").unwrap(), env::var("TARGET").unwrap(), "host proof only; cross compilation is not configured");
    assert_eq!(env::var("CARGO_CFG_TARGET_OS").unwrap(), "linux", "only Linux host linking is configured");
    println!("cargo:rerun-if-changed=../src/kernel.cpp");
    println!("cargo:rerun-if-changed=../src/kernel.h");
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let object = out.join("kernel.o");
    run(Command::new("g++").args(["-std=c++17", "-O3", "-fno-fast-math", "-ffp-contract=off", "-fPIC", "-Wall", "-Wextra", "-Wpedantic", "-Wconversion", "-Werror", "-c", "../src/kernel.cpp", "-o"]).arg(&object));
    run(Command::new("ar").arg("crs").arg(out.join("libapex_iq_fft.a")).arg(&object));
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=apex_iq_fft");
    println!("cargo:rustc-link-lib=dylib=stdc++");
    println!("cargo:rustc-link-lib=dylib=m");
}
