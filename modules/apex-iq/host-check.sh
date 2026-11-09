#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODULE="$ROOT/modules/apex-iq"
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/apex-iq-host.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
EXTRA_FLAGS=()
PARITY=false
for argument in "$@"; do
  case "$argument" in
    --sanitize) EXTRA_FLAGS=(-fsanitize=undefined -fno-sanitize-recover=all -fno-omit-frame-pointer) ;;
    --parity) PARITY=true ;;
    *) printf 'Usage: %s [--sanitize] [--parity]\n' "$0" >&2; exit 2 ;;
  esac
done
command -v java >/dev/null
command -v g++ >/dev/null
# The runtime may expose jdk.compiler without a javac launcher. No installation.
java com.sun.tools.javac.Main -version
JAVA_SRC="$MODULE/android/src/main/java/expo/modules/apexiq"
JAVA_TEST="$MODULE/android/src/test/java/expo/modules/apexiq"
java com.sun.tools.javac.Main -Xlint:all -Werror -d "$BUILD/classes" \
  "$JAVA_SRC/ApexIqNative.java" "$JAVA_SRC/ApexIqCoordinator.java" \
  "$JAVA_TEST/ApexIqLifecycleChecks.java" "$MODULE/tests/ApexIqJniChecks.java" \
  "$MODULE/tests/ApexIqWireHost.java"
java -cp "$BUILD/classes" expo.modules.apexiq.ApexIqLifecycleChecks
# RN vendors the VM-neutral Android JNI header. Compile against that same
# declaration surface when a JDK installation's include/jni.h is unavailable.
JNI_INCLUDE="$ROOT/node_modules/react-native/ReactAndroid/src/main/jni/first-party/jni-hack/real"
test -f "$JNI_INCLUDE/jni.h"
g++ "${EXTRA_FLAGS[@]}" -std=c++17 -O2 -Wall -Wextra -Werror -fexceptions -fno-fast-math -ffp-contract=off -fPIC -shared \
  -I"$JNI_INCLUDE" -I"$ROOT/experimental/hybrid-iq/bridge" \
  "$MODULE/android/src/main/cpp/apex_iq_jni.cpp" \
  "$ROOT/experimental/hybrid-iq/bridge/bridge.cpp" "$ROOT/experimental/hybrid-iq/src/kernel.cpp" \
  -o "$BUILD/libapex_iq.so"
java -Xcheck:jni -Djava.library.path="$BUILD" -cp "$BUILD/classes" expo.modules.apexiq.ApexIqJniChecks
if "$PARITY"; then
  command -v node >/dev/null
  node --test "$MODULE/tests/jni-host-client.test.mjs"
  node "$MODULE/tests/jni-parity.mjs" "$BUILD"
fi
printf '%s\n' 'Host Java lifecycle and actual JNI checks passed. Android Kotlin/Gradle/NDK/device checks were NOT run.'
