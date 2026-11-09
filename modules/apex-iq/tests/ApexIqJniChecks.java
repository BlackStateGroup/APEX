package expo.modules.apexiq;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Executes the exact JNI source on host JVM; not an Android packaging/device test. */
public final class ApexIqJniChecks {
  private static int assertions;
  private static void check(boolean condition, String message) {
    assertions++;
    if (!condition) throw new AssertionError(message);
  }
  private static void expect(Class<? extends Throwable> type, Runnable body) {
    assertions++;
    try { body.run(); } catch (Throwable error) {
      if (type.isInstance(error)) return;
      throw new AssertionError("Wrong JNI exception: " + error, error);
    }
    throw new AssertionError("Expected JNI exception " + type.getName());
  }
  private static byte[] fixture(int n, int count) { return fixture(n, count, n * count * 4); }
  private static byte[] fixture(int n, int count, int length) {
    ByteBuffer b = ByteBuffer.allocate(48 + length + (3 * n - 2) * 8).order(ByteOrder.LITTLE_ENDIAN);
    b.put(new byte[] {'A', 'X', 'I', 'B', 1, 0, 1, 0});
    b.putInt(1).putInt(2).putInt(length).putInt(n).putInt(0).putInt(n).putInt(count).putInt(0).putInt(0).putInt(0);
    for (int frame = 0; frame < count; frame++) {
      b.putShort(48 + frame * n * 4, (short) 16384);
      b.putShort(50 + frame * n * 4, (short) -8192);
    }
    b.position(48 + length);
    for (int k = 0; k < n; k++) b.putDouble(1.0);
    for (int size = 2; size <= n; size *= 2) {
      for (int k = 0; k < size / 2; k++) b.putDouble(Math.cos(-2 * Math.PI * k / size));
    }
    for (int size = 2; size <= n; size *= 2) {
      for (int k = 0; k < size / 2; k++) b.putDouble(Math.sin(-2 * Math.PI * k / size));
    }
    return b.array();
  }
  public static void main(String[] args) {
    check(ApexIqNative.isAvailable(), "JNI library loaded");
    for (int n : new int[] {256, 512, 1024, 2048, 4096}) {
      int count = 16384 / n;
      byte[] input = fixture(n, count), original = input.clone();
      byte[] output = ApexIqNative.execute(input, 1, 2, new AtomicBoolean(false));
      check(java.util.Arrays.equals(input, original), "JNI never mutates request");
      check(output.length == 32 + 16 * n * count, "Response exact size");
      ByteBuffer b = ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN);
      check(b.getInt(0) == 0x424f5841 && b.getInt(4) == 1, "Response magic/version");
      check(b.getInt(8) == 1 && b.getInt(12) == 2 && b.getInt(16) == n && b.getInt(20) == count, "Response identity/dimensions");
      for (int frame = 0; frame < count; frame++) {
        for (int k = 0; k < n; k++) {
          check(b.getDouble(32 + (frame * 2 * n + k) * 8) == 0.5, "Impulse real bins");
          check(b.getDouble(32 + (frame * 2 * n + n + k) * 8) == -0.25, "Impulse imaginary bins");
        }
      }
    }
    byte[] maximum = fixture(4096, 4, 262144);
    check(maximum.length == ApexIqCoordinator.MAX_REQUEST_BYTES, "Maximum legal request covered");
    check(ApexIqNative.execute(maximum, 1, 2, new AtomicBoolean(false)).length == 262176, "Maximum request accepted");
    byte[] highIds = fixture(256, 1);
    ByteBuffer.wrap(highIds).order(ByteOrder.LITTLE_ENDIAN).putInt(8, -1).putInt(12, -1);
    byte[] highResult = ApexIqNative.execute(highIds, 0xffffffffL, 0xffffffffL, new AtomicBoolean(false));
    check(ByteBuffer.wrap(highResult).order(ByteOrder.LITTLE_ENDIAN).getInt(8) == -1, "Full u32 identity preserved");
    byte[] good = fixture(256, 1);
    expect(CancellationException.class, () -> ApexIqNative.execute(good, 1, 2, new AtomicBoolean(true)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(good, 2, 2, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(good, 1, 3, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(good, 0, 2, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(good, 1, 4294967296L, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(null, 1, 2, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(good, 1, 2, null));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(new byte[47], 1, 2, new AtomicBoolean(false)));
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(new byte[ApexIqCoordinator.MAX_REQUEST_BYTES + 1], 1, 2, new AtomicBoolean(false)));
    for (int offset : new int[] {0, 4, 6, 16, 20, 24, 28, 32, 36, 40, 44}) {
      byte[] bad = good.clone();
      if (offset < 8) bad[offset] = (byte) 255;
      else ByteBuffer.wrap(bad).order(ByteOrder.LITTLE_ENDIAN).putInt(offset,
          offset == 24 ? 65536 : offset == 28 || offset == 32 ? 0 : 255);
      expect(IllegalArgumentException.class, () -> ApexIqNative.execute(bad, 1, 2, new AtomicBoolean(false)));
    }
    byte[] badCoefficient = good.clone();
    ByteBuffer.wrap(badCoefficient).order(ByteOrder.LITTLE_ENDIAN).putDouble(48 + 1024, Double.NaN);
    expect(IllegalArgumentException.class, () -> ApexIqNative.execute(badCoefficient, 1, 2, new AtomicBoolean(false)));
    System.out.println("IQ JNI host checks passed: " + assertions);
  }
}
