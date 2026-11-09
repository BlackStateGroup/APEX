package expo.modules.apexiq;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Plain-Java tests shared by Android JUnit and the offline host runner. */
public final class ApexIqLifecycleChecks {
  private ApexIqLifecycleChecks() {}
  private static final AtomicInteger checks = new AtomicInteger();
  static void check(boolean value, String message) {
    checks.incrementAndGet();
    if (!value) throw new AssertionError(message);
  }
  static void expect(Class<? extends Throwable> type, Runnable action) {
    checks.incrementAndGet();
    try { action.run(); } catch (Throwable error) {
      if (type.isInstance(error)) return;
      throw new AssertionError("Expected " + type.getName() + ", got " + error, error);
    }
    throw new AssertionError("Expected " + type.getName());
  }
  private static byte[] bytes(long session, long request) {
    return ByteBuffer.allocate(48).order(ByteOrder.LITTLE_ENDIAN)
        .putInt(8, (int) session).putInt(12, (int) request).array();
  }
  private static final class Manual implements Executor {
    private final Queue<Runnable> pending = new ArrayDeque<>();
    @Override public void execute(Runnable task) { pending.add(task); }
    void run() { pending.remove().run(); }
  }
  private static final class Outcome implements ApexIqCoordinator.Completion {
    volatile byte[] value;
    volatile Throwable error;
    final AtomicInteger resolves = new AtomicInteger();
    final AtomicInteger rejects = new AtomicInteger();
    final CountDownLatch done = new CountDownLatch(1);
    @Override public void resolve(byte[] value) { this.value = value; resolves.incrementAndGet(); done.countDown(); }
    @Override public void reject(Throwable error) { this.error = error; rejects.incrementAndGet(); done.countDown(); }
    void resolved() { check(resolves.get() == 1 && rejects.get() == 0, "Resolved once"); }
    void rejected(Class<? extends Throwable> type) {
      check(rejects.get() == 1 && resolves.get() == 0 && type.isInstance(error), "Rejected once as " + type.getName());
    }
  }

  // Coordinator intentionally masks engine failures once cancelled. Record test
  // failures out of band and assert them on the controlling thread after drain.
  private static final class EngineProbe implements ApexIqCoordinator.Engine {
    private final ApexIqCoordinator.Engine target;
    private final AtomicReference<Throwable> failure = new AtomicReference<>();
    EngineProbe(ApexIqCoordinator.Engine target) { this.target = target; }
    @Override public byte[] execute(byte[] b, long s, long r,
        java.util.concurrent.atomic.AtomicBoolean flag) throws Throwable {
      try { return target.execute(b, s, r, flag); }
      catch (Throwable error) { failure.compareAndSet(null, error); throw error; }
    }
    void assertHealthy() {
      Throwable error = failure.get();
      check(error == null, "Injected engine failed independently of callback settlement: " + error);
    }
  }

