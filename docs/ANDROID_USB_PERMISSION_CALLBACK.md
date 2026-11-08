# Android USB permission callback repair

## Finding and scope

The Android module on main `2b1266e3243989288b13a343d525857136007fe2`
created a package-scoped immutable `PendingIntent` without a device extra. Its
receiver required `UsbManager.EXTRA_DEVICE` before completing a pending request.
Android ignores the fill-in Intent supplied to an immutable PendingIntent, while
SystemUI supplies both the device and permission result as fill-in extras. The
source paths therefore predict that first-time approval **and denial** are
dropped and reach the 30-second timeout. This is a verified platform-contract
mismatch, not a claim that a physical phone failure was observed.

Sources:

- [Android PendingIntent immutability contract](https://developer.android.com/reference/android/app/PendingIntent#FLAG_IMMUTABLE)
- [AOSP UsbDialogHelper callback construction](https://github.com/aosp-mirror/platform_frameworks_base/blob/main/packages/SystemUI/src/com/android/systemui/usb/UsbDialogHelper.java)
- [AOSP UsbPermissionActivity grants access before sending its response](https://github.com/aosp-mirror/platform_frameworks_base/blob/main/packages/SystemUI/src/com/android/systemui/usb/UsbPermissionActivity.java)

## Repair

`UsbPermissionCallback.create` places the already-known requested device in the
base Intent before constructing the immutable, package-scoped PendingIntent.
`readResult` checks the action, active request nonce and device ID, then queries
`UsbManager.hasPermission(device)`. It deliberately does not trust the optional
`EXTRA_PERMISSION_GRANTED` extra. The receiver uses nullable Boolean handling:
false is a completed denial, not an absent callback. Existing timeout removal,
promise cleanup and detach behavior are preserved.

Each request captures a fresh UUID nonce. `FLAG_CANCEL_CURRENT` replaces the old
PendingIntent instead of updating its extras, so an old system handle cannot
acquire the new request identity. `FLAG_ONE_SHOT` limits sends, and completion,
timeout, detach and module destruction cancel and clear the active callback.
Nonce matching rejects any old broadcast already queued for delivery when a
same-device retry or replacement module instance begins. No mutable
PendingIntent, exported receiver, new permission or changed USB capability is
introduced.

## Automated checks

- `tests/android-usb-permission-source.test.ts` contains source/wiring guards.
  These are host checks, not execution of Kotlin or Android APIs.
- `UsbPermissionCallbackTest` is a Robolectric JVM test suite for API levels
  28, 31, 33, 34 and 37. Its original-construction test demonstrates discarded
  fill-in extras. The repaired production helper is exercised for approval,
  denial, contradictory result extras, no fill-in data, protected callback
  identity, unrelated/inactive requests, timeout cancellation, same-device retry,
  replacement-instance cancellation and replay. UsbDevice is mocked and UsbManager
  permission state is shadowed. No USB device, SystemUI dialog, Binder parcel
  round trip or Expo Promise is exercised by these tests.
- The Android CI job runs `:apex-device:testDebugUnitTest` after native compilation
  and before assembling the debug APK. Robolectric setup follows its
  [Gradle instructions](https://robolectric.org/getting-started/) and
  [SDK compatibility table](https://robolectric.org/compatibility_table/).
  The unit-test JVM explicitly uses Java 21 because API 37 requires it; React
  Native's Java 17 compilation toolchain otherwise selects an older test JVM even
  when Gradle itself runs on Java 21. This changes only the test runtime, not the
  app's compilation target or SDK coverage. Test failures print full exceptions.

The authoring workspace has no discovered Android SDK or Gradle installation.
Native results must be read from the exact PR commit's CI checks; adding a test
or compiling an APK is not proof of a passing physical acceptance run.

## Physical acceptance: NOT RUN

Use an authorized Android phone with USB host support and an owned CDC-ACM
accessory. Record phone/model, OS/API, APEX source commit and APK SHA-256,
accessory/firmware revision, whether prior USB permission existed, user action,
observed result and elapsed time. Run on a pre-Android-12 device where available,
Android 12+, and Android 13+ with the non-exported receiver registration path.

1. **First-time approval:** begin with no app USB grant (clear it or use a clean
   installation according to the phone's normal controls). Attach the accessory,
   select USB connect, accept the real system permission dialog. Acceptance:
   permission resolves true promptly after the response, CDC open/identity/ping
   succeed, and no 30-second permission-timeout error appears.
2. **First-time denial:** reset the grant, request again and choose Deny.
   Acceptance: permission resolves false promptly, the app shows permission
   denied, no connection opens and the UI does not remain busy for 30 seconds.
3. **Deny then retry/approve:** make a deliberate new request and approve it.
   Acceptance: the new request succeeds once with no orphaned pending promise.
4. **Already granted:** reconnect while permission remains valid. Acceptance:
   the existing fast path succeeds without a redundant permission dialog.
5. **Detach while dialog is open:** unplug before answering. Acceptance:
   the request rejects with the detach reason and leaves no busy state. Any
   delayed system callback must not reconnect or satisfy a later request.
6. **Leave dialog unanswered:** allow the timeout to fire, then dismiss the
   dialog and deliberately retry. Acceptance: bounded timeout, one terminal
   result per request, no stale completion of the later request.

Attach measured results to a separate verification record. All six physical
cases remain NOT RUN until such a record exists.
