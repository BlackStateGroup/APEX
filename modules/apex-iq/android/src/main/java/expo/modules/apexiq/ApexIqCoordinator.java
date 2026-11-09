package expo.modules.apexiq;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CancellationException;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Process-wide admission and ownership; independent of Expo's JS context lifetime. */
public final class ApexIqCoordinator {
  public static final int MAX_REQUEST_BYTES = 48 + 262144 + (3 * 4096 - 2) * 8;
  public static final int MAX_RESPONSE_BYTES = 262176;
  private static final long MAX_ID = 0xffffffffL;
  private static final int MAX_OPEN_SESSIONS = 64;

  public interface Engine {
    byte[] execute(byte[] bytes, long session, long request, AtomicBoolean cancelled) throws Throwable;
  }
  public interface Completion {
    void resolve(byte[] value);
    void reject(Throwable error);
  }
  public static final class Owner {
    private boolean destroyed;
    private Owner() {}
  }
  private static final class Session {
    final Owner owner;
    long lastRequest;
    Session(Owner owner) { this.owner = owner; }
  }
  private static final class Job {
    final Owner owner;
    final long session;
    final long request;
    final AtomicBoolean cancelled = new AtomicBoolean(false);
    boolean running;
    boolean finished;
    Job(Owner owner, long session, long request) {
      this.owner = owner; this.session = session; this.request = request;
    }
  }
  private static final class OnceCompletion implements Completion {
    private final Completion target;
    private final AtomicBoolean settled = new AtomicBoolean(false);
    OnceCompletion(Completion target) { this.target = target; }
    @Override public void resolve(byte[] value) {
      if (settled.compareAndSet(false, true)) target.resolve(value);
    }
    @Override public void reject(Throwable error) {
      if (settled.compareAndSet(false, true)) target.reject(error);
    }
  }
  private static final class Shared {
    // One caller can reserve/run globally. The handoff slot only accommodates a
    // completed runnable returning while its successor is submitted. No work queue.
    static final ApexIqCoordinator INSTANCE = new ApexIqCoordinator(
        ApexIqNative::execute,
        new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1),
            runnable -> {
              Thread worker = new Thread(runnable, "apex-iq-compute");
              worker.setDaemon(true);
              return worker;
            }, new ThreadPoolExecutor.AbortPolicy()), 1);
  }

  public static ApexIqCoordinator shared() { return Shared.INSTANCE; }
  private final Object lock = new Object();
  private final Map<Long, Session> sessions = new HashMap<>();
  private final Engine engine;
  private final Executor executor;
  private long nextSession;
  private Job active;

  // Injectable only within the package for deterministic host/Android JVM tests.
  ApexIqCoordinator(Engine engine, Executor executor, long firstSession) {
    this.engine = engine; this.executor = executor; this.nextSession = firstSession;
  }
  public Owner newOwner() { return new Owner(); }

  public static long checkedId(double value) {
    if (!Double.isFinite(value) || value < 1 || value > MAX_ID || value != Math.floor(value)) {
      throw new IllegalArgumentException("Expected a nonzero u32 identifier");
    }
    return (long) value;
  }
  private static void requireId(long value) {
    if (value < 1 || value > MAX_ID) throw new IllegalArgumentException("Invalid u32 identifier");
  }
  private Session ownedSession(Owner owner, long id) {
    Session session = sessions.get(id);
    if (owner.destroyed || session == null || session.owner != owner) {
      throw new IllegalStateException("IQ session is closed or belongs to another context");
    }
    return session;
  }
  public long openSession(Owner owner) {
    synchronized (lock) {
      if (owner.destroyed) throw new IllegalStateException("IQ context destroyed");
      if (sessions.size() >= MAX_OPEN_SESSIONS) throw new IllegalStateException("Too many IQ sessions");
      if (nextSession < 1 || nextSession > MAX_ID) throw new IllegalStateException("IQ session IDs exhausted");
      long id = nextSession++;
      sessions.put(id, new Session(owner));
      return id;
    }
  }
  public void reserve(Owner owner, long sessionId, long requestId) {
    requireId(sessionId); requireId(requestId);
    synchronized (lock) {
      Session session = ownedSession(owner, sessionId);
      if (active != null) throw new IllegalStateException("IQ native engine busy");
      if (requestId <= session.lastRequest) throw new IllegalArgumentException("IQ request ID reused or stale");
      session.lastRequest = requestId;
      active = new Job(owner, sessionId, requestId);
    }
  }
  public void cancel(Owner owner, long sessionId, long requestId) {
    requireId(sessionId); requireId(requestId);
    synchronized (lock) {
      if (active != null && active.owner == owner && active.session == sessionId && active.request == requestId) {
        // A reserved request stays fenced until execute or close. A running one
        // stays admitted until JNI actually returns, not until cancellation.
        active.cancelled.set(true);
      }
    }
  }
  public void closeSession(Owner owner, long sessionId) {
    requireId(sessionId);
    synchronized (lock) {
      Session session = sessions.get(sessionId);
      if (session == null || session.owner != owner) return;
      sessions.remove(sessionId);
      if (active != null && active.owner == owner && active.session == sessionId) cancelAndRetireReservation();
    }
  }
  public void destroy(Owner owner) {
    synchronized (lock) {
      owner.destroyed = true;
      sessions.entrySet().removeIf(entry -> entry.getValue().owner == owner);
      if (active != null && active.owner == owner) cancelAndRetireReservation();
    }
  }
  private void cancelAndRetireReservation() {
    active.cancelled.set(true);
    // A reserved request owns no native buffers. Its late execute fails identity
    // checks, including against a new context's reservation. Running work drains.
    if (!active.running) active = null;
  }

  /** Called by Expo's async entry; dispatches immediately without blocking its queue. */
  public void execute(Owner owner, byte[] bytes, Completion target) {
    OnceCompletion completion = new OnceCompletion(target);
    Job job;
    try {
      if (bytes == null || bytes.length < 48 || bytes.length > MAX_REQUEST_BYTES) {
        throw new IllegalArgumentException("IQ request byte length out of bounds");
      }
      long sessionId = u32(bytes, 8), requestId = u32(bytes, 12);
      synchronized (lock) {
        ownedSession(owner, sessionId);
        if (active == null || active.owner != owner || active.session != sessionId ||
            active.request != requestId || active.running) {
          throw new IllegalStateException("IQ execute requires its live reservation");
        }
        job = active;
        job.running = true;
      }
    } catch (Throwable error) {
      rejectSafely(completion, error);
      return;
    }
    try {
      // Expo already made a ByteArray copy before entry. The reference is now
      // owned by this runnable through native return; no JS buffer is retained.
      executor.execute(() -> {
        byte[] result = null;
        Throwable failure = null;
        try {
          if (job.cancelled.get()) throw new CancellationException("IQ analysis cancelled");
          result = engine.execute(bytes, job.session, job.request, job.cancelled);
          if (result == null || result.length < 32 || result.length > MAX_RESPONSE_BYTES) {
            throw new IllegalStateException("IQ native response byte length out of bounds");
          }
        } catch (Throwable error) {
          failure = error;
        }
        finish(job, completion, result, failure);
      });
    } catch (Throwable rejected) {
      // Submission failed before native work began. Treat it as drained.
      finish(job, completion, null, rejected);
    }
  }
  private void finish(Job job, OnceCompletion completion, byte[] result, Throwable failure) {
    synchronized (lock) {
      if (job.finished) return;
      job.finished = true;
      Session session = sessions.get(job.session);
      boolean live = !job.cancelled.get() && !job.owner.destroyed && session != null && session.owner == job.owner;
      if (active == job) active = null;
      // Linearize publication with cancel/close/destroy, after actual native return.
      // JS independently fences a callback enqueued just before its cancellation.
      try {
        if (!live) completion.reject(new CancellationException("IQ analysis cancelled"));
        else if (failure != null) completion.reject(failure);
        else completion.resolve(result);
      } catch (Throwable invalidatedCallback) {
        // A destroyed JS runtime cannot receive delivery. Never try a second settlement.
      }
    }
  }
  private static void rejectSafely(OnceCompletion completion, Throwable error) {
    try { completion.reject(error); } catch (Throwable invalidatedCallback) { /* No retry. */ }
  }
  private static long u32(byte[] bytes, int offset) {
    long value = 0;
    for (int k = 0; k < 4; k++) value |= (long) (bytes[offset + k] & 255) << (8 * k);
    return value;
  }
}
