#!/usr/bin/env fish

# Set base path for local development
set -x SNAPRAID_BASE_PATH ./snapraid

# Starte Backend im Hintergrund
cd backend
deno task dev &
set backend_pid $last_pid

# Starte Frontend im Hintergrund
cd ../frontend
npm run dev &
set frontend_pid $last_pid

# Warte auf beide Prozesse
wait $backend_pid
wait $frontend_pid