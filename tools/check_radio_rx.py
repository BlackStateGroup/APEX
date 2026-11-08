#!/usr/bin/env python3
"""Build and execute original RX code against exact pinned RadioLib source bytes.

No downloads, radio access, flashing, or dependency installation. The external
source directory is caller-provided. Only the listed source subset is linked.
"""
import argparse
import pathlib
import subprocess
from prepare_radiolib_rx import prepare

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--radiolib-root", required=True, type=pathlib.Path)
parser.add_argument("--sanitize", action="store_true")
args = parser.parse_args()
radio = args.radiolib_root.resolve()
build = ROOT / "build" / ("radio-rx-san" if args.sanitize else "radio-rx")
build.mkdir(parents=True, exist_ok=True)
patched_module = build / "Module.cpp"
prepare(radio, patched_module)
flags = ["-std=c++20", "-g", "-O1", "-Wall", "-Wextra", "-Wpedantic", "-DRADIOLIB_STATIC_ONLY=1",
         "-DRADIOLIB_STATIC_ARRAY_SIZE=64", "-DRADIOLIB_STATIC_SPI_ARRAY_SIZE=76", "-DRADIOLIB_EXCLUDE_DIRECT_RECEIVE=1", "-I", str(radio / "src")]
san = ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"] if args.sanitize else []
def run(command):
    print("+ " + " ".join(map(str, command)), flush=True)
    subprocess.run(command, check=True, cwd=ROOT, timeout=120)
objects = []
core = build / "apex.o"
run(["gcc", "-std=c11", "-g", "-O1", "-Wall", "-Wextra", "-Werror", *san, "-c", "firmware/core/apex.c", "-o", str(core)])
objects.append(core)
sources = [radio / name for name in ("src/Hal.cpp", "src/Module.cpp", "src/utils/Utils.cpp", "src/protocols/PhysicalLayer/PhysicalLayer.cpp", "src/modules/CC1101/CC1101.cpp")]
sources[1] = patched_module
sources += [ROOT / "firmware/radio_rx" / name for name in ("rx_service.cpp", "receive_only_hal.cpp", "cc1101_receiver.cpp")]
sources += [ROOT / "tests/radio_rx_test.cpp"]
for index, source in enumerate(sources):
    obj = build / f"part{index}.o"
    own = source.is_relative_to(ROOT) and source != patched_module
    run(["g++", *flags, *san, *(["-Werror"] if own else []), "-c", str(source), "-o", str(obj)])
    objects.append(obj)
binary = build / "radio-rx-tests"
run(["g++", *san, *map(str, objects), "-o", str(binary)])
run([str(binary)])
print("Host tests passed. ESP-IDF cross-build and physical radio acceptance are separate, unproven gates.")
