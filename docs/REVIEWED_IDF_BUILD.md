# Build-only derivative ESP-IDF gate

`tools/build-reviewed-idf.mjs` is opt-in local infrastructure, not CI. It never
selects `firmware/esp32s3` as its build project. The historical workflow is
unchanged and does not build this derivative. No SDK was installed or invoked
while developing this helper; the tests are explicitly synthetic fixtures.

## Separate gates

- The latest SDK guard/source delta's fresh independent review remains **open**.
  This helper neither reviews it nor certifies the directory named `reviewed`.
- Native SDK compilation is **unrun here**. Success from fixtures is not SDK
  API/ABI/link validation. An authorized, already provisioned builder must run
  the following commands, then inspect actual warnings and linked outputs.
- No firmware is executed. Default-off still contains historical USB startup.
  Build success is not permission to flash, monitor, run, advertise or access
  USB/radio hardware. Physical acceptance, timer races, RAM/stack margin,
  real notification ownership/pressure and phone lifecycle remain separate.

## Authorized builder procedure (not executed in this change)

Use a trusted POSIX build host with Node and Python, Git, CMake/Ninja, compiler,
IDF tools and SDK already provisioned. Activate its existing tool environment
outside this helper. Do not install anything as part of this procedure. Use a
clean checkout containing the helper and a clean, fully initialized SDK Git
worktree at IDF `fff9895c82d744c7237be8847347bdd1b07c6643`, with NimBLE at
`139cada0ae932957fa06ba37d17e3c9c2c95c773` and matching SDK gitlink. Recursive
SDK submodules must be initialized at their pinned commits. No container launch,
image fetch, credentials, setting changes or SDK setup is implemented.

Run separately, with two **new** sibling output directories outside both source
and SDK. Parent directories must already exist, and paths must have no symlink
ancestors, CMake semicolons or newlines. Replace these absolute example paths:

```sh
node tools/build-reviewed-idf.mjs --sdk /approved/esp-idf --output /evidence/apex-default-off --mode default-off
node tools/build-reviewed-idf.mjs --sdk /approved/esp-idf --output /evidence/apex-explicit-on --mode explicit-on
```

Omitting `--mode` means `default-off`. `explicit-on` changes compilation only.
There is no arbitrary command/argument passthrough; install, flash, monitor,
run, prebuild and target-changing actions are rejected. The only SDK actions
are `python3 <sdk>/tools/idf.py … reconfigure` and `… build`, always using
`<new-output>/source/firmware/esp32s3-reviewed` with `IDF_TARGET=esp32s3`.
The source snapshot preserves relative references to unchanged portable core
and historical USB source. It copies tracked files from those three firmware
subtrees; it does not build the historical target or change the checkout.
Generated source sdkconfig/build/managed_components inputs are refused.

Each run gets fresh defaults, sdkconfig, source snapshot and build directory.
There is no implicit old sdkconfig reuse. Off/on configurations require the
corresponding adapter flag, Bluetooth/NimBLE enabled and the selected ESP timer
path. Reconfigure's sdkconfig is checked for missing, conflicting or duplicate
selected entries before compilation. It must remain byte-identical after build;
selected generated header definitions must agree. This is selected-config
verification, not a substitute for inspecting preprocessor output and the full
link map for notification support, static RAM and task-stack headroom.

## Evidence and failures

`result.json` records requested/effective options, exact source/SDK/NimBLE Git
identity and cleanliness before/after, SDK submodule status, source SHA-256s,
commands/exit/signal/group-cleanup results and SHA-256s of retained artifacts.
The successful build requires the derivative ELF/BIN/map and sdkconfig header.
All ordinary build files, map/config and partial failed outputs remain in the
caller-selected directory. Nothing is automatically removed, overwritten or
reused across runs. The result itself is not self-hashed.

Stages are `unrun`, `failed` or `succeeded`; only all required stages succeeding
can produce overall success. A failed reconfigure leaves compilation unrun. A
failed compile can leave partial artifacts without being called successful.
`owner.json` and immutable per-command started/spawned/finished records preserve
supervisor and process-group IDs. Missing `result.json` or missing finished
records means incomplete/unknown outcome, never success. Inspect processes and
files manually after interruption; do not reuse that output directory.

No arbitrary environment dump or credential discovery occurs. Only PATH, HOME,
TMPDIR, LANG, LC_ALL, IDF_TOOLS_PATH and IDF_PYTHON_ENV_PATH are inherited;
IDF identity/target/component-manager controls and Git global/system config
isolation are explicitly set. Configure/build use the already provisioned PATH.
Component-manager acquisition is disabled. Tool output is retained as build
logs; use a trusted builder whose tools do not print credentials. Do not publish
logs before inspecting them. SDK/tool executable binaries and local Git config
are still trusted inputs, not cryptographically attested by this wrapper.

The historical image digest
`81893c71bb5e570088901f21def8684c25cd2a9020281bd01b843a7655edb18c`
has **no verified binding** to those source pins. This helper does not infer one
or claim a container was used. If a builder uses a container, separately record
its actually resolved image/platform/digest and toolchain versions without
secrets. SDK Git provenance alone does not prove toolchain binary provenance.

Each process is shell-free, in its own POSIX process group, with a 30-minute
per-command bound and an 8 MiB raw-byte budget per captured stream.
Per-stream metadata distinguishes observed bytes (received before termination),
retained bytes and truncation. Base64 preserves the exact retained raw prefix.
The UTF-8 diagnostic text is decoded once after concatenation, preserving
chunk-spanning code points; malformed bytes use replacement characters. That
text view is separately bounded to 8 MiB encoded UTF-8 bytes without splitting
a rendered code point, with text truncation reported. The raw prefix is canonical.
Base64/JSON representation overhead is not part of the raw-byte capture limit. On timeout/interruption or
leader exit, group descendants are terminated, then killed after 250 ms if
necessary; absence must be observed (up to six seconds). Failed/uncertain
cleanup fails the command and retains evidence. These controls handle ordinary
build descendants; they are **not a sandbox**. Escaped process groups, malicious
build scripts, external concurrent writers, hostile filesystem races and
SIGKILL/power loss of the supervisor are outside the guarantee. Use a trusted,
exclusive build workspace. Permission to compile is not permission for an
untrusted SDK/build script or installation.

## Local synthetic checks

```sh
node --test tests/reviewed-idf-build-suites.test.ts
./node_modules/.bin/tsc --noEmit
```

Tests inject Git/SDK responses and use only bounded Node subprocess fixtures.
They perform no SDK/environment discovery and invoke no real build. Full tsc
checks the existing TypeScript project; it does not typecheck the `.mjs` helper
or compile C. Existing repository aggregate `npm test` invokes firmware build
and is intentionally not used for this infrastructure-only task.

The typed suite loader imports both JavaScript suites directly. Their individual
node:test cases register in the same process and appear in aggregate counts,
without a nested subprocess total. Existing npm test and the fixed nine-stage
checkpoint discover the loader through tests/*.test.ts. Their command selection,
stage count and safeguards are unchanged. The fixture tests assert this wiring.
