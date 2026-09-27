#!/usr/bin/env fish

# Usage: ./start.sh          -> uses ./snapraid and the system snapraid binary
#        ./start.sh --demo   -> uses the dev sandbox (see dev/setup.sh)

set root (dirname (realpath (status filename)))

if test "$argv[1]" = "--demo"
    # Build binary and sandbox on first run, no-op afterwards
    bash $root/dev/setup.sh; or exit 1
    set -x SNAPRAID_BASE_PATH $root/dev/sandbox
    set -x SNAPRAID_BIN $root/dev/bin/snapraid
    # All sandbox "disks" live on one filesystem, which snapraid rejects without this
    set -x SNAPRAID_EXTRA_ARGS --test-skip-device
else
    set -x SNAPRAID_BASE_PATH $root/snapraid
end

# Fall back to the Deno downloaded by dev/setup.sh
if not command -q deno; and test -x $root/dev/tools/deno
    set -x PATH $root/dev/tools $PATH
end
if not command -q deno
    echo "Deno not found. Install it (https://deno.land) or run: ./start.sh --demo" >&2
    exit 1
end

# Starte Backend im Hintergrund
cd $root/backend
deno task dev &
set backend_pid $last_pid

# Starte Frontend im Hintergrund
cd $root/frontend
npm run dev &
set frontend_pid $last_pid

# Warte auf beide Prozesse
wait $backend_pid
wait $frontend_pid
