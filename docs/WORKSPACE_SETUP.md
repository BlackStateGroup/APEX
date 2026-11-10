# Complete source workspace setup

From an APEX checkout, run:

```sh
python3 tools/setup_workspace.py --verify
```

Prerequisites: Git, Python 3.12+, Node 24.x/npm, and GCC for the host C checks. This command fetches all 31 registered root repositories at their exact recorded commits, installs the locked APEX and REA npm dependencies, checks TypeScript and the dependency inventory, runs the host tests, and exports the iPhone, Android and web app bundles. Root source copies become real directories beneath `research/upstream-sources/`.

Existing verified source checkouts are reused. A changed pin, local edits, untracked files, a symlink destination or a failed verification stops that source from being replaced. Fetches are staged and checked before publication. Original archive identities and `source-imports.json` remain unchanged. Upstream build scripts are not run. Npm lifecycle scripts are disabled during installation, as in the existing documented setup path.

## Other setup modes

```sh
# Restore the original 32 backup parts already downloaded into this directory.
python3 tools/setup_workspace.py --archive-dir ../source-archives --verify

# Verify existing source trees and app dependencies without fetching/installing.
python3 tools/setup_workspace.py --check

# Fetch or check only the pinned research roots.
python3 tools/setup_workspace.py --sources-only
python3 tools/setup_workspace.py --sources-only --check
```

The setup writes `build/workspace-setup.json` and individual logs beneath `build/workspace-setup/`. A non-zero exit and `ready: false` identify incomplete setup; partial source successes remain reusable. The receipt's `requestedMode` distinguishes source-only preparation from app dependency preparation.

Use the existing corpus-aware native wrapper when generating native projects:

```sh
npm run android -- --prebuild-only
npm run ios -- --prebuild-only
```

It temporarily parks the research trees outside Expo's recursive template-renaming scope and restores them after process cleanup. Raw `expo prebuild` can change `HelloWorld` fixtures inside the restored Expo research tree. The full verification record includes rechecking source cleanliness after guarded prebuild.

## Verified workspace, 10 November 2026

- All **31 root repositories** restored at their recorded commits and verified clean.
- All **32 original archive parts**, totalling **1,986,961,997 bytes**, checked against their recorded SHA-256 digests.
- **164,492 root tracked entries** available locally. This count includes nested Git references, not the contents of those nested repositories.
- Approximately **3.7 GiB** of expanded research source and Git metadata; approximately **654 MiB** of installed APEX/REA packages.
- Fresh installation: **504 APEX packages** and **149 REA packages** installed from lockfiles.
- **2,578 host tests**, TypeScript, the dependency inventory, and iOS/Android/web JavaScript exports passed in this restored workspace.
- Six setup regressions and 22 existing archive regressions passed. They cover local-edit preservation, wrong pins, symlink destinations, a destination populated during fetch, source reuse, archive tampering and traversal.
- A fresh network fetch of R19/SoapySDR through the new setup code independently reproduced its exact pin and 167 tracked entries.
- Ghidra 12.1.4 with JDK 25 passed the scoped REA provider doctor. A full-engine run in this environment remains limited by the previously recorded Unix-socket restriction; full decompilation has separately passed in PR #27's CI.
- Guarded Android prebuild passed. All 31 restored source roots were checked again and remained clean at their exact pins.
- Host Java/JNI/C++ parity passed **1,485 requests and 8,924 windows** against the unchanged JavaScript oracle. This is host execution, not Android/Hermes device execution.

Retained [host validation](../verification/workspace-setup/host-validation.json), [archive hashes](../verification/workspace-setup/archive-verification.json), [post-prebuild source check](../verification/workspace-setup/source-check-after-native-prebuild.json), [fresh-fetch check](../verification/workspace-setup/setup-reproduction.json), and [native host parity](../verification/workspace-setup/native-iq-host-parity.json).

## Platform toolchains remain separate

The one-command source/app setup does not silently install system-wide SDKs. Android requires its SDK, NDK, CMake and a full JDK; native iPhone builds require macOS/Xcode. The shared workspace is Linux and cannot provide Xcode or Apple signing. Existing GitHub CI verifies Android APK and unsigned iPhone builds separately from local JavaScript exports.

The following additional tools were installed or made available in this Linux workspace:

| Component | Verified version |
| --- | --- |
| Android command-line tools | 22.0, archive build 15859902 |
| Android SDK platform | 37.0 |
| Android build tools | 37.0.0 |
| Android platform tools | 37.0.1 |
| Android NDK | 27.1.12297006 |
| CMake | 3.22.1 |
| Gradle | 9.4.1 |
| Android JDK | Temurin 21.0.13+9 |
| REA engine | Ghidra 12.1.4, Temurin 25.0.5+8 |

Android tools came from [Google's official distribution](https://developer.android.com/studio). The command-line archive SHA-256 was `4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583`. SDK packages were installed by SDK Manager using the environment's existing system CA trust. No TLS verification was disabled. Gradle's official 9.4.1 binary archive matched SHA-256 `2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb`. Installed SDK package identities are retained [here](../verification/workspace-setup/android-installed-packages.json).

`build/activate-workspace.sh` configures the installed tools for this workspace. It contains local paths and is not a portable Mac configuration. Gradle's version command runs; native APK compilation is a separate acceptance step. An offline attempt correctly refused an uncached Gradle plugin. A configured online attempt is recorded separately, rather than counting installed tools as a successful APK build.

The 31 archives preserve root checkouts. Their **63 nested Git references** and the earlier failed DIY Flipper declaration are not silently counted as downloaded dependency source. See `research/nested-dependencies.json` for historical expansion results. Three unnamed historical repository suggestions and the precise Pwnagotchi fork remain unresolved.

Preparing this environment does not merge branches, publish the app, flash hardware or make native build tools portable between Linux and an Apple Silicon Mac. Re-run setup on the destination machine to obtain its correct dependencies; the pinned research source itself is platform-independent.