  public static void runAll() throws Exception {
    checks.set(0);
    engineProbeNegativeControl();
    identifiers();
    reservationAndCancel();
    ownershipAndLateExecute();
    failuresAndSettlement();
    runningDrain(false);
    runningDrain(true);
    sessionCap();
    concurrentStress();
    System.out.println("IQ lifecycle checks passed: " + checks.get());
  }
  private static void engineProbeNegativeControl() {
    Manual queue = new Manual();
    AssertionError sentinel = new AssertionError("Deliberate engine assertion failure");
    // Cancel inside the engine so entry occurs but finish suppresses its error.
    Runnable[] cancel = new Runnable[1];
    EngineProbe probe = new EngineProbe((b, s, r, flag) -> {
      cancel[0].run(); throw sentinel;
    });
    ApexIqCoordinator c = new ApexIqCoordinator(probe, queue, 1);
    ApexIqCoordinator.Owner owner = c.newOwner();
    long session = c.openSession(owner);
    cancel[0] = () -> c.cancel(owner, session, 1);
    c.reserve(owner, session, 1);
    Outcome outcome = new Outcome(); c.execute(owner, bytes(session, 1), outcome);
    queue.run();
    outcome.rejected(CancellationException.class);
    check(probe.failure.get() == sentinel, "Probe retains the exact masked assertion");
    expect(AssertionError.class, probe::assertHealthy);
    c.closeSession(owner, session);
  }
  private static void identifiers() {
    for (double bad : new double[] {0, -1, 0.5, 1.5, Double.NaN, Double.POSITIVE_INFINITY, 4294967296.0}) {
      expect(IllegalArgumentException.class, () -> ApexIqCoordinator.checkedId(bad));
    }
    check(ApexIqCoordinator.checkedId(4294967295.0) == 0xffffffffL, "u32 maximum exact");
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> new byte[32], Runnable::run, 0xffffffffL);
    ApexIqCoordinator.Owner first = c.newOwner();
    check(c.openSession(first) == 0xffffffffL, "Last nonzero session");
    c.destroy(first);
    expect(IllegalStateException.class, () -> c.openSession(c.newOwner()));
    expect(IllegalStateException.class, () -> c.openSession(first));
  }
  private static void reservationAndCancel() {
    Manual queue = new Manual();
    AtomicInteger calls = new AtomicInteger();
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> {
      calls.incrementAndGet(); return new byte[32];
    }, queue, 1);
    ApexIqCoordinator.Owner owner = c.newOwner();
    long session = c.openSession(owner);
    c.reserve(owner, session, 1);
    c.cancel(owner, session, 1); // Before Expo even invokes execute.
    expect(IllegalStateException.class, () -> c.reserve(owner, session, 2));
    Outcome cancelled = new Outcome();
    c.execute(owner, bytes(session, 1), cancelled);
    check(cancelled.done.getCount() == 1, "Cancellation does not pretend to drain queued work");
    queue.run();
    check(calls.get() == 0, "Cancelled reservation never enters engine");
    cancelled.rejected(CancellationException.class);
    expect(IllegalArgumentException.class, () -> c.reserve(owner, session, 1));
    c.reserve(owner, session, 2);
    Outcome second = new Outcome();
    c.execute(owner, bytes(session, 2), second);
    c.cancel(owner, session, 1); // Stale cancel must not affect the next operation.
    queue.run();
    second.resolved();
    check(calls.get() == 1, "Only live operation entered engine");
  }
  private static void ownershipAndLateExecute() {
    Manual queue = new Manual();
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> new byte[32], queue, 1);
    ApexIqCoordinator.Owner oldOwner = c.newOwner(), newOwner = c.newOwner();
    long oldSession = c.openSession(oldOwner), newSession = c.openSession(newOwner);
    check(newSession != oldSession, "Session unique across owners");
    c.reserve(oldOwner, oldSession, 1);
    expect(IllegalStateException.class, () -> c.reserve(newOwner, newSession, 1));
    c.closeSession(newOwner, oldSession); // Cannot close another context's session.
    c.cancel(newOwner, oldSession, 1);
    Outcome wrong = new Outcome();
    c.execute(newOwner, bytes(oldSession, 1), wrong);
    wrong.rejected(IllegalStateException.class);
    c.destroy(oldOwner);
    c.reserve(newOwner, newSession, 1);
    Outcome late = new Outcome();
    c.execute(oldOwner, bytes(oldSession, 1), late);
    late.rejected(IllegalStateException.class);
    Outcome valid = new Outcome();
    c.execute(newOwner, bytes(newSession, 1), valid);
    queue.run();
    valid.resolved();
    c.reserve(newOwner, newSession, 2);
    c.closeSession(newOwner, newSession);
    long replacement = c.openSession(newOwner);
    check(replacement > newSession, "Closed sessions never recycled");
    c.reserve(newOwner, replacement, 1);
    Outcome closed = new Outcome();
    c.execute(newOwner, bytes(newSession, 2), closed);
    closed.rejected(IllegalStateException.class);
    Outcome replacementOutcome = new Outcome();
    c.execute(newOwner, bytes(replacement, 1), replacementOutcome);
    queue.run();
    replacementOutcome.resolved();
  }
  private static void failuresAndSettlement() {
    Manual queue = new Manual();
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> new byte[32], queue, 1);
    ApexIqCoordinator.Owner owner = c.newOwner();
    long session = c.openSession(owner);
    c.reserve(owner, session, 1);
    for (byte[] malformed : new byte[][] {null, new byte[0], new byte[47], new byte[ApexIqCoordinator.MAX_REQUEST_BYTES + 1]}) {
      Outcome outcome = new Outcome();
      c.execute(owner, malformed, outcome);
      outcome.rejected(IllegalArgumentException.class);
    }
    Outcome mismatch = new Outcome();
    c.execute(owner, bytes(session, 2), mismatch);
    mismatch.rejected(IllegalStateException.class);
    Outcome valid = new Outcome();
    c.execute(owner, bytes(session, 1), valid);
    Outcome duplicate = new Outcome();
    c.execute(owner, bytes(session, 1), duplicate);
    duplicate.rejected(IllegalStateException.class);
    queue.run(); valid.resolved();
    AtomicInteger delivered = new AtomicInteger(), wronglyRejected = new AtomicInteger();
    c.reserve(owner, session, 2);
    c.execute(owner, bytes(session, 2), new ApexIqCoordinator.Completion() {
      @Override public void resolve(byte[] value) { delivered.incrementAndGet(); throw new IllegalStateException("Destroyed callback"); }
      @Override public void reject(Throwable error) { wronglyRejected.incrementAndGet(); }
    });
    queue.run();
    check(delivered.get() == 1 && wronglyRejected.get() == 0, "Failed delivery never settles twice");
    c.reserve(owner, session, 3); c.closeSession(owner, session);

    ApexIqCoordinator rejected = new ApexIqCoordinator((b, s, r, flag) -> new byte[32],
        task -> { throw new RejectedExecutionException("test"); }, 1);
    ApexIqCoordinator.Owner rejectedOwner = rejected.newOwner();
    long rejectedSession = rejected.openSession(rejectedOwner);
    rejected.reserve(rejectedOwner, rejectedSession, 1);
    Outcome outcome = new Outcome();
    rejected.execute(rejectedOwner, bytes(rejectedSession, 1), outcome);
    outcome.rejected(RejectedExecutionException.class);
    rejected.reserve(rejectedOwner, rejectedSession, 2);
    rejected.closeSession(rejectedOwner, rejectedSession);

    for (byte[] malformed : new byte[][] {null, new byte[31], new byte[ApexIqCoordinator.MAX_RESPONSE_BYTES + 1]}) {
      ApexIqCoordinator bad = new ApexIqCoordinator((b, s, r, flag) -> malformed, Runnable::run, 1);
      ApexIqCoordinator.Owner badOwner = bad.newOwner();
      long id = bad.openSession(badOwner);
      bad.reserve(badOwner, id, 1);
      Outcome badResult = new Outcome(); bad.execute(badOwner, bytes(id, 1), badResult);
      badResult.rejected(IllegalStateException.class);
      bad.reserve(badOwner, id, 2); bad.closeSession(badOwner, id);
    }
  }
  private static void runningDrain(boolean destroy) throws Exception {
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    ExecutorService worker = Executors.newSingleThreadExecutor();
    try {
      EngineProbe probe = new EngineProbe((b, s, r, flag) -> {
        entered.countDown();
        if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Release timed out");
        check(flag.get(), "Native engine receives cooperative cancellation flag");
        check(b.length == 48, "Input remains owned until native drain");
        // Deliberately return late even after cancellation; result must never publish.
        return new byte[32];
      });
      ApexIqCoordinator c = new ApexIqCoordinator(probe, worker, 1);
      ApexIqCoordinator.Owner owner = c.newOwner(), successor = c.newOwner();
      long session = c.openSession(owner), next = c.openSession(successor);
      c.reserve(owner, session, 1);
      Outcome outcome = new Outcome();
      c.execute(owner, bytes(session, 1), outcome);
      check(entered.await(5, TimeUnit.SECONDS), "Dedicated worker begins without blocking submitter");
      if (destroy) c.destroy(owner); else c.closeSession(owner, session);
      expect(IllegalStateException.class, () -> c.reserve(successor, next, 1));
      check(outcome.done.getCount() == 1, "Close/destroy does not settle while native work runs");
      release.countDown();
      check(outcome.done.await(5, TimeUnit.SECONDS), "Drained completion arrives");
      probe.assertHealthy();
      outcome.rejected(CancellationException.class);
      c.reserve(successor, next, 1); c.closeSession(successor, next);
    } finally {
      release.countDown(); worker.shutdown();
      check(worker.awaitTermination(5, TimeUnit.SECONDS), "Worker drained");
    }
  }
  // All actors rendezvous before each race. Timeouts are deadlock guards, not
  // scheduling assumptions: no sleeps, polling, or expected winning thread.
  private static void race(ExecutorService actors, Runnable... actions) throws Exception {
    CountDownLatch ready = new CountDownLatch(actions.length), start = new CountDownLatch(1);
    List<Future<?>> futures = new ArrayList<>();
    try {
      for (Runnable action : actions) futures.add(actors.submit(() -> {
        ready.countDown();
        await(start, "Race start");
        action.run();
      }));
      check(ready.await(5, TimeUnit.SECONDS), "All race actors ready");
      start.countDown();
      for (Future<?> future : futures) future.get(5, TimeUnit.SECONDS);
    } finally {
      start.countDown();
      for (Future<?> future : futures) if (!future.isDone()) future.cancel(true);
    }
  }
  private static void await(CountDownLatch latch, String message) {
    try { check(latch.await(5, TimeUnit.SECONDS), message); }
    catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new AssertionError(message, interrupted);
    }
  }
  private static void concurrentStress() throws Exception {
    ExecutorService actors = Executors.newFixedThreadPool(8);
    // More than one worker deliberately makes accidental duplicate dispatch
    // observable rather than hiding it behind a single-thread test executor.
    ExecutorService workers = Executors.newFixedThreadPool(8);
    try {
      for (int iteration = 0; iteration < 100; iteration++) {
        concurrentAdmission(actors);
        concurrentRunningDrain(actors, workers);
        concurrentRetirement(actors, workers);
        concurrentReservationReplacement(actors);
      }
    } finally {
      actors.shutdownNow(); workers.shutdownNow();
      check(actors.awaitTermination(5, TimeUnit.SECONDS), "Stress actors terminated");
      check(workers.awaitTermination(5, TimeUnit.SECONDS), "Stress workers terminated");
    }
    System.out.println("IQ concurrent stress passed: 100 rounds each of admission, running drain, retirement, and reservation replacement");
  }
  private static void concurrentAdmission(ExecutorService actors) throws Exception {
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> new byte[32], Runnable::run, 1);
    ApexIqCoordinator.Owner[] owners = new ApexIqCoordinator.Owner[8];
    long[] sessions = new long[8];
    AtomicInteger winner = new AtomicInteger(-1), admitted = new AtomicInteger(), busy = new AtomicInteger();
    Runnable[] attempts = new Runnable[8];
    for (int i = 0; i < attempts.length; i++) {
      final int index = i;
      owners[i] = c.newOwner(); sessions[i] = c.openSession(owners[i]);
      attempts[i] = () -> {
        try { c.reserve(owners[index], sessions[index], 1); winner.set(index); admitted.incrementAndGet(); }
        catch (IllegalStateException expected) { busy.incrementAndGet(); }
      };
    }
    race(actors, attempts);
    check(admitted.get() == 1 && busy.get() == 7, "Exactly one concurrent reservation admitted");
    int selected = winner.get();
    c.closeSession(owners[selected], sessions[selected]);
    // A losing admission must not consume its request ID.
    int successor = (selected + 1) % owners.length;
    c.reserve(owners[successor], sessions[successor], 1);
    Outcome outcome = new Outcome();
    c.execute(owners[successor], bytes(sessions[successor], 1), outcome);
    outcome.resolved();
    for (ApexIqCoordinator.Owner owner : owners) c.destroy(owner);
  }
  private static void concurrentRunningDrain(ExecutorService actors, ExecutorService workers) throws Exception {
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    EngineProbe probe = new EngineProbe((b, s, r, flag) -> {
      calls.incrementAndGet(); entered.countDown(); await(release, "Stress engine released");
      check(flag.get(), "Concurrent lifecycle operations cancel running work");
      return new byte[32];
    });
    ApexIqCoordinator c = new ApexIqCoordinator(probe, workers, 1);
    ApexIqCoordinator.Owner owner = c.newOwner(), successor = c.newOwner();
    long session = c.openSession(owner), next = c.openSession(successor);
    c.reserve(owner, session, 1);
    Outcome[] outcomes = new Outcome[8];
    Runnable[] submissions = new Runnable[8];
    try {
      for (int i = 0; i < outcomes.length; i++) {
        Outcome outcome = outcomes[i] = new Outcome();
        submissions[i] = () -> c.execute(owner, bytes(session, 1), outcome);
      }
      race(actors, submissions);
      await(entered, "One concurrent execute enters engine");
      check(calls.get() == 1, "Duplicate execute cannot run a second engine");
      int pending = 0;
      for (Outcome outcome : outcomes) {
        if (outcome.done.getCount() == 1) pending++;
        else outcome.rejected(IllegalStateException.class);
      }
      check(pending == 1, "Only admitted execute waits for native return");
      race(actors, () -> c.cancel(owner, session, 1), () -> c.closeSession(owner, session),
          () -> c.destroy(owner), () -> expect(IllegalStateException.class, () -> c.reserve(successor, next, 1)));
      expect(IllegalStateException.class, () -> c.reserve(successor, next, 1));
      for (Outcome outcome : outcomes) check(outcome.resolves.get() == 0, "No result before drain");
      release.countDown();
      int cancelled = 0;
      for (Outcome outcome : outcomes) {
        await(outcome.done, "Every concurrent execute settles");
        if (outcome.error instanceof CancellationException) { outcome.rejected(CancellationException.class); cancelled++; }
        else outcome.rejected(IllegalStateException.class);
      }
      probe.assertHealthy();
      check(cancelled == 1 && calls.get() == 1, "One cancelled completion after one native drain");
      c.reserve(successor, next, 1); c.closeSession(successor, next);
    } finally { release.countDown(); }
  }
  private static void concurrentRetirement(ExecutorService actors, ExecutorService workers) throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    EngineProbe probe = new EngineProbe((b, s, r, flag) -> {
      calls.incrementAndGet(); await(release, "Retirement engine released"); return new byte[32];
    });
    ApexIqCoordinator c = new ApexIqCoordinator(probe, workers, 1);
    ApexIqCoordinator.Owner owner = c.newOwner(), successor = c.newOwner();
    long session = c.openSession(owner), next = c.openSession(successor);
    Outcome outcome = new Outcome();
    c.reserve(owner, session, 1);
    try {
      race(actors, () -> c.execute(owner, bytes(session, 1), outcome),
          () -> c.cancel(owner, session, 1), () -> c.closeSession(owner, session), () -> c.destroy(owner));
      // Whichever actor wins, no successful callback may survive retirement.
      release.countDown(); await(outcome.done, "Retired execute settles");
      probe.assertHealthy();
      check(outcome.resolves.get() == 0 && outcome.rejects.get() == 1, "Retirement race rejects exactly once");
      check(outcome.error instanceof CancellationException || outcome.error instanceof IllegalStateException,
          "Retirement either cancels dispatch or invalidates reservation");
      check(calls.get() <= 1, "Retirement has at most one engine entry");
      expect(IllegalStateException.class, () -> c.openSession(owner));
      c.reserve(successor, next, 1);
      Outcome late = new Outcome(); c.execute(owner, bytes(session, 1), late);
      late.rejected(IllegalStateException.class);
      // A stale execute must not drain or consume the successor reservation.
      expect(IllegalStateException.class, () -> c.reserve(successor, next, 2));
      c.closeSession(successor, next);
      long replacement = c.openSession(successor);
      c.reserve(successor, replacement, 1); c.closeSession(successor, replacement);
    } finally { release.countDown(); }
  }
  private static void concurrentReservationReplacement(ExecutorService actors) throws Exception {
    AtomicInteger calls = new AtomicInteger(), admitted = new AtomicInteger(), busy = new AtomicInteger();
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> {
      calls.incrementAndGet(); return new byte[32];
    }, Runnable::run, 1);
    ApexIqCoordinator.Owner owner = c.newOwner(), successor = c.newOwner();
    long session = c.openSession(owner), next = c.openSession(successor);
    c.reserve(owner, session, 1);
    race(actors, () -> c.cancel(owner, session, 1), () -> c.closeSession(owner, session),
        () -> c.destroy(owner), () -> {
          try { c.reserve(successor, next, 1); admitted.incrementAndGet(); }
          catch (IllegalStateException expected) { busy.incrementAndGet(); }
        });
    check(admitted.get() + busy.get() == 1, "Replacement admission has one outcome");
    if (busy.get() == 1) c.reserve(successor, next, 1);
    Outcome late = new Outcome(); c.execute(owner, bytes(session, 1), late);
    late.rejected(IllegalStateException.class);
    Outcome replacement = new Outcome(); c.execute(successor, bytes(next, 1), replacement);
    replacement.resolved();
    check(calls.get() == 1, "Concurrent old lifecycle calls leave replacement untouched");
    c.reserve(successor, next, 2); c.closeSession(successor, next);
  }
  private static void sessionCap() {
    ApexIqCoordinator c = new ApexIqCoordinator((b, s, r, flag) -> new byte[32], Runnable::run, 1);
    ApexIqCoordinator.Owner owner = c.newOwner();
    for (int i = 0; i < 64; i++) c.openSession(owner);
    expect(IllegalStateException.class, () -> c.openSession(owner));
    c.destroy(owner);
    check(c.openSession(c.newOwner()) == 65, "Destroy clears bounded registry without resetting IDs");
  }
  public static void main(String[] args) throws Exception { runAll(); }
}
