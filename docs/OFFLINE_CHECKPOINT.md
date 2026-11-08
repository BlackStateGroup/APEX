# Reproducible offline software checkpoint

Read the fixed command list without executing checks or creating output:

```sh
node tools/verify-offline-checkpoint.mjs --plan
```

Execute it with an existing local parent directory and a **new** output directory:

```sh
node tools/verify-offline-checkpoint.mjs --output /tmp/apex-checkpoint-unique
```

The runner requires a POSIX host, existing approved app/REA dependencies, Node,
Python and GCC/toolchain prerequisites. It never installs or repairs dependencies,
invokes npm scripts, builds native projects, launches browsers, or contacts devices.
Use a trusted checkout: the listed repository tests and installed tools execute
local code. Offline environment flags are forced in every child, including git
metadata reads, but are not a network security sandbox. Do not run concurrent
checkpoints or other builds in the same checkout: portable firmware writes build/.
The Expo JavaScript export is directed into the new checkpoint directory.

Stages run sequentially and stop on the first failure. They cover portable C,
discovered tests/*.test.ts (concurrency 2), local TypeScript, Python archive tests,
REA preflight **contract tests**, inventory consistency, Playwright **listing only**,
three-platform Expo JavaScript export and the synthetic offline lab walkthrough.
No new external-engine readiness check is performed. Browser execution, native
builds, physical-device behavior and provider/network actions remain explicit
not-run gates; this checkpoint cannot establish product/device acceptance.

The output directory must not exist, even as a symlink. Symlink ancestors are
rejected; parent directories must already exist. Keep that parent private and do
not rename/replace it during execution. Logs use exclusive creation, private file
permissions and a 16 MiB cap per stdout/stderr stream per stage. Excess output
terminates the stage, preserves the capped partial log and marks truncation.
Each stage records its exact executable, arguments, cwd, deadline, times, exit
status and process-group cleanup status. The manifest records the initial exact
HEAD and raw porcelain dirty status (including untracked files), runtime, forced
environment and unrun gates. This is provenance of a potentially dirty checkout,
not a claim of immutable sources or dependency reproducibility. Metadata records
only the required source/runtime facts and offline flags, not the full environment,
hostname or user identity. Logs and source status can still include project paths
or user-supplied test data; review all output before sharing it. Prefer output
outside the checkout so it does not itself affect subsequent dirty status.

Timeouts are fixed at 2 minutes per ordinary stage, 3 minutes for typechecking,
and 10 minutes each for the aggregate suite and export. SIGINT/SIGTERM/SIGHUP
cancel the run. Each child has a POSIX process group; termination escalates from
TERM to KILL after one second. Group disappearance is checked independently of
child exit, including successful children. Surviving descendants trigger failure
and cleanup. Processes that deliberately escape their group are outside this
containment model. The runner does not weaken existing process-group helpers.

manifest.json is updated atomically and remains useful after interruption. A
settled run publishes result.json atomically without replacing an existing file,
with status succeeded, failed, or
cancelled. An unexpectedly existing result.json is preserved, publication fails,
and the manifest records publication-failed; that existing file is not evidence
of this run succeeding. Final publication requires local hard-link support.
Failed results are not successful checkpoints. Uncertain cleanup writes
only manifest.json with cleanup-uncertain, never result.json; inspect recorded
PIDs/groups before manually retrying. Abrupt termination (SIGKILL, host loss) may
leave a running manifest, partial logs or .tmp metadata and no final result.
Never infer completion from output-directory existence or a partial manifest.
The tool does not automatically delete or reclaim failed outputs.

Runner regressions use local synthetic commands and injected executors. Running
the aggregate tests does not recursively launch another aggregate or Expo export.
No package scripts, manifests, lockfiles or registrations are changed.
