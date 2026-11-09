package expo.modules.apexiq;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Test-only framed stdin adapter for the production coordinator and actual JNI.
 * Not an Expo module, mobile build, cancellation transport or performance probe. */
public final class ApexIqWireHost {
  private ApexIqWireHost() {}
  public static void main(String[] args) throws Exception {
    if (args.length != 0 || !ApexIqNative.isAvailable()) throw new IllegalStateException("Host JNI unavailable");
    ApexIqCoordinator coordinator = ApexIqCoordinator.shared();
    ApexIqCoordinator.Owner owner = coordinator.newOwner();
    long session = coordinator.openSession(owner);
    try (DataInputStream input = new DataInputStream(new BufferedInputStream(System.in));
         DataOutputStream output = new DataOutputStream(new BufferedOutputStream(System.out))) {
      output.writeInt((int) session); output.flush();
      int requests = 0;
      while (true) {
        int first = input.read();
        if (first < 0) break;
        int size = (first << 24) | (input.readUnsignedByte() << 16) |
            (input.readUnsignedByte() << 8) | input.readUnsignedByte();
        if (++requests > 10000 || size < 48 || size > ApexIqCoordinator.MAX_REQUEST_BYTES) {
          throw new IllegalArgumentException("Host frame limit");
        }
        byte[] bytes = new byte[size]; input.readFully(bytes);
        long request = 0;
        for (int k = 0; k < 4; k++) request |= (long) (bytes[12 + k] & 255) << (8 * k);
        coordinator.reserve(owner, session, request);
        CountDownLatch done = new CountDownLatch(1);
        AtomicInteger settlements = new AtomicInteger();
        AtomicReference<byte[]> result = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        coordinator.execute(owner, bytes, new ApexIqCoordinator.Completion() {
          @Override public void resolve(byte[] value) {
            settlements.incrementAndGet(); result.set(value); done.countDown();
          }
          @Override public void reject(Throwable error) {
            settlements.incrementAndGet(); failure.set(error); done.countDown();
          }
        });
        if (!done.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Host JNI did not drain");
        if (settlements.get() != 1) throw new IllegalStateException("Repeated settlement");
        if (failure.get() != null) throw new IllegalStateException("Host coordinator rejected", failure.get());
        byte[] response = result.get();
        output.writeInt(response.length); output.write(response); output.flush();
      }
    } finally {
      coordinator.closeSession(owner, session);
      coordinator.destroy(owner);
    }
  }
}
