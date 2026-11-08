import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Wiring guards only. Native callback behavior is covered by UsbPermissionCallbackTest.
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const root = 'modules/apex-device/android';
const callback = source(`${root}/src/main/java/expo/modules/apexdevice/UsbPermissionCallback.kt`);
const module = source(`${root}/src/main/java/expo/modules/apexdevice/ApexDeviceModule.kt`);

test('Android USB callback captures device identity before immutable PendingIntent creation', () => {
  assert.match(callback, /Intent\(action\)\.setPackage\(context\.packageName\)\s*\.putExtra\(UsbManager\.EXTRA_DEVICE, device\)/);
  assert.match(callback, /PendingIntent\.FLAG_CANCEL_CURRENT or PendingIntent\.FLAG_ONE_SHOT or PendingIntent\.FLAG_IMMUTABLE/);
  assert.doesNotMatch(callback, /FLAG_MUTABLE|FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT/);
  assert.match(module, /UsbPermissionCallback\.create\(context\(\), permissionAction\(\), device\)/);
});

test('Android USB receiver uses manager state and preserves false as a completed result', () => {
  assert.match(callback, /!active/);
  assert.match(callback, /intent\.getStringExtra\(EXTRA_REQUEST_ID\) != requestId/);
  assert.match(callback, /device\.deviceId != deviceId/);
  assert.match(callback, /return manager\.hasPermission\(device\)/);
  assert.doesNotMatch(callback, /getBooleanExtra/);
  assert.match(callback, /UUID\.randomUUID\(\)\.toString\(\)/);
  assert.equal((module.match(/permissionCallback\?\.cancel\(\); permissionCallback = null/g) ?? []).length, 2);
  assert.match(module, /val granted = permissionCallback\?\.readResult\(intent, manager\(\)\) \?: return/);
  assert.match(module, /handler\.removeCallbacks\(it\)[\s\S]*?permissionPromise = null; permissionDeviceId = null; permissionTimeout = null[\s\S]*?promise\?\.resolve\(granted\)/);
});

test('Android CI runs native permission regression tests before assembling the APK', () => {
  const workflow = source('.github/workflows/foundation.yml');
  assert.match(workflow, /:apex-device:testDebugUnitTest[\s\S]*?:app:assembleDebug/);
  const build = source(`${root}/build.gradle`);
  assert.match(build, /unitTests\.includeAndroidResources = true/);
  assert.match(build, /org\.robolectric:robolectric:4\.17/);
  const tests = source(`${root}/src/test/java/expo/modules/apexdevice/UsbPermissionCallbackTest.kt`);
  assert.match(tests, /sdk = \[28, 31, 33, 34, 37\]/);
  for (const name of ['originalImmutableCallbackLosesBothSystemExtras', 'approvalResolvesTrueUsingCapturedDeviceAndManagerState', 'denialResolvesFalseInsteadOfDroppingCallback', 'forgedGrantExtraCannotOverrideDeniedManagerState', 'unmatchedOrInactiveRequestsAreIgnored', 'timeoutCancellationInvalidatesSystemHandleAndRetryCanSucceed', 'alreadyDeliveredOldIntentCannotSettleSameDeviceRetry', 'replacementInstanceDoesNotUpdatePreviousSystemHandle']) {
    assert.ok(tests.includes(`fun ${name}(`), name);
  }
});
