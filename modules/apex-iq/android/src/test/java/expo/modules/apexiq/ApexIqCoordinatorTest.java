package expo.modules.apexiq;

import org.junit.Test;

public final class ApexIqCoordinatorTest {
  @Test public void lifecycleAndConcurrentDrain() throws Exception {
    ApexIqLifecycleChecks.runAll();
  }
}
