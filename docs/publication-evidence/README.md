# Publication overlay compatibility check

An isolated checkout of source checkpoint `b3cc661e680b8463618f405e5f8cdf18d39c0a7e` was supplemented with the exact original upstream-only files preserved from remote base `e51750ec0b34b280399877d67e1036058874c373`:

- `tools/demo.ts`: Git blob `309d2eeb5262723f4397188648ad3839ef2b3842`.
- `.gitattributes`: Git blob `6bb91a2f237f4a69a2598f6381cb6e6e2167dd3e`.

Both fetched bytes were verified against the remote tree. `npm run typecheck` / `tsc --noEmit` completed with exit code **0**. See the [complete short log](upstream-overlay-typecheck.log), including the npm environment-configuration warning. The extra TypeScript file is compatible with the validated source. No fix was required. The preserved `.gitattributes` only suppresses whitespace warnings for the historical objdump text reports under `research/evidence/rea-lab/`.

This is supplementary publication validation on 8 November 2026, not a new runtime aggregate, native build or device test. It does not modify the original v43-r1 evidence or its manifests.
