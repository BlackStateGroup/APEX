"""Pin/patch validation tests using a caller-supplied source checkout, no network."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from prepare_radiolib_rx import prepare

parser = argparse.ArgumentParser()
parser.add_argument("--radiolib-root", required=True, type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="apex-radio-pin-") as temporary:
    base = Path(temporary)
    source = base / "source"
    pin = json.loads((ROOT / "research/radiolib-rx-pin.json").read_text())
    for name in pin["files"]:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.radiolib_root / name, path)
    original = (source / "src/Module.cpp").read_bytes()
    stage = base / "staged/Module.cpp"
    prepare(source, stage)
    assert (source / "src/Module.cpp").read_bytes() == original
    assert hashlib.sha256(stage.read_bytes()).hexdigest() == "300521b05a0f6581b82cc2dde0465693f0e101fec2de35b750adb7d7c27234f8"
    try:
        prepare(source, source / "src/Module.cpp")
        raise AssertionError("Input overwrite was allowed")
    except ValueError as error:
        assert "outside" in str(error)
    (source / "src/Module.cpp").write_bytes(original + b"// altered\n")
    rejected = base / "rejected.cpp"
    try:
        prepare(source, rejected)
        raise AssertionError("Modified upstream source was allowed")
    except ValueError as error:
        assert "Pinned source mismatch" in str(error)
    assert not rejected.exists()
print("PASS: exact pin, deterministic four-site patch, immutable inputs, wrong-pin rejection, no output on failure.")
