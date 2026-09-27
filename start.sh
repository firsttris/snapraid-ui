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
    # Local data directory, the backend fills it on first start
    mkdir -p $SNAPRAID_BASE_PATH
end

# Fall back to the Deno downloaded by dev/setup.sh
if not command -q deno; and test -x $root/dev/tools/deno
    set -x PATH $root/dev/tools $PATH
end
if not command -q deno
    echo "Deno not found. Install it (https://deno.land) or run: ./start.sh --demo" >&2
    exit 1
end

# Stop a process and everything it started
function kill_tree
    for child in (pgrep -P $argv[1])
        kill_tree $child
    end
    kill $argv[1] 2>/dev/null
end

# deno run --watch ignores the SIGINT of Ctrl+C, so stop both servers with SIGTERM
function stop_servers --on-event fish_exit
    for pid in $backend_pid $frontend_pid
        kill_tree $pid
    end
end

function on_interrupt --on-signal INT --on-signal TERM
    exit 130
end

# Starte Backend im Hintergrund
cd $root/backend
deno task dev &
set -g backend_pid $last_pid

# Starte Frontend im Hintergrund
cd $root/frontend
npm run dev &
set -g frontend_pid $last_pid

# Warte auf beide Prozesse. Polling statt wait, weil fish wait nur bei SIGINT unterbricht;
# endet einer, stoppt fish_exit den anderen
while kill -0 $backend_pid 2>/dev/null; and kill -0 $frontend_pid 2>/dev/null
    sleep 1
end
