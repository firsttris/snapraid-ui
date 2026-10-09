#!/usr/bin/env bash
# Builds the pinned SnapRAID and snapraid-daemon versions the end-to-end tests run against,
# into e2e/.tools/. Builds that are already there are kept.
#
#   snapraid       SnapRAID 14.10, the version of the Docker image, runs the CLI jobs
#   snapraid15     SnapRAID 15, the engine snapraid-daemon needs
#   snapraidd      snapraid-daemon
#   snapraid15-skip-device
#                  SnapRAID 15 with --test-skip-device, as snapraid-daemon's sys_engine:
#                  the test disks are directories on one filesystem. The daemon only runs
#                  binaries, so this is a small C program instead of a script.
#
# Needs git, curl, gcc, make, autoconf, automake and zlib (zlib1g-dev).
set -euo pipefail

SNAPRAID_VERSION="${SNAPRAID_VERSION:-14.10}"
SNAPRAID15_REF="${SNAPRAID15_REF:-v15.0rc2}"
# The version backend/src/engine/REVIEWED_DAEMON_VERSION names
DAEMON_REF="${DAEMON_REF:-v$(cat "$(dirname "${BASH_SOURCE[0]}")/../../backend/src/engine/REVIEWED_DAEMON_VERSION")}"

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$E2E_DIR/.tools"
SRC="$TOOLS/src"
mkdir -p "$SRC"

build_snapraid14() {
  [[ -x "$TOOLS/snapraid" ]] && "$TOOLS/snapraid" --version | grep -q "v$SNAPRAID_VERSION" && return
  echo "Building SnapRAID $SNAPRAID_VERSION..."
  local tarball="$SRC/snapraid-$SNAPRAID_VERSION.tar.gz"
  [[ -f "$tarball" ]] || curl -fsSL -o "$tarball" \
    "https://github.com/amadvance/snapraid/releases/download/v$SNAPRAID_VERSION/snapraid-$SNAPRAID_VERSION.tar.gz"
  rm -rf "$SRC/snapraid-$SNAPRAID_VERSION"
  tar -xzf "$tarball" -C "$SRC"
  (cd "$SRC/snapraid-$SNAPRAID_VERSION" && ./configure >/dev/null && make -j"$(nproc)" >/dev/null)
  cp "$SRC/snapraid-$SNAPRAID_VERSION/snapraid" "$TOOLS/snapraid"
}

# A tagged git checkout, built with autotools
build_git() {
  local repo="$1" ref="$2" dir="$3"
  echo "Building $repo $ref..."
  rm -rf "$SRC/$dir"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$ref" "https://github.com/amadvance/$repo.git" "$SRC/$dir"
  (cd "$SRC/$dir" && ./autogen.sh >/dev/null 2>&1 && ./configure >/dev/null && make -j"$(nproc)" >/dev/null)
}

build_snapraid15() {
  [[ -x "$TOOLS/snapraid15" && "$(cat "$TOOLS/snapraid15.ref" 2>/dev/null)" == "$SNAPRAID15_REF" ]] && return
  build_git snapraid "$SNAPRAID15_REF" snapraid15
  cp "$SRC/snapraid15/snapraid" "$TOOLS/snapraid15"
  echo "$SNAPRAID15_REF" > "$TOOLS/snapraid15.ref"
}

build_daemon() {
  [[ -x "$TOOLS/snapraidd" && "$(cat "$TOOLS/snapraidd.ref" 2>/dev/null)" == "$DAEMON_REF" ]] && return
  build_git snapraid-daemon "$DAEMON_REF" snapraid-daemon
  cp "$SRC/snapraid-daemon/snapraidd" "$TOOLS/snapraidd"
  echo "$DAEMON_REF" > "$TOOLS/snapraidd.ref"
}

build_wrapper() {
  cat > "$SRC/skip-device.c" <<C
#include <stdlib.h>
#include <unistd.h>
int main(int argc, char** argv) {
	char** args = calloc(argc + 2, sizeof(char*));
	args[0] = "$TOOLS/snapraid15";
	args[1] = "--test-skip-device";
	for (int i = 1; i < argc; ++i) args[i + 1] = argv[i];
	execv(args[0], args);
	return 127;
}
C
  gcc -O2 -o "$TOOLS/snapraid15-skip-device" "$SRC/skip-device.c"
}

build_snapraid14
build_snapraid15
build_daemon
build_wrapper

"$TOOLS/snapraid" --version | head -1
"$TOOLS/snapraid15" --version | head -1
"$TOOLS/snapraidd" --version 2>&1 | head -1
