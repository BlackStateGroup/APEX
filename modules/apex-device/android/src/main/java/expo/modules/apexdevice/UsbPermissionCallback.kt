package expo.modules.apexdevice

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import java.util.UUID

/** One immutable request identity; Android's current permission state is the authority. */
internal class UsbPermissionCallback private constructor(
  val pendingIntent: PendingIntent,
  private val action: String,
  private val deviceId: Int,
  private val requestId: String
) {
  private var active = true

  @Suppress("DEPRECATION")
  fun readResult(intent: Intent, manager: UsbManager): Boolean? {
    if (!active || intent.action != action || intent.getStringExtra(EXTRA_REQUEST_ID) != requestId) return null
    val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return null
    if (device.deviceId != deviceId) return null
    // EXTRA_PERMISSION_GRANTED is discarded fill-in data, not the permission authority.
    return manager.hasPermission(device)
  }

  fun cancel() {
    active = false
    pendingIntent.cancel()
  }

  companion object {
    private const val EXTRA_REQUEST_ID = "expo.modules.apexdevice.USB_PERMISSION_REQUEST_ID"

    fun create(context: Context, action: String, device: UsbDevice): UsbPermissionCallback {
      val requestId = UUID.randomUUID().toString()
      // FLAG_IMMUTABLE discards the fill-in Intent supplied by UsbManager/SystemUI.
      // Capture the device and request identity before handing the callback to Android.
      val intent = Intent(action).setPackage(context.packageName)
        .putExtra(UsbManager.EXTRA_DEVICE, device)
        .putExtra(EXTRA_REQUEST_ID, requestId)
      // Never update a previous request's extras: an old holder must not acquire the
      // new identity. The nonce also rejects old broadcasts already queued for delivery.
      val pending = PendingIntent.getBroadcast(context, device.deviceId, intent,
        PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE)
      return UsbPermissionCallback(pending, action, device.deviceId, requestId)
    }
  }
}
