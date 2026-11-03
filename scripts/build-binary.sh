#!/usr/bin/env bash
# Builds SnapRAID UI as one standalone binary with bun build --compile: the backend, the built
# frontend and the documentation (for the MCP endpoint) inside, no Bun or Docker needed to run it.
#
# Usage: scripts/build-binary.sh [target...]
#   target: bun-linux-x64 (default: the host's), bun-linux-arm64
#   SKIP_FRONTEND_BUILD=1 uses frontend/.output as it is
# Writes dist/snapraid-ui-linux-<arch> per target (x86_64, aarch64).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

if [[ "${SKIP_FRONTEND_BUILD:-}" != "1" ]]; then
  (cd "$ROOT/frontend" && bun run build)
fi
[[ -f "$ROOT/frontend/.output/server/index.mjs" ]] || { echo "frontend/.output is missing, build the frontend first" >&2; exit 1; }

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  case "$(uname -m)" in
    x86_64) targets=(bun-linux-x64) ;;
    aarch64 | arm64) targets=(bun-linux-arm64) ;;
    *) echo "No binary for $(uname -m)" >&2; exit 1 ;;
  esac
fi

# The files the backend reads at runtime, laid out as in the repository: --asset embeds a
# directory under its own name, so the binary has them at /$bunfs/root/frontend/ and
# /$bunfs/root/docs/ (backend/src/app-files.ts). The documentation as the MCP endpoint offers
# it: the Markdown pages without the pictures.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/frontend" "$stage/docs"
cp -R "$ROOT/frontend/.output" "$stage/frontend/.output"
cp "$ROOT/frontend/package.json" "$stage/frontend/package.json"
cp "$ROOT"/docs/*.md "$stage/docs/"

mkdir -p "$DIST"
cd "$ROOT/backend"
for target in "${targets[@]}"; do
  case "$target" in
    bun-linux-x64) arch=x86_64 ;;
    bun-linux-arm64) arch=aarch64 ;;
    *) echo "Unknown target $target (bun-linux-x64, bun-linux-arm64)" >&2; exit 1 ;;
  esac
  out="$DIST/snapraid-ui-linux-$arch"
  # The CI checks the backend's types (bun run typecheck); bun build only bundles
  bun build --compile \
    --target "$target" \
    --asset "$stage/frontend" \
    --asset "$stage/docs" \
    --outfile "$out" \
    src/bin.ts
  echo "Built $out"
done
