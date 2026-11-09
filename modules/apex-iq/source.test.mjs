import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(moduleDir, '../..');
const source = (path) => readFile(resolve(moduleDir, path), 'utf8');

test('optional module is Android only with no requested permissions', async () => {
  const config = JSON.parse(await source('expo-module.config.json'));
  assert.deepEqual(config, {
    platforms: ['android'], android: { modules: ['expo.modules.apexiq.ApexIqModule'] },
  });
  assert.doesNotMatch(await source('android/src/main/AndroidManifest.xml'), /uses-permission|uses-feature|service|receiver/);
  assert.match(await source('index.ts'), /requireOptionalNativeModule<ApexIqNativeModule>\('ApexIq'\)/);
});

test('native build reuses the reviewed bridge and kernel with strict FP', async () => {
  const cmake = await source('android/src/main/cpp/CMakeLists.txt');
  assert.equal(resolve(moduleDir, 'android/src/main/cpp/../../../../../..'), root);
  for (const relative of ['experimental/hybrid-iq/bridge/bridge.cpp', 'experimental/hybrid-iq/src/kernel.cpp']) {
    assert.ok(cmake.includes(relative));
    await access(resolve(root, relative));
  }
  assert.match(cmake, /-fno-fast-math/);
  assert.match(cmake, /-ffp-contract=off/);
  assert.match(cmake, /-fexceptions/);
  assert.match(cmake, /max-page-size=16384/);
  assert.doesNotMatch(cmake, /cargo|rustc|fast-math(?=\s*\n?\))/);
  assert.match(await source('android/consumer-rules.pro'), /-keep class expo\.modules\.apexiq\.ApexIqNative/);
});

test('registration keeps cancel/reserve synchronous and exposes C++ truthfully', async () => {
  const kotlin = await source('android/src/main/java/expo/modules/apexiq/ApexIqModule.kt');
  for (const name of ['capabilities', 'openSession', 'reserve', 'cancel', 'closeSession']) {
    assert.ok(kotlin.includes(`Function("${name}")`));
    assert.ok(!kotlin.includes(`AsyncFunction("${name}")`));
  }
  assert.match(kotlin, /AsyncFunction\("execute"\).*ByteArray, promise: Promise/);
  assert.match(kotlin, /OnDestroy \{ coordinator\.destroy\(owner\) \}/);
  assert.match(kotlin, /"backend" to "cpp"/);
  assert.match(kotlin, /"mobileRust" to false/);
  assert.match(kotlin, /"contractVersion" to 1/);
});

test('JNI never pins a JS/Java buffer while native computes', async () => {
  const jni = await source('android/src/main/cpp/apex_iq_jni.cpp');
  assert.match(jni, /GetByteArrayRegion/);
  assert.match(jni, /std::vector<uint8_t> bytes/);
  assert.match(jni, /apex_iq_bridge_v1/);
  assert.match(jni, /CallBooleanMethod/);
  assert.doesNotMatch(jni, /GetPrimitiveArrayCritical|GetByteArrayElements|NewGlobalRef|AttachCurrentThread/);
});

test('Gradle explicitly bounds CMake ABIs and rejects empty or unsupported selections', async () => {
  const gradle = await source('android/build.gradle');
  assert.match(gradle, /def apexIqSupportedAbis = \['arm64-v8a', 'x86_64', 'armeabi-v7a', 'x86'\]/);
  assert.match(gradle, /findProperty\('reactNativeArchitectures'\)/);
  // Null means omitted; an empty property must never silently select all ABIs.
  assert.match(gradle, /apexIqArchitectureProperty == null\s*\? apexIqSupportedAbis\s*:/);
  // Keep empty trailing entries for validation, rather than accepting "arm64-v8a,".
  assert.match(gradle, /\.split\(',', -1\)\.collect \{ it\.trim\(\) \}/);
  assert.match(gradle, /apexIqRequestedAbis\.isEmpty\(\)/);
  assert.match(gradle, /apexIqRequestedAbis\.any \{ !apexIqSupportedAbis\.contains\(it\) \}/);
  assert.match(gradle, /apexIqRequestedAbis\.toSet\(\)\.size\(\) != apexIqRequestedAbis\.size\(\)/);
  assert.match(gradle, /throw new GradleException\('reactNativeArchitectures must be a nonempty/);
  // Must apply to native compilation itself, not merely APK packaging.
  assert.match(gradle, /externalNativeBuild\s*\{\s*cmake\s*\{\s*abiFilters\(\*apexIqRequestedAbis\)/);
  assert.equal((gradle.match(/abiFilters\(/g) ?? []).length, 1);
});
