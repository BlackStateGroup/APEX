#!/usr/bin/env python3
"""Verify original recovery bytes and static interfaces; never execute firmware."""
import hashlib
import json
from pathlib import Path
import re
import stat

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'docs/ESP32S3_RESTORATION_MANIFEST.json').read_text())
for item in manifest['files']:
    path = root / item['path']
    data = path.read_bytes()
    assert len(data) == item['bytes'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == item['git_blob_sha1'], item['path']
    assert stat.S_IMODE(path.stat().st_mode) == 0o644, item['path']
ble = (root / 'firmware/esp32s3/main/ble_accessory.c').read_text()
ts = (root / 'packages/core/ble-transport.ts').read_text()
raw = re.search(r'#define AXP_UUID\(n\) BLE_UUID128_INIT\(([^)]+)\)', ble).group(1)
for number, name in [(1, 'SERVICE'), (2, 'WRITE'), (3, 'NOTIFY')]:
    values = bytes(number if token.strip() == 'n' else int(token, 16) for token in raw.split(','))
    h = values[::-1].hex()
    uuid = f'{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}'
    assert f"AXP_{name} = '{uuid}'" in ts
assert 'output((const uint8_t *)"AXP_READY", 9, NULL)' in ble
assert "AXP_READY = utf8('AXP_READY')" in ts
assert 'uint8_t bytes[244]' in ble
assert 'Math.min(connection.mtu - 3, 244)' in ts
assert 'if (chunk > 244) chunk = 244' in ble
cmake = (root / 'firmware/esp32s3/main/CMakeLists.txt').read_text()
assert '"../../core/apex.c"' in cmake
for relative in ['main.c', 'ble_accessory.c', '../../core/apex.c']:
    assert (root / 'firmware/esp32s3/main' / relative).is_file()
print(f"PASS: {len(manifest['files'])} exact original files, hashes/modes and static UUID/READY/chunk/source checks. No build or hardware execution.")
