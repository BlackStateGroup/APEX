package expo.modules.apextrust

import android.os.Build
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom
import java.security.KeyFactory
import java.security.Signature

class ApexTrustModule : Module() {
  private fun supported(): Boolean {
    if (Build.VERSION.SDK_INT < 33) return false
    return try { Signature.getInstance("Ed25519"); KeyFactory.getInstance("Ed25519"); true } catch (_: Exception) { false }
  }
  private fun bytes(values: List<Double>, minimum: Int, maximum: Int): ByteArray {
    require(values.size in minimum..maximum && values.all { it.isFinite() && it >= 0 && it <= 255 && it % 1.0 == 0.0 }) { "Invalid verification bytes" }
    return ByteArray(values.size) { values[it].toInt().toByte() }
  }
  override fun definition() = ModuleDefinition {
    Name("ApexTrust")
    Function("isSupported") { supported() }
    Function("randomChallenge") {
      check(supported()) { "Native Ed25519 requires Android 13 or later" }
      val value = ByteArray(32); SecureRandom().nextBytes(value)
      value.map { it.toInt() and 255 }
    }
    Function("monotonicMilliseconds") { SystemClock.elapsedRealtimeNanos().toDouble() / 1_000_000.0 }
    AsyncFunction("verifyEd25519") { key: List<Double>, message: List<Double>, signature: List<Double> ->
      check(supported()) { "Native Ed25519 unavailable" }
      Ed25519Verifier.verify(bytes(key, 32, 32), bytes(message, 1, 523), bytes(signature, 64, 64))
    }
  }
}
