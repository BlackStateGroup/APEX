# Independent tuple-typing correction review

Approved: builder commit 984e505a42262ca3771a427551eadf5c623cc593.
Reviewed on main base 3c0e86d26cda3101f357308c54f65af19031f9c0 in an
isolated local clone, with existing installed dependencies linked, no install.

The sole code change adds `as const` to the literal two-case array. This makes
its inner entries readonly tuples with known positions instead of arbitrary
string arrays. Destructuring therefore produces defined strings under the
existing strict/noUncheckedIndexedAccess settings. No compiler option was
weakened and no non-null assertion or unsafe cast was introduced.

Both exact pairs remain unchanged:
- --require-safe-overflow / !subscribed
- --require-safe-retry / tx_timer.pending||!subscribed

The expected exit status remains 1 and stderr must still contain the specified
failed assertion. These remain intentionally failing historical safety
requirements, not production fixes. Node type erasure produces identical runtime
code after whitespace normalization (checked programmatically).

Independent validation:
- Full tsc --noEmit before correction: exit 1, exact two TS2769 diagnostics.
- Full tsc --noEmit after exact correction: exit 0, no diagnostics.
- Both historical and reviewed host wrappers: 2/2 passing.
- No sanitizer rerun, full aggregate rerun, SDK/native build, install, network,
  device, radio, flash or production source modification performed.

Raw before/after diagnostics, wrapper output and runtime equivalence check are
retained here. Empty after.txt means no compiler diagnostics, not a missing run.

Review tooling note: the first equivalence check collapsed whitespace but did not
remove the newly erased span, so its textual comparison failed. The corrected
check normalizes only that closing-parenthesis span and passes; this was a review
comparison defect, not changed runtime behavior.
