package expo.modules.apexdevice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.nfc.NfcAdapter
import android.nfc.tech.Ndef
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import kotlin.concurrent.thread

/** Development CDC-ACM transport and foreground NFC metadata reader. */
class ApexDeviceModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var receiverContext: Context? = null
  private var permissionPromise: Promise? = null
  private var permissionDeviceId: Int? = null
  private var permissionCallback: UsbPermissionCallback? = null
  private var permissionTimeout: Runnable? = null
  private val lock = Any()
  private val writeLock = Any()
  private var generation = 0
  @Volatile private var link: Link? = null

  private data class Link(
    val deviceId: Int, val token: Int, val connection: UsbDeviceConnection,
    val control: UsbInterface, val data: UsbInterface,
    val input: UsbEndpoint, val output: UsbEndpoint,
    var worker: Thread? = null
  )
  private fun context(): Context = appContext.reactContext ?: throw IOException("React context unavailable")
  private fun manager(): UsbManager = context().getSystemService(Context.USB_SERVICE) as UsbManager
  private fun permissionAction() = context().packageName + ".APEX_USB_PERMISSION"
  private fun findDevice(id: Int): UsbDevice = manager().deviceList.values.firstOrNull { it.deviceId == id }
    ?: throw IOException("USB device is no longer attached")

  private val receiver = object : BroadcastReceiver() {
    @Suppress("DEPRECATION")
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == permissionAction()) {
        val granted = permissionCallback?.readResult(intent, manager()) ?: return
        permissionTimeout?.let { handler.removeCallbacks(it) }
        val promise = permissionPromise
        permissionCallback?.cancel(); permissionCallback = null
        permissionPromise = null; permissionDeviceId = null; permissionTimeout = null
        promise?.resolve(granted)
      } else if (intent.action == UsbManager.ACTION_USB_DEVICE_DETACHED) {
        val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
        if (link?.deviceId == device.deviceId) closeLink("USB device detached")
        if (permissionDeviceId == device.deviceId) rejectPermission("Device detached during permission request")
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun registerReceiver() {
    if (receiverContext != null) return
    val ctx = context()
    val filter = IntentFilter(permissionAction()).apply { addAction(UsbManager.ACTION_USB_DEVICE_DETACHED) }
    if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else ctx.registerReceiver(receiver, filter)
    receiverContext = ctx
  }
  private fun rejectPermission(message: String) {
    permissionTimeout?.let { handler.removeCallbacks(it) }
    val promise = permissionPromise
    permissionCallback?.cancel(); permissionCallback = null
    permissionPromise = null; permissionDeviceId = null; permissionTimeout = null
    promise?.reject("USB_PERMISSION", message, null)
  }

  override fun definition() = ModuleDefinition {
    Name("ApexDevice")
    Events("onUsbData", "onUsbClosed", "onNfcTag", "onNfcStopped")

    AsyncFunction("getStatus") {
      val nfc = NfcAdapter.getDefaultAdapter(context())
      mapOf("usbHost" to context().packageManager.hasSystemFeature("android.hardware.usb.host"),
        "nfcAvailable" to (nfc != null), "nfcEnabled" to (nfc?.isEnabled == true))
    }
    AsyncFunction("listUsbDevices") {
      manager().deviceList.values.map { device ->
        mapOf("id" to device.deviceId, "vendorId" to device.vendorId, "productId" to device.productId,
          "name" to device.deviceName, "hasPermission" to manager().hasPermission(device))
      }
    }
    AsyncFunction("requestUsbPermission") { id: Int, promise: Promise ->
      try {
        registerReceiver()
        val device = findDevice(id)
        if (manager().hasPermission(device)) promise.resolve(true)
        else if (permissionPromise != null) promise.reject("USB_PERMISSION", "Another permission request is pending", null)
        else {
          permissionPromise = promise; permissionDeviceId = id
          val timeout = Runnable { rejectPermission("USB permission request timed out") }
          permissionTimeout = timeout; handler.postDelayed(timeout, 30000)
          val callback = UsbPermissionCallback.create(context(), permissionAction(), device)
          permissionCallback = callback
          manager().requestPermission(device, callback.pendingIntent)
        }
      } catch (error: Exception) {
        if (permissionPromise === promise) rejectPermission(error.message ?: "Permission request failed")
        else promise.reject("USB_PERMISSION", error.message, error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openUsb") { id: Int -> openLink(id) }
    AsyncFunction("writeUsb") { token: Int, values: List<Int> ->
      require(values.size in 1..524 && values.all { it in 0..255 }) { "Invalid USB write bounds" }
      synchronized(writeLock) {
        val active = link ?: throw IOException("USB is closed")
        require(active.token == token) { "Stale USB connection" }
        val bytes = ByteArray(values.size) { values[it].toByte() }
        var offset = 0
        try {
          while (offset < bytes.size) {
            val written = active.connection.bulkTransfer(active.output, bytes, offset, bytes.size - offset, 1000)
            if (written <= 0) throw IOException("USB write failed or timed out")
            offset += written
          }
        } catch (error: Exception) {
          closeLink("USB write failed", token)
          throw error
        }
      }
    }
    AsyncFunction("closeUsb") { token: Int -> closeLink("USB connection closed", token) }

    AsyncFunction("startNfcReader") {
      val activity = appContext.currentActivity ?: throw IOException("Foreground activity unavailable")
      val nfc = NfcAdapter.getDefaultAdapter(context()) ?: throw IOException("NFC hardware unavailable")
      require(nfc.isEnabled) { "Enable NFC in Android settings" }
      nfc.enableReaderMode(activity, { tag ->
        val records = Ndef.get(tag)?.cachedNdefMessage?.records?.take(16)?.map { record ->
          mapOf("tnf" to record.tnf.toInt(), "type" to String(record.type.take(64).toByteArray(), Charsets.UTF_8),
            "payloadLength" to record.payload.size)
        } ?: emptyList()
        sendEvent("onNfcTag", mapOf("id" to tag.id.take(32).joinToString("") { "%02x".format(it.toInt() and 255) },
          "technologies" to tag.techList.toList(), "records" to records))
      }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopNfcReader") { stopNfc() }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { stopNfc() }
    OnDestroy {
      handler.post {
        stopNfc(); rejectPermission("Native module destroyed")
        receiverContext?.let { try { it.unregisterReceiver(receiver) } catch (_: Exception) {} }
        receiverContext = null
      }
      closeLink("Native module destroyed")
    }
  }

  private fun stopNfc() {
    appContext.currentActivity?.let { NfcAdapter.getDefaultAdapter(it)?.disableReaderMode(it) }
    sendEvent("onNfcStopped", emptyMap<String, Any>())
  }

  private fun openLink(id: Int): Int = synchronized(lock) {
    check(link == null) { "Close the existing USB connection first" }
    registerReceiver()
    val device = findDevice(id)
    val usb = manager()
    require(usb.hasPermission(device)) { "USB permission required" }
    // Conservative composite-device association: one adjacent CDC control/data pair only.
    val interfaces = (0 until device.interfaceCount).map { device.getInterface(it) }
    val pairs = interfaces.filter { it.interfaceClass == UsbConstants.USB_CLASS_COMM && it.interfaceSubclass == 2 }
      .mapNotNull { control -> interfaces.singleOrNull { it.interfaceClass == UsbConstants.USB_CLASS_CDC_DATA && it.id == control.id + 1 }
        ?.let { control to it } }
    require(pairs.size == 1) { "Expected one unambiguous adjacent CDC-ACM interface pair" }
    val (control, data) = pairs.single()
    val endpoints = (0 until data.endpointCount).map { data.getEndpoint(it) }.filter { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK }
    val input = endpoints.singleOrNull { it.direction == UsbConstants.USB_DIR_IN } ?: throw IOException("CDC bulk input missing")
    val output = endpoints.singleOrNull { it.direction == UsbConstants.USB_DIR_OUT } ?: throw IOException("CDC bulk output missing")
    val connection = usb.openDevice(device) ?: throw IOException("USB open failed")
    try {
      require(connection.claimInterface(control, true) && connection.claimInterface(data, true)) { "USB interface claim failed" }
      val coding = byteArrayOf(0x00, 0xc2.toByte(), 0x01, 0x00, 0x00, 0x00, 0x08) // 115200, 8N1
      require(connection.controlTransfer(0x21, 0x20, 0, control.id, coding, coding.size, 1000) == coding.size) { "CDC line coding failed" }
      require(connection.controlTransfer(0x21, 0x22, 3, control.id, null, 0, 1000) >= 0) { "CDC line state failed" }
      val active = Link(id, ++generation, connection, control, data, input, output)
      link = active
      active.worker = thread(name = "apex-usb-reader", isDaemon = true) {
        val buffer = ByteArray(512)
        try {
          while (link === active) {
            val count = connection.bulkTransfer(input, buffer, buffer.size, 100)
            if (count > 0 && link === active) sendEvent("onUsbData", mapOf("token" to active.token,
              "bytes" to (0 until count).map { buffer[it].toInt() and 255 }))
            // Android reports a read timeout as a negative result too. Detach receiver handles unplug.
            if (count <= 0) Thread.sleep(5)
          }
        } catch (_: Exception) { closeLink("USB reader failed", active.token) }
      }
      active.token
    } catch (error: Exception) { connection.close(); throw error }
  }

  private fun closeLink(reason: String, expectedToken: Int? = null) {
    val active = synchronized(lock) {
      val current = link ?: return
      if (expectedToken != null && current.token != expectedToken) return
      link = null; current
    }
    try { active.connection.releaseInterface(active.data); active.connection.releaseInterface(active.control) }
    finally { active.connection.close() }
    if (active.worker !== Thread.currentThread()) active.worker?.join(300)
    sendEvent("onUsbClosed", mapOf("token" to active.token, "reason" to reason))
  }
}
