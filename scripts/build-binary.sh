#!/usr/bin/env bash
# Builds SnapRAID UI as one standalone binary with deno compile: the backend, the built frontend
# and the documentation (for the MCP endpoint) inside, no Deno, Node or Docker needed to run it.
#
# Usage: scripts/build-binary.sh [target...]
#   target: x86_64-unknown-linux-gnu (default: the host's), aarch64-unknown-linux-gnu
#   SKIP_FRONTEND_BUILD=1 uses frontend/.output as it is
# Writes dist/snapraid-ui-linux-<arch> per target.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

if [[ "${SKIP_FRONTEND_BUILD:-}" != "1" ]]; then
  (cd "$ROOT/frontend" && npm run build)
fi
[[ -f "$ROOT/frontend/.output/server/index.mjs" ]] || { echo "frontend/.output is missing, build the frontend first" >&2; exit 1; }

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  case "$(uname -m)" in
    x86_64) targets=(x86_64-unknown-linux-gnu) ;;
    aarch64 | arm64) targets=(aarch64-unknown-linux-gnu) ;;
    *) echo "No binary for $(uname -m)" >&2; exit 1 ;;
  esac
fi

mkdir -p "$DIST"
cd "$ROOT/backend"
# The documentation as the MCP endpoint offers it, the Markdown pages without the pictures
docs=()
for page in ../docs/*.md; do docs+=(--include "$page"); done
for target in "${targets[@]}"; do
  out="$DIST/snapraid-ui-linux-${target%%-*}"
  # The permissions of deno task start; the frontend, package.json (the version) and the docs are
  # read at runtime relative to the backend's sources, so they keep their place next to backend/.
  # --no-check: the CI checks the backend (deno check), and the frontend's bundle carries JSDoc
  # types that point to files the build does not keep
  deno compile --no-check \
    --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys=networkInterfaces,hostname \
    --include ../frontend/.output \
    --include ../frontend/package.json \
    "${docs[@]}" \
    --target "$target" \
    --output "$out" \
    src/bin.ts
  echo "Built $out"
done
