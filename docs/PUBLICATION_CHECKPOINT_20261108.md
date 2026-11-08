# Repository checkpoint, 8 November 2026

This draft-review checkpoint preserves the validated v43-r1 source and documentation in the private BlackStateGroup/APEX repository. It is a continuation of `feat/rea-firmware-lab` at `e51750ec0b34b280399877d67e1036058874c373`, not a merge into main, deployment, release, or hardware acceptance.

## Provenance and historical status

- Local recorded checkpoint: `b3cc661e680b8463618f405e5f8cdf18d39c0a7e`.
- Runtime-tested source: `de3084959e9c1ff455c98c820ec0416ea5f0991c`, 09:59:49–10:01:49 UTC on 8 November 2026.
- The synthetic local baseline is not upstream Git history. All 72 baseline files were compared by Git blob ID with remote `e51750ec` and match exactly. The publication overlays the checkpoint onto that remote tree and preserves remote-only files and 31 existing source-reference gitlinks.
- Earlier statements that work was local/unpushed describe their original checkpoints. This publication record supersedes those delivery-status statements only. Raw logs, original test outcomes, source pins and frozen documentation manifests remain unchanged.
- Start with [the vision and audit index](vision/README.md), [the full capability rollout](vision/FULL_CAPABILITY_ROLLOUT.md), [the delivery roadmap](vision/DELIVERY_ROADMAP.md), and [v43 validation](../verification/increment43-final/README.md).

## Validation and open gates

Recorded local aggregate: 2,081 Node tests, 22 archive tests and 5 REA preflight tests, 2,108 total with no skips. All nine stages and process groups passed/settled, including semantic TypeScript, portable C, inventory checks and three offline JavaScript exports. These are not native SDK builds. Forty browser scenarios were listed; none executed. Native phone/embedded builds, physical devices and radio behavior remain unverified. Existing normal CI may run for the draft PR; its actual results must be read separately, not inferred from these local logs.

The experimental Rust source is uncompiled because Cargo was unavailable. Both C++ candidates are rejected as drop-in replacements: strict cases pass 50/61 and 52/61. Original source, raw evidence, failure records and scope limits remain explicit. Neither replaces the application implementation. See [native experiment status](NATIVE_EXPERIMENT_STATUS_20261108.md).

## Publication audit and exclusions

No installed dependency trees, node_modules, generated app builds, Git databases, bulk recovered upstream source bodies or source archives are added. The separately recovered 31-root/32-archive research corpus is not included. Existing remote gitlinks remain references, not vendored bodies. Unrelated private material is excluded. Searches for common credential/key patterns, credential assignments and authenticated URLs found no matches; this is a bounded content review, not a guarantee that all possible secrets have been detected.

One explicitly reviewed small reference is retained with its complete MIT notice: `research/bthome-reference/const.py.reference` (15,984 bytes) and `LICENSE.bthome-ble` (1,070 bytes), Copyright (c) 2022 Ernst Klamer. Both match their pinned Git blob and SHA-256 IDs in `research/bthome-numeric-source-use.json`. This is a source reference, not an imported parser or runtime dependency.

The installed react-native-ble-plx 3.5.1 LICENSE reports Apache-2.0 while package/lock metadata reports MIT. This discrepancy remains unresolved; package metadata is not a distribution clearance. Preserve attribution and perform selected-file/notice review before distribution. The unapplied iOS proposal is not an installed SDK patch. Original APEX source remains all rights reserved; see [licensing](LICENSING.md) and [current dependency status](CURRENT_DEPENDENCY_AND_CAPTURE_STATUS.md).

Publication changes no existing branch, does not merge any pull request, does not enable deployment, and grants no hardware or account access.

The preserved upstream-only TypeScript file also passed a supplementary full typecheck on the final source; its exact blob IDs, exit status and short raw log are retained in [publication overlay evidence](publication-evidence/README.md).
