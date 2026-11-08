import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('reviewed ESP32 transport: actual C fault injection and default-off symbol isolation', () => {
  const manifest = JSON.parse(readFileSync('docs/ESP32S3_RESTORATION_MANIFEST.json', 'utf8'));
  for (const entry of manifest.files) {
    assert.equal(createHash('sha256').update(readFileSync(entry.path)).digest('hex'), entry.sha256, entry.path);
  }
  const directory = mkdtempSync(join(tmpdir(), 'apex-reviewed-host-'));
  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return result.stdout;
  }
  try {
    const common = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation'];
    const binary = join(directory, 'harness');
    run('gcc', [...common, '-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1', '-DESP_PLATFORM',
      '-Itests/esp32-reviewed-host/fakes', '-Ifirmware/core', '-Ifirmware/esp32s3/main',
      'tests/esp32-reviewed-host/harness.c', 'firmware/core/apex.c', '-o', binary]);
    assert.match(run(binary, []), /RESULT 19 revised scenarios passed/);
    const disabledNotify = spawnSync('gcc', [...common,
      '-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1', '-DMYNEWT_VAL_BLE_GATT_NOTIFY=0',
      '-DESP_PLATFORM', '-Itests/esp32-reviewed-host/fakes', '-Ifirmware/core',
      '-Ifirmware/esp32s3/main', '-c', 'firmware/esp32s3-reviewed/main/ble_accessory.c',
      '-o', join(directory, 'disabled-notify.o')], { encoding: 'utf8', timeout: 30000 });
    assert.notEqual(disabledNotify.status, 0);
    assert.match(disabledNotify.stderr, /APEX reviewed BLE requires BLE_GATT_NOTIFY enabled/);
    // Empty sdkconfig and explicit zero must not reference any SDK header/symbol.
    writeFileSync(join(directory, 'sdkconfig.h'), '');
    writeFileSync(join(directory, 'off.c'), 'void apex_ble_start(void); int main(void) { apex_ble_start(); return 0; }\n');
    for (const flags of [[], ['-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=0']]) {
      const object = join(directory, 'off.o');
      run('gcc', [...common, ...flags, '-I' + directory, '-c',
        'firmware/esp32s3-reviewed/main/ble_accessory.c', '-o', object]);
      assert.equal(run('nm', ['-u', object]).trim(), '');
      const exports = run('nm', ['--defined-only', object]).trim();
      assert.match(exports, /^[0-9a-f]+ T apex_ble_start$/);
      run('gcc', [...common, join(directory, 'off.c'), object, '-o', join(directory, 'off')]);
      run(join(directory, 'off'), []);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
