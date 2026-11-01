#!/usr/bin/env python3
"""Build the portable firmware and run C tests with the system compiler."""
import argparse
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--sanitize", action="store_true")
args = parser.parse_args()
out = root / "build"
out.mkdir(exist_ok=True)
flags = ["-std=c11", "-Wall", "-Wextra", "-Werror", "-pedantic", "-I", str(root / "firmware/core")]
flags += ["-O1", "-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer"] if args.sanitize else ["-O2"]
suffix = "-san" if args.sanitize else ""
for name, source in [("apex-firmware", "firmware/host/main.c"), ("firmware-tests", "tests/firmware_test.c")]:
    target = out / (name + suffix)
    subprocess.run(["gcc", *flags, str(root / "firmware/core/apex.c"), str(root / source), "-o", str(target)], check=True)
subprocess.run([str(out / ("firmware-tests" + suffix))], check=True)
print(f"Built portable C firmware and passed C checks{' with ASan/UBSan' if args.sanitize else ''}.")
