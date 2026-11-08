package expo.modules.apexdevice

import android.app.Application
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Looper
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** JVM Android API tests, not a USB device/dialog or physical-phone acceptance run. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 31, 33, 34, 37], application = Application::class)
class UsbPermissionCallbackTest {
  private lateinit var context: Context
  private lateinit var usb: UsbManager
  private lateinit var device: UsbDevice
  private lateinit var action: String

  @Before
  fun setUp() {
    context = RuntimeEnvironment.getApplication()
    usb = context.getSystemService(Context.USB_SERVICE) as UsbManager
    action = context.packageName + ".APEX_USB_PERMISSION"
    device = mock(UsbDevice::class.java)
    `when`(device.deviceId).thenReturn(7)
    `when`(device.deviceName).thenReturn("/dev/bus/usb/001/007")
    shadowOf(usb).addOrUpdateUsbDevice(device, false)
  }

  @Suppress("DEPRECATION")
  private fun receive(pending: PendingIntent, fillIn: Intent?): Intent {
    var received: Intent? = null
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) { received = intent }
    }
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, IntentFilter(action))
    }
    try {
      pending.send(context, 0, fillIn)
      shadowOf(Looper.getMainLooper()).idle()
      return requireNotNull(received) { "Expected the permission callback broadcast" }
    } finally {
      context.unregisterReceiver(receiver)
    }
  }

  private fun response(granted: Boolean) = Intent()
    .putExtra(UsbManager.EXTRA_DEVICE, device)
    .putExtra(UsbManager.EXTRA_PERMISSION_GRANTED, granted)

  private fun deliver(fillIn: Intent?): Pair<UsbPermissionCallback, Intent> {
    val callback = UsbPermissionCallback.create(context, action, device)
    return callback to receive(callback.pendingIntent, fillIn)
  }

  @Test
  fun originalImmutableCallbackLosesBothSystemExtras() {
    // Exact construction used before this fix, including the package restriction.
    val original = PendingIntent.getBroadcast(context, device.deviceId,
      Intent(action).setPackage(context.packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    shadowOf(usb).addOrUpdateUsbDevice(device, true)
    val received = receive(original, response(true))
    assertFalse(received.hasExtra(UsbManager.EXTRA_DEVICE))
    assertFalse(received.hasExtra(UsbManager.EXTRA_PERMISSION_GRANTED))
    original.cancel()
  }

  @Test
  fun approvalResolvesTrueUsingCapturedDeviceAndManagerState() {
    shadowOf(usb).addOrUpdateUsbDevice(device, true)
    val (callback, received) = deliver(response(true))
    assertTrue(received.hasExtra(UsbManager.EXTRA_DEVICE))
    assertFalse(received.hasExtra(UsbManager.EXTRA_PERMISSION_GRANTED))
    assertEquals(context.packageName, received.`package`)
    assertEquals(true, callback.readResult(received, usb))
  }

  @Test
  fun denialResolvesFalseInsteadOfDroppingCallback() {
    val (callback, received) = deliver(response(false))
    assertEquals(false, callback.readResult(received, usb))
  }

  @Test
  fun forgedGrantExtraCannotOverrideDeniedManagerState() {
    val (callback, received) = deliver(response(true))
    assertEquals(false, callback.readResult(received, usb))
  }

  @Test
  fun falseGrantExtraCannotOverrideGrantedManagerState() {
    shadowOf(usb).addOrUpdateUsbDevice(device, true)
    val (callback, received) = deliver(response(false))
    assertEquals(true, callback.readResult(received, usb))
  }

  @Test
  fun callbackDoesNotNeedAnySendTimeExtras() {
    val (callback, received) = deliver(null)
    assertEquals(false, callback.readResult(received, usb))
  }

  @Test
  fun fillInCannotReplaceRequestedDeviceActionOrPackage() {
    val other = mock(UsbDevice::class.java)
    `when`(other.deviceId).thenReturn(8)
    `when`(other.deviceName).thenReturn("/dev/bus/usb/001/008")
    shadowOf(usb).addOrUpdateUsbDevice(other, true)
    val fillIn = Intent("unrelated.action").setPackage("unrelated.package")
      .putExtra(UsbManager.EXTRA_DEVICE, other)
      .putExtra(UsbManager.EXTRA_PERMISSION_GRANTED, true)
    val (callback, received) = deliver(fillIn)
    assertEquals(action, received.action)
    assertEquals(context.packageName, received.`package`)
    assertEquals(false, callback.readResult(received, usb))
  }

  @Test
  fun unmatchedOrInactiveRequestsAreIgnored() {
    val (callback, received) = deliver(response(false))
    assertNull(callback.readResult(Intent(received).setAction("unrelated.action"), usb))
    val other = mock(UsbDevice::class.java)
    `when`(other.deviceId).thenReturn(8)
    assertNull(callback.readResult(Intent(received).putExtra(UsbManager.EXTRA_DEVICE, other), usb))
    assertNull(callback.readResult(Intent(received).apply { removeExtra(UsbManager.EXTRA_DEVICE) }, usb))
    assertNull(callback.readResult(Intent(action).putExtra(UsbManager.EXTRA_DEVICE, device), usb))
    callback.cancel()
    assertNull(callback.readResult(received, usb))
  }

  @Test
  fun timeoutCancellationInvalidatesSystemHandleAndRetryCanSucceed() {
    val timedOut = UsbPermissionCallback.create(context, action, device)
    timedOut.cancel() // The module's timeout, detach and destroy paths all cancel.
    val retry = UsbPermissionCallback.create(context, action, device)
    assertThrows(PendingIntent.CanceledException::class.java) {
      timedOut.pendingIntent.send(context, 0, response(false))
    }
    shadowOf(usb).addOrUpdateUsbDevice(device, true)
    val received = receive(retry.pendingIntent, response(true))
    assertEquals(true, retry.readResult(received, usb))
  }

  @Test
  fun alreadyDeliveredOldIntentCannotSettleSameDeviceRetry() {
    val (old, queuedResponse) = deliver(response(false))
    old.cancel()
    val retry = UsbPermissionCallback.create(context, action, device)
    assertNull(retry.readResult(queuedResponse, usb))
    shadowOf(usb).addOrUpdateUsbDevice(device, true)
    assertEquals(true, retry.readResult(receive(retry.pendingIntent, response(true)), usb))
  }

  @Test
  fun replacementInstanceDoesNotUpdatePreviousSystemHandle() {
    val previous = UsbPermissionCallback.create(context, action, device)
    val replacement = UsbPermissionCallback.create(context, action, device)
    assertNotSame(previous.pendingIntent, replacement.pendingIntent)
    assertThrows(PendingIntent.CanceledException::class.java) {
      previous.pendingIntent.send(context, 0, response(false))
    }
    assertEquals(false, replacement.readResult(receive(replacement.pendingIntent, response(false)), usb))
  }

  @Test
  fun completedCallbackCannotBeSentTwiceOrReusedAfterCancellation() {
    val (callback, received) = deliver(response(false))
    assertEquals(false, callback.readResult(received, usb))
    assertThrows(PendingIntent.CanceledException::class.java) {
      callback.pendingIntent.send(context, 0, response(true))
    }
    callback.cancel()
    assertNull(callback.readResult(received, usb))
  }
}
