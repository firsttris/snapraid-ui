#!/usr/bin/env bash
# Builds SnapRAID UI as one standalone binary with bun build --compile: the backend, the built
# frontend and the documentation (for the MCP endpoint) inside, no Bun or Docker needed to run it.
#
# Usage: scripts/build-binary.sh [target...]
#   target: bun-linux-x64 (default: the host's), bun-linux-arm64
#   SKIP_FRONTEND_BUILD=1 uses apps/web/.output as it is
# Writes dist/snapraid-ui-linux-<arch> per target (x86_64, aarch64).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

if [[ "${SKIP_FRONTEND_BUILD:-}" != "1" ]]; then
  (cd "$ROOT/apps/web" && bun run build)
fi
[[ -f "$ROOT/apps/web/.output/server/index.mjs" ]] || { echo "apps/web/.output is missing, build the frontend first" >&2; exit 1; }

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  case "$(uname -m)" in
    x86_64) targets=(bun-linux-x64) ;;
    aarch64 | arm64) targets=(bun-linux-arm64) ;;
    *) echo "No binary for $(uname -m)" >&2; exit 1 ;;
  esac
fi

# The files the backend reads at runtime, laid out as in the repository: --asset embeds a
# directory under its own name, so the binary has them at /$bunfs/root/apps/web/ and
# /$bunfs/root/docs/ (apps/server/src/system/app-files.ts). The documentation as the MCP endpoint offers
# it: the Markdown pages without the pictures.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/apps/web" "$stage/docs"
cp -R "$ROOT/apps/web/.output" "$stage/apps/web/.output"
cp "$ROOT/apps/web/package.json" "$stage/apps/web/package.json"
cp "$ROOT"/docs/*.md "$stage/docs/"

mkdir -p "$DIST"
cd "$ROOT/apps/server"
for target in "${targets[@]}"; do
  case "$target" in
    bun-linux-x64) arch=x86_64 ;;
    bun-linux-arm64) arch=aarch64 ;;
    *) echo "Unknown target $target (bun-linux-x64, bun-linux-arm64)" >&2; exit 1 ;;
  esac
  out="$DIST/snapraid-ui-linux-$arch"
  # The CI checks the backend's types (bun run typecheck); bun build only bundles. Configured by
  # the environment only: no .env or bunfig.toml from the directory it runs in (the data directory)
  bun build --compile \
    --no-compile-autoload-dotenv \
    --no-compile-autoload-bunfig \
    --target "$target" \
    --asset "$stage/apps" \
    --asset "$stage/docs" \
    --outfile "$out" \
    src/bin.ts
  echo "Built $out"
done
