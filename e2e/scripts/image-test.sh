#!/usr/bin/env bash
# Builds the Docker image from docker/Dockerfile and runs the end-to-end tests against it,
# instead of against the local backend and frontend. Extra arguments go to Playwright.
#
#   npm run test:image                  build, then test
#   E2E_IMAGE=my/image:tag npm run test:image   test an image that is already there
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${E2E_IMAGE:-}" ]]; then
  export E2E_IMAGE=snapraid-ui:e2e
  docker build -t "$E2E_IMAGE" -f "$E2E_DIR/../docker/Dockerfile" "$E2E_DIR/.."
fi

cd "$E2E_DIR"
npx playwright test "$@"
