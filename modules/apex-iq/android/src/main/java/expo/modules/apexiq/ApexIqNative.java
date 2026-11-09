package expo.modules.apexiq;

import java.util.concurrent.atomic.AtomicBoolean;

/** JNI owns a second bounded copy. No Java/JS pointer survives nativeExecute. */
public final class ApexIqNative {
  private ApexIqNative() {}

  private static final class Library {
    static final boolean AVAILABLE = load();
    private static boolean load() {
      try {
        System.loadLibrary("apex_iq");
        return true;
      } catch (UnsatisfiedLinkError | SecurityException unavailable) {
        return false;
      }
    }
  }

  public static boolean isAvailable() { return Library.AVAILABLE; }

  public static byte[] execute(byte[] bytes, long session, long request, AtomicBoolean cancelled) {
    if (!isAvailable()) throw new IllegalStateException("APEX IQ C++ library unavailable");
    return nativeExecute(bytes, session, request, cancelled);
  }

  private static native byte[] nativeExecute(
      byte[] bytes, long session, long request, AtomicBoolean cancelled);
}
