# Independent design/model review

Reviewed commit 74abb88db23e5401fad47a498d4e2b7a1ed8bafc after the initial
be23b5685ef7ce1ed6e69311105dec64c7375412 review.

The model's wrong-token retry defect is corrected: identity is checked before
finish. Unknown and historical-token regressions cover the identified defect.
The original independent wrong-token case was appended to the corrected model
in a separate review worktree and rerun: 16 tests passed, zero failed, exit 0.
Raw output is retained in independent-review.log. The earlier adversarial failure
in review-failure.log matches the reviewer's original output byte-for-byte.

Command (Node v24.22.1; no package resolution/downloads):

    CI=1 npm_config_offline=true EXPO_OFFLINE=1 node --test docs/proposals/usb-cleanup-receipts/reviewer.test.mjs

The temporary reviewer.test.mjs consists of model.test.mjs followed by:

```js
test('review: wrong-token retry cannot finish a different owner',()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();
  for(let i=0;i<3;i++) m.step(i,'succeeded');
  const owner=m.owner;
  assert.equal(m.retry(t+1),'unknown');
  assert.equal(m.owner,owner);
  assert.equal(m.query(t),'pending');
});
```

Source references were checked against ApexDeviceModule.kt SHA-256:
53887adec7cac4bf3be4e06c76aaddab20005546f4d569e2583995223eef7d30.
The diff from f75a74032b71f54dbdf87c81e7f6a6e11070696f contains only proposal
files. Active Kotlin, native API and App are unchanged.

No additional blocking contradiction found within this design-only scope. The
design retains unresolved ownership, forbids repeating ambiguous OS operations,
separates lost bridge results from process death, and limits closed-history
retention. No Android close/releaseInterface idempotency guarantee is asserted.
The model explicitly omits ownerId/epoch/revision behavior, real acquisition
handles, native concurrency and bridge delivery. It tests hypothetical rules,
not the proposed protocol in full or any native implementation. It does not
establish eligibility or safety of later OS operations after an ambiguous effect;
that remains subject to the design's independent contract review requirement.

Native compilation, installation, execution, Android/USB/device acceptance and
RF checks: NOT RUN. No official Android contract was retrieved or inferred.
This review does not approve native implementation, deployment or recovery.
