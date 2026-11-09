# Native evidence journal initialization recovery

The iPhone and Android adapters share `src/platform/evidence.native.ts`.
This correction changes connection ownership during first-use initialization,
not the evidence schema, content digests, database name or saved records.

## Reproduced defect

On main `335efd95dbd3841094ad1618df06dab14a7bfdf5`, a successful
`openDatabaseAsync('apex-evidence.db')` followed by a rejected schema setup
discarded the cached promise without closing the returned database. Subsequent
Save/List attempts could open again while the acquired reference was unreleased.
The installed Expo SQLite source caches connections and increments a reference
on a cached open on both platforms. Close releases that acquired reference; it
does not promise to close other owners' references.

Three host regressions reproduce the old behavior. These are injected failure
cases against the actual application adapter, not observed phone incidents.

## Behavior after the correction

- The initialization promise is installed before native code runs. Concurrent
  callers and synchronous reentrant callers share one initialization attempt.
- No list or insert uses the connection before schema setup succeeds.
- If schema setup fails after open returned a handle, close is attempted exactly
  once. Other callers join that attempt until cleanup settles.
- Successful close permits a later explicit Save/List attempt to initialize
  again. The original setup error, including a falsy rejection, is preserved.
- Failed close retains a rejected initialization promise. Both original causes
  are preserved in an `AggregateError`; later calls cannot open another handle.
  The message asks for an app restart, not Fast Refresh or module reimport.
- An open failure before a handle is returned remains retryable. APEX cannot
  release a handle hidden by an SDK-internal failure. This change does not claim
  to correct failures inside Expo's `openDatabaseAsync` implementation.
- Healthy connections remain cached. Ordinary read/write failures do not close
  a connection another caller may be using, reopen it, or replay a write.

No database deletion, row replacement, schema migration, background operation,
external data sharing, dependency update or new permission is introduced.

## Verification

Run `node --test tests/native-evidence*.test.ts` for the 12 focused adapter and
independent regression cases. They cover lazy/single-flight initialization,
blocked cleanup, successful retry, failed-close latching, synchronous and falsy
failures, reentrant open, and healthy-connection reuse after a query failure.

One test uses real **host** SQLite through `node:sqlite` to save, reopen and
detect modified evidence without rewriting the stored bytes. Expo's native
binding remains substituted in these tests. Neither host SQLite nor JavaScript
bundle export establishes iOS/Android native-runtime or device acceptance.

Before physical acceptance, use development builds on both iPhone and Android
to check ordinary Save/List and app-restart persistence. Native fault-injection
testing must separately verify initialization failure, delayed/failed close and
retry ordering. Do not run destructive recovery against a user's journal.
