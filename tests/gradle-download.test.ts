import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { configureGradleDownload, GRADLE_DOWNLOAD_TIMEOUT_MS } from '../tools/configure-gradle-download.mjs';

// Exact properties shipped in installed expo@58.0.22/template.tgz.
const template = String.raw`distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-9.4.1-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
const helper = new URL('../tools/configure-gradle-download.mjs', import.meta.url);

test('Gradle bootstrap gets a finite connect/read timeout without other property changes', () => {
  assert.equal(GRADLE_DOWNLOAD_TIMEOUT_MS, 60000);
  const after = configureGradleDownload(template);
  assert.equal(after, template.replace('networkTimeout=10000', 'networkTimeout=60000'));
  assert.equal(configureGradleDownload(after), after);
});
test('Gradle timeout edit preserves comments, CRLF and final newline convention', () => {
  for (const before of [template.replaceAll('\n', '\r\n'), template.trimEnd(), '# wrapper\n! comment\n\n' + template]) {
    assert.equal(configureGradleDownload(before), before.replace('networkTimeout=10000', 'networkTimeout=60000'));
  }
});
const invalid = [
  template.replace('networkTimeout=10000\n', ''),
  template + 'networkTimeout=10000\n',
  template.replace('networkTimeout=10000', 'networkTimeout:10000'),
  template.replace('networkTimeout=10000', 'networkTimeout =10000'),
  template + String.raw`network\u0054imeout=10000` + '\n',
  template.replace('networkTimeout=10000', 'networkTimeout=10000\\\n0'),
  ...['0', '-1', 'Infinity', '120000', '010000', '10000 ', '10001'].map(v => template.replace('networkTimeout=10000', `networkTimeout=${v}`)),
];
test('missing, duplicate, ambiguous and unexpected timeout properties fail closed', () => {
  for (const before of invalid) assert.throws(() => configureGradleDownload(before));
});
test('CLI configures a generated file, is idempotent, and leaves rejected files unchanged', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-gradle-download-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'gradle-wrapper.properties');
  const run = () => spawnSync(process.execPath, [helper.pathname, file], { encoding: 'utf8' });
  assert.notEqual(run().status, 0); // Missing prebuild output is an error.
  await writeFile(file, template);
  assert.equal(run().status, 0);
  assert.equal(await readFile(file, 'utf8'), configureGradleDownload(template));
  assert.equal(run().status, 0);
  for (const before of invalid) {
    await writeFile(file, before);
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(file, 'utf8'), before);
  }
});
test('Android CI configures wrapper after prebuild and before either compile step', async () => {
  const workflow = await readFile(new URL('../.github/workflows/foundation.yml', import.meta.url), 'utf8');
  const android = workflow.split('  android:\n')[1]!.split('  esp32s3:\n')[0]!;
  const prebuild = android.indexOf('npx expo prebuild --platform android --no-install');
  const configure = android.indexOf('node tools/configure-gradle-download.mjs android/gradle/wrapper/gradle-wrapper.properties');
  assert.ok(prebuild >= 0 && configure > prebuild);
  assert.ok(android.indexOf('./gradlew :apex-device:compileDebugKotlin') > configure);
  assert.ok(android.indexOf('./gradlew :app:assembleDebug') > configure);
  assert.match(android, /timeout-minutes: 35/);
  assert.equal(android.match(/configure-gradle-download/g)?.length, 1);
});
