#include <jni.h>
#include "bridge.h"
#include <cstdint>
#include <cstring>
#include <exception>
#include <new>
#include <vector>

namespace {
constexpr std::size_t MAX_REQUEST_BYTES = 48 + 262144 + (3 * 4096 - 2) * 8;
constexpr std::size_t MAX_RESPONSE_BYTES = 262176;

void fail(JNIEnv* env, const char* type, const char* message) {
  if (env->ExceptionCheck()) return;
  jclass exception = env->FindClass(type);
  if (exception) {
    env->ThrowNew(exception, message);
    env->DeleteLocalRef(exception);
  }
}
uint32_t u32(const uint8_t* bytes, std::size_t offset) {
  uint32_t value = 0;
  for (std::size_t k = 0; k < 4; k++) value |= static_cast<uint32_t>(bytes[offset + k]) << (8 * k);
  return value;
}
struct Cancellation {
  JNIEnv* env;
  jobject flag;
  jmethodID get;
};
int cancelled(void* raw) {
  auto* state = static_cast<Cancellation*>(raw);
  // Invoked only on the same attached JNI executor thread. No JS calls, no
  // shared JNIEnv, no retained local references, and no coroutine interrupts.
  if (state->env->ExceptionCheck()) return 1;
  const jboolean value = state->env->CallBooleanMethod(state->flag, state->get);
  return state->env->ExceptionCheck() || value == JNI_TRUE;
}
} // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_expo_modules_apexiq_ApexIqNative_nativeExecute(
    JNIEnv* env, jclass, jbyteArray input, jlong session, jlong request, jobject flag) {
  if (!input || !flag || session < 1 || session > 0xffffffffLL || request < 1 || request > 0xffffffffLL) {
    fail(env, "java/lang/IllegalArgumentException", "Invalid IQ native arguments");
    return nullptr;
  }
  const jsize length = env->GetArrayLength(input);
  if (env->ExceptionCheck()) return nullptr;
  if (length < 48 || static_cast<std::size_t>(length) > MAX_REQUEST_BYTES) {
    fail(env, "java/lang/IllegalArgumentException", "IQ native request length out of bounds");
    return nullptr;
  }
  jclass flag_class = env->GetObjectClass(flag);
  if (!flag_class) return nullptr;
  jmethodID get = env->GetMethodID(flag_class, "get", "()Z");
  env->DeleteLocalRef(flag_class);
  if (!get) return nullptr;
  Cancellation cancellation{env, flag, get};
  try {
    if (cancelled(&cancellation)) {
      fail(env, "java/util/concurrent/CancellationException", "IQ analysis cancelled");
      return nullptr;
    }
    // Validate length before allocating. Do not pin Java's heap across the FFT.
    // The bridge decodes coefficients into owned, correctly aligned vector<double>s.
    std::vector<uint8_t> bytes(static_cast<std::size_t>(length));
    env->GetByteArrayRegion(input, 0, length, reinterpret_cast<jbyte*>(bytes.data()));
    if (env->ExceptionCheck()) return nullptr;
    if (u32(bytes.data(), 8) != static_cast<uint32_t>(session) ||
        u32(bytes.data(), 12) != static_cast<uint32_t>(request)) {
      fail(env, "java/lang/IllegalArgumentException", "IQ request does not match reservation");
      return nullptr;
    }
    std::vector<uint8_t> response(MAX_RESPONSE_BYTES);
    std::size_t written = 0;
    // The portable bridge revalidates magic/version, every dimension, exact
    // lengths, reserved fields, coefficients, rounding mode, and capacity.
    const int status = apex_iq_bridge_v1(bytes.data(), bytes.size(), response.data(), response.size(),
                                        &written, cancelled, &cancellation);
    if (env->ExceptionCheck()) return nullptr;
    if (status == 4 || cancelled(&cancellation)) {
      fail(env, "java/util/concurrent/CancellationException", "IQ analysis cancelled");
      return nullptr;
    }
    if (status != 0 || written < 32 || written > MAX_RESPONSE_BYTES) {
      fail(env, status == 1 || status == 2 ? "java/lang/IllegalArgumentException" : "java/lang/IllegalStateException",
           "IQ native request rejected");
      return nullptr;
    }
    jbyteArray output = env->NewByteArray(static_cast<jsize>(written));
    if (!output) return nullptr;
    env->SetByteArrayRegion(output, 0, static_cast<jsize>(written), reinterpret_cast<const jbyte*>(response.data()));
    if (env->ExceptionCheck()) return nullptr;
    return output;
  } catch (const std::bad_alloc&) {
    fail(env, "java/lang/OutOfMemoryError", "IQ native allocation failed");
  } catch (const std::exception&) {
    fail(env, "java/lang/IllegalStateException", "IQ native execution failed");
  } catch (...) {
    fail(env, "java/lang/IllegalStateException", "IQ native execution failed");
  }
  return nullptr;
}
