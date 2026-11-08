#!/usr/bin/env python3
"""Verify immutable upstream bytes and stage one explicitly modified source file.

RadioLib is MIT licensed. Its notice must accompany distributed linked artifacts.
The input checkout is never modified. No network or dependency installation.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def prepare(source: Path, output_module: Path):
    source, output_module = source.resolve(), output_module.resolve()
    if output_module.is_relative_to(source):
        raise ValueError("Staged module must be outside the immutable input checkout")
    pin = json.loads((ROOT / "research/radiolib-rx-pin.json").read_text())
    for name, expected in pin["files"].items():
        data = (source / name).read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != expected:
            raise ValueError(f"Pinned source mismatch: {name}: {actual}, expected {expected}")
    module = (source / "src/Module.cpp").read_text()
    # The pinned command-only SPI path calls memcpy with null data and length 0.
    # UBSan detects this despite no bytes being copied. Guard all four payload
    # copy sites consistently, preserving the content for positive lengths.
    replacements = [
        ("memcpy(buffOutPtr, dataOut, numBytes);", "if(numBytes) { memcpy(buffOutPtr, dataOut, numBytes); }", 2),
        ("memcpy(dataIn, &buffIn[this->spiConfig.widths[RADIOLIB_MODULE_SPI_WIDTH_ADDR]/8], numBytes);",
         "if(numBytes) { memcpy(dataIn, &buffIn[this->spiConfig.widths[RADIOLIB_MODULE_SPI_WIDTH_ADDR]/8], numBytes); }", 1),
        ("memcpy(dataIn, &buffIn[cmdLen + (this->spiConfig.widths[RADIOLIB_MODULE_SPI_WIDTH_STATUS] / 8)], numBytes);",
         "if(numBytes) { memcpy(dataIn, &buffIn[cmdLen + (this->spiConfig.widths[RADIOLIB_MODULE_SPI_WIDTH_STATUS] / 8)], numBytes); }", 1),
    ]
    for old, new, count in replacements:
        if module.count(old) != count:
            raise ValueError("Exact pinned patch context mismatch")
        module = module.replace(old, new)
    if hashlib.sha256(module.encode()).hexdigest() != "300521b05a0f6581b82cc2dde0465693f0e101fec2de35b750adb7d7c27234f8":
        raise ValueError("Patched module hash mismatch")
    output_module.parent.mkdir(parents=True, exist_ok=True)
    output_module.write_text(module)
    print(f"Verified {len(pin['files'])} blobs at {pin['commit']}; staged four guarded zero-length copies; SHA256 {hashlib.sha256(module.encode()).hexdigest()}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--radiolib-root", required=True, type=Path)
    parser.add_argument("--output-module", required=True, type=Path)
    args = parser.parse_args()
    prepare(args.radiolib_root.resolve(), args.output_module.resolve())
