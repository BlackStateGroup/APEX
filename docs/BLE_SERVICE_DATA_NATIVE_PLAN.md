# Service-data observation native integration plan

Status: original design, 8 November 2026. The Android-only callable implementation
is now documented in [native adapter](BLE_SERVICE_DATA_NATIVE_ADAPTER.md). iOS is
blocked by its pinned void native destruction method. A separate Android-only
[opt-in workbench](BLE_SERVICE_DATA_WORKBENCH.md) is now implemented; the original
advertised-UUID mode remains separate. The pure selected-service matcher is implemented; a separate
bounded session controller is now implemented and independently mock-reviewed
(see BLE_SERVICE_DATA_SESSION.md). This plan does not start scans,
change permissions or establish phone compatibility.

## Why one owner is required

The installed react-native-ble-plx 3.5.1 BleManager constructor returns its
sharedInstance. Creating another JavaScript manager does not isolate native
scanning or caches. Android's native manager caches discovered devices before
emitting callbacks; stopping scanning does not clear that map, destruction does.
See BLE_SERVICE_DATA_FILTER_REVIEW.md and BLE_PLX_SERVICE_DATA_MATCHER.md for
source paths, exact version and the difference between JS processing limits and
native allocation/queue limits.

## Proposed adapter contract

1. Reserve a module-level exclusive observation lease synchronously, before
   permission preparation or loading a manager. Refuse while ordinary scanning,
   connection preparation, shutdown or any tracked accessory connection owns the
   manager. A separate native manager instance is not a valid substitute.
2. Track each accessory connection attempt from before connectToDevice through
   confirmed disconnect, cancellation or successful manager destruction. A failed
   connect whose cancellation fails must remain uncertain and block broad reuse.
   Do not infer that no connection exists from empty UI capability state, a
   completed promise or an SDK filtered connected-device query alone.
3. Preserve current permission declarations and requests. Check cancellation after
   each awaited preparation step and before creating or starting a manager. An
   aborted preparation cannot start scanning after a permission dialog resolves.
4. Use an explicitly broad SDK request (null service UUID filter) only for the new
   mode. Keep AXP discovery and advertised-UUID mode unchanged. The core matcher
   chooses Android raw AD bytes or iOS normalized service fields and runs before
   source preparation. Do not read names/identifiers to decide membership.
5. Stop scanning before destruction. Successful destruction must complete before
   clearing the native lease, manager reference, connection registry or unknown-
   state flag. Invalidate existing manager epochs. Only then can a later explicit
   action create a fresh manager. No automatic retry with broader scope occurs.
6. Cleanup errors or timeouts retain exclusive/unknown state. A late successful
   cleanup may release proven native ownership but cannot retroactively change
   an already returned result into success. A stale callback or cleanup must not
   operate on a replacement instance. Global shutdown must coordinate with the
   observation owner, not concurrently destroy a different manager.

Acquisition rejection cannot be treated as proof that no native side effects
occurred. The adapter must either return explicit no-ownership after verified
cleanup, or retain an uncertain lease for recovery. Adapter tests must model both
ordinary JS order and synchronous native callbacks during starts/stops.

## Proposed user-visible behavior

A separate, one-session opt-in explains that all nearby SDK advertisements may be
received transiently, but only callbacks matching selected FCD2/FEAA service data
enter the workbench. A matching callback can still contain unrelated service or
manufacturer fields in its exact selected source. Do not call this a redacted
capture or promise that OS caches are erased.

The cooperative JS budgets are 10 seconds including preparation, at most 100
processed callbacks, 25 retained matches and 65,536 serialized characters. They
are not hard limits on native allocations, radio packets, bridge queue size or
wall-clock stop while JS is suspended. No matches does not prove absence. UI must
separately report budget exhaustion, unavailable source, malformed data and
uncertain cleanup, without converting any into a successful empty scan.

Start is unavailable outside active foreground or during other device work.
Stop remains callable during preparation. Leaving the acquisition view or entering
background cancels. A selected result can be handed to the existing Analysis
source importer, but no callback is automatically saved or sent to a provider.

## Acceptance gates before relying on the mode

- Mock permission delay/denial, start acknowledgement delay, synchronous callbacks,
  100 unrelated callbacks, mixed source shapes, all retained-size boundaries,
  cancellation, same-instance cleanup and stale-handle suppression.
- Prove accessory connection attempts and uncertain cancellations block exclusive
  observation at the native API boundary, not only through disabled buttons.
- Inject failed/hung stop and destruction; ensure normal scans, connections and
  writes cannot use an unknown manager. Check successful late cleanup cannot
  steal a replacement lease or silently resume the old scan.
- Validate the actual final adapter in Android and iOS native builds. On named,
  authorized phones and emitters compare service-data-only versus explicit-list
  advertisements, duplicate behavior, permission and background transitions.
- Retain the current neverForLocation limitations. Do not claim controller-level
  passive reception, complete capture, authenticated ownership or sensor truth.

The source/mock portions now have recorded coverage; native builds and all
physical acceptance remain unrun. UI source availability does not close them. If a hard cap
before native caching is required, this JS/PLX design is insufficient and a
separately scoped native scanner is needed.
