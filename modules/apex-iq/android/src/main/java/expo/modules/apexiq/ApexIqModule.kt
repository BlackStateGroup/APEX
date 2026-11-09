package expo.modules.apexiq

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CancellationException

/** Optional Android C++ IQ backend. No RF/device access or permissions. */
class ApexIqModule : Module() {
  private val coordinator = ApexIqCoordinator.shared()
  private val owner = coordinator.newOwner()

  override fun definition() = ModuleDefinition {
    Name("ApexIq")
    Function("capabilities") {
      mapOf("available" to ApexIqNative.isAvailable(), "backend" to "cpp", "contractVersion" to 1,
        "cancellation" to "between-frames", "mobileRust" to false)
    }
    Function("openSession") {
      check(ApexIqNative.isAvailable()) { "APEX IQ C++ library unavailable" }
      coordinator.openSession(owner).toDouble()
    }
    Function("reserve") { session: Double, request: Double ->
      coordinator.reserve(owner, ApexIqCoordinator.checkedId(session), ApexIqCoordinator.checkedId(request))
    }
    Function("cancel") { session: Double, request: Double ->
      coordinator.cancel(owner, ApexIqCoordinator.checkedId(session), ApexIqCoordinator.checkedId(request))
    }
    Function("closeSession") { session: Double ->
      coordinator.closeSession(owner, ApexIqCoordinator.checkedId(session))
    }
    AsyncFunction("execute") { request: ByteArray, promise: Promise ->
      coordinator.execute(owner, request, object : ApexIqCoordinator.Completion {
        override fun resolve(value: ByteArray) { promise.resolve(value) }
        override fun reject(error: Throwable) {
          promise.reject(if (error is CancellationException) "APEX_IQ_CANCELLED" else "APEX_IQ_REJECTED", error.message, error)
        }
      })
    }
    OnDestroy { coordinator.destroy(owner) }
  }
}
