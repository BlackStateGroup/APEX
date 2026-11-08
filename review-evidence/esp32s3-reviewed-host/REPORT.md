# Reviewed derivative: actual-C host fault injection

Source pin: 32507d4c78538b162cc017276a27334339be6efc.
Adapter SHA-256:
4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c.

18 revised scenarios pass, including 10,000 deterministic callback/failure
interleavings. The original historical suite still passes 17 scenarios and its
two deliberately failing known-issue requirements. This test commit changes no
original firmware, revised source, portable core, client, dependency or register.
There were no initial failing revised assertions to conceal or correct.

## Checks

- Subscription readiness, owner/operation/size/flatten validation.
- Real portable parser and ping response, partial commits and embedded context
  repair to &peer.
- Atomic rejection of a 20-request burst and full queue; no partial response
  admission, parser mutation, timer change or termination on capacity rejection.
- Pending READY reserves a slot, so rejection can be retried after READY drains.
- A full queue accepts an incomplete prefix; rejection of its completing write
  preserves that prefix for exact retry after drain.
- Maximum payload fragmentation at MTU 23 and 517.
- Every invalid MTU 0 through 22 fences.
- Ten allocation/notification failures fence with either terminate return.
- Retry preserves offsets; successful notifications reset the retry counter.
- Same-owner repeated subscribe preserves partial incoming/outgoing data.
- Unsubscribe fences until the owner's disconnect; a foreign disconnect cannot
  clear the fence. Reconnection recovers with a fresh READY.
- Duplicate/foreign/failed connection events and advertising completion do not
  replace an active owner or restart advertising. A stale nonowner disconnect
  is ignored; transmit after confirmed disconnect cannot emit queued bytes.
- Injected timer reset failures at READY, write admission, notification retry,
  and successful-fragment continuation fence and clear pending output.
- Long malformed streams and maximum-frame bad CRC recover.
- Explicit opt-in startup is called ONLY with controlled local fakes. NVS
  errors 1, 2 and 3 longjmp at ESP_ERROR_CHECK before host initialization.
  No erase function is declared, so any added erase attempt would fail strict
  compilation. Success registers callbacks without running the host task.
- An empty sdkconfig and explicit opt-in=0 each compile with ONLY an empty
  sdkconfig include directory, expose only apex_ble_start and have zero undefined
  symbols according to nm. Each links to a tiny main and returns successfully.
- 10,000 seeded revised interleavings check queue/parser bounds, repaired context,
  fake allocation balance and fenced-state invariants.

## Execution

    node --test tests/esp32-host-transport.test.ts tests/esp32-reviewed-host-transport.test.ts

Two Node tests pass. Each is discoverable by the existing tests/*.test.ts glob.
Runner uses only existing GCC, nm and Node; compiler/child commands each have a
30-second timeout and use a cleaned temporary directory. Original files retain
their recovery-manifest SHA-256 identities.

Strict host compilation uses C11, Wall, Wextra and Werror with
Wno-misleading-indentation for compact harness statements; ESP_PLATFORM and
CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1 select the reviewed branch.

An additional ASan/UBSan binary ran all 18 scenarios successfully:
compile the same harness and real firmware/core/apex.c with
-g -fsanitize=address,undefined -fno-omit-frame-pointer and the same defines and
include paths, then run with ASAN_OPTIONS=detect_leaks=0. Output is retained in
asan-ubsan.txt. Leak detection was deliberately disabled; no full leak-gate claim.
final.txt and node-test.txt retain ordinary execution outputs.

## Scope and remaining gates

The harness includes the actual revised adapter translation unit. Queue and
parser behavior are not reimplemented. The interface declarations are deliberately
small FAKE declarations, not SDK headers or SDK/API/ABI validation. Timer ticks,
notification delivery and events are manually simulated on one thread. Timer
failure leaves fake timer pending unchanged until production fence stops it.
The fake notification consumer frees its mbuf on either return, explicitly
assuming the production source's stated consume-on-error contract. Allocation
balance proves only that fake contract, not the SDK's ownership rules.

No production app_main, real host task, NVS partition, network, radio, USB,
device, flash, native target/prebuild, SDK install, credential or setting was
used. Calling the revised startup symbol in a fully stubbed host test is not
running target startup on a device. No remote writes were made.

Not covered: host reset with missing disconnect, same numeric connection handle
reused with delayed old events, real callback ordering/reentrancy, SDK resource
semantics, admission stack/heap budgets, or physical acceptance. The independent
review covers further adversarial probes. The complete application aggregate
suite was not run in this isolated clone.
