# Development

This page gets you from a fresh clone to a running development setup, and covers the project layout, tests, linting, translations, UI components, building the image and the release process. For how the pieces fit together, see [Architecture](architecture.md).

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22 or newer | Frontend (CI and the image use Node 22) |
| [Deno](https://deno.com/) | 2.5 or newer | Backend (CI uses 2.5.x, the image 2.5.6). `./start.sh --demo` downloads Deno into `dev/tools/` if none is installed |
| [fish](https://fishshell.com/) | | `start.sh` is a fish script |
| `curl`, `tar`, `gcc`, `make` | | Building SnapRAID for the demo sandbox (`dev/setup.sh`); `unzip` too if Deno has to be downloaded |
| SnapRAID | 14.0 or newer | Only for running against a real array without `--demo`; it has to be on your `PATH` or set via `SNAPRAID_BIN` |
| Docker or Podman | | Only for building the image |

## Getting started

```bash
git clone https://github.com/firsttris/snapraid-ui
cd snapraid-ui
./install.sh          # npm install in frontend/, deno cache in backend/
./start.sh --demo     # sandbox with fake disks, no real array needed
```

Open **http://localhost:3000**. The frontend dev server runs on port 3000, the backend API and WebSocket on port 8080. `Ctrl+C` stops both.

`./start.sh` has two modes:

| Command | Data directory | SnapRAID binary | Extra |
|---|---|---|---|
| `./start.sh` | `./snapraid/` (created on first start, ignored by git) | `snapraid` from your `PATH` | Works against your real configs |
| `./start.sh --demo` | `dev/sandbox/` | `dev/bin/snapraid` | Sets `SNAPRAID_EXTRA_ARGS=--test-skip-device` and `SNAPRAID_DEMO=1` |

Under the hood it starts `deno task dev` in `backend/` (with `--watch`, so the backend restarts on changes) and `npm run dev` in `frontend/` (Vite with hot reload). You can run these two commands yourself in separate terminals; set `SNAPRAID_BASE_PATH` and friends first (see [Configuration](configuration.md)), otherwise the backend uses `../snapraid` relative to `backend/`.

> [!NOTE]
> In development the frontend calls the backend directly at `http://localhost:8080` (`frontend/src/lib/api/constants.ts`), and the backend only accepts credentials from the same hostname. Open the dev frontend as `http://localhost:3000`, not via a LAN IP.

<details>
<summary>Stopping leftover processes</summary>

```bash
pgrep -af "src/main.ts"                                   # show running backends
pkill -f "deno task dev"; pkill -f "deno run.*src/main.ts"
pkill -f "vite dev"
```

</details>

## Demo sandbox

`dev/setup.sh` (run automatically by `./start.sh --demo`, a no-op once everything exists) prepares a self-contained SnapRAID environment:

- builds SnapRAID (`SNAPRAID_VERSION`, default 14.10) from the official release tarball into `dev/bin/snapraid`, cached in `dev/.cache/`;
- downloads Deno (`DENO_VERSION`, default 2.9.7) into `dev/tools/` if `deno` is not installed;
- creates `dev/sandbox/` with the array "Media Array": four data "disks" (`disks/disk1`–`disk4`) and a parity disk (`disks/parity1`) filled with random files, a `snapraid.conf` and `config.json`;
- runs sync, scrub, touch and sync again with their logs, then adds, changes and deletes a file and runs `diff` and `status`, so that every page has something to show;
- gives the sandbox a past with `dev/seed-demo.ts`: the job logs move back in time (last sync 10 hours ago, scrub yesterday), `usage-history.json` gets two months of disk usage with one disk filling up, `schedules.json` a nightly sync with touch and scrub, a weekly scrub and a SMART check, and `maintenance.json` Docker pause and spindown.

All sandbox disks are directories on one filesystem, which SnapRAID only accepts with `--test-skip-device`. They hold a few KiB and have no SMART data, power state or Docker next to them, so `SNAPRAID_DEMO=1` makes the backend answer like a real home server (`backend/src/demo.ts`):

- `smart` and `probe`: generated results in the real structured log format: a healthy HDD, an SSD, an HDD with growing reallocated sectors, a sleeping 16 TB disk and an 18 TB parity disk;
- `status`: the real log of the sandbox, with the sizes, file counts and fragmentation of those disks and a scrub that keeps up (64 % verified, the oldest block 17 days old) instead of the sandbox's figures;
- disk usage (`df`) and the parity file's size: the same disks instead of the host's filesystem;
- Docker: three containers (immich, jellyfin, nextcloud) that can be paused and resumed.

```bash
dev/setup.sh --reset                         # recreate the sandbox from scratch
DISKS_DIR=/mnt dev/setup.sh --reset          # the disks at /mnt/disk1 … /mnt/parity1, as the screenshots show them
SNAPRAID_VERSION=14.10 dev/setup.sh --reset  # build another SnapRAID release
```

`dev/bin/`, `dev/.cache/`, `dev/sandbox/` and `dev/tools/` are ignored by git.

## Project structure

```text
backend/
  deno.json            tasks, import map (Hono, Croner, Nodemailer, @std/*, @shared/)
  src/
    main.ts            app setup, middleware, startup
    routes/            HTTP routes per area
    executors/         job runner (spawn, stream, progress, abort)
    parsers/           structured log parsers, tests and real SnapRAID fixtures
    __tests__/         backend unit tests
    *.ts               auth, scheduler, notifications, log manager, histories, wizards, backup, demo
frontend/
  messages/            UI texts: en.json, de.json, it.json
  project.inlang/      Paraglide/inlang project settings
  scripts/             add-messages.py
  public/              favicon, PWA icons
  src/
    routes/            pages (file-based routing), __root.tsx
    components/        feature components; ui/ = shadcn/ui primitives
    hooks/             TanStack Query hooks, running job state, selected config
    lib/               API client, WebSocket, log parsing, theme, i18n, commands
    lib/__tests__/     frontend unit tests
shared/                types and logic used by backend and frontend
docker/                Dockerfile, Compose file, Quadlet units, nginx and supervisor config
dev/setup.sh           demo sandbox
e2e/                   end-to-end tests (Playwright) against real SnapRAID and snapraid-daemon
install.sh, start.sh   local setup and start
```

Both sides import shared code as `@shared/…`: the backend through the import map in `backend/deno.json`, the frontend through the `paths` in `frontend/tsconfig.json`. Keep code in `shared/` free of Deno- or browser-specific APIs.

## Scripts

Frontend (`frontend/package.json`, run with `npm run <script>` in `frontend/`):

| Script | What it does |
|---|---|
| `dev` | Vite dev server on port 3000 |
| `build` | Production build into `.output/` |
| `serve` | `vite preview` of the build |
| `paraglide` | Compile `messages/*.json` into `src/paraglide/` |
| `typecheck` | `paraglide`, then `tsc --noEmit` |
| `test` | Vitest, single run |
| `check` / `lint` / `format` | Biome check (lint + format + import order) / lint only / format only |
| `generate-pwa-assets` | Regenerate `favicon.ico`, PWA and Apple icons from `public/favicon.svg` |
| `release` | Create and push a release tag, see [Releases](#ci-and-releases) |

Backend (`backend/deno.json`, run with `deno task <task>` in `backend/`):

| Task | What it does |
|---|---|
| `dev` | Run `src/main.ts` with `--watch` |
| `start` | Run `src/main.ts` |

Both tasks use the same permissions as the container: `--allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys=networkInterfaces,hostname`.

## Tests

```bash
cd backend && deno test --allow-all    # as in CI
cd frontend && npm test

# Also run the engine contract against the SnapRAID CLI, with the binary from dev/setup.sh
cd backend && SNAPRAID_BIN=../dev/bin/snapraid SNAPRAID_EXTRA_ARGS=--test-skip-device deno test --allow-all
```

To run the engine contract against snapraid-daemon too, build it (`./autogen.sh && ./configure && make` in a checkout of [snapraid-daemon](https://github.com/amadvance/snapraid-daemon), and SnapRAID 15 the same way) and start it in the foreground for a throwaway array:

```bash
snapraidd -f -c snapraidd.conf -C snapraid.conf -p snapraidd.pid
cd backend && SNAPRAID_TEST_DAEMON_URL=http://127.0.0.1:7627 SNAPRAID_TEST_DAEMON_CONF=/path/to/snapraid.conf deno test --allow-all
```

The test adds files to the array's first data disk. In `snapraidd.conf` set `net_port = 127.0.0.1:7627` and leave `maintenance_schedule` empty. The daemon only runs a real binary as `sys_engine`, no script; for disks that share one filesystem, point it at a small compiled wrapper that adds `--test-skip-device`.

- **Backend** tests use `Deno.test` with `@std/assert`. Parser tests in `backend/src/parsers/__tests__/` run against real SnapRAID logs in `fixtures/`; when SnapRAID's log format changes, add or update a fixture from a real run. The [engine contract](architecture.md#snapraid-engine) runs against the fake engine always and against the CLI engine when `SNAPRAID_BIN` and `--test-skip-device` are set (otherwise it shows as *ignored*); the scheduler is tested against the fake engine. Other tests cover auth, backup/restore, config paths, the disk wizards, `--force-*` detection, the log manager, notifications, the SMART baseline and history, and the usage history.
- **Frontend** tests use Vitest and live in `frontend/src/lib/__tests__/`: log parsing, progress, the job tracker and the i18n checks described [below](#translations). Run them from `frontend/`, they read `messages/` and `../backend/src` by relative path.

### End-to-end tests

`e2e/` drives the whole application through a browser (Playwright, Chromium) against real SnapRAID and snapraid-daemon on throwaway arrays, so a change to the backend, the frontend or the Docker image is checked the way a user would notice it:

| Test | What happens |
|---|---|
| `array.spec.ts` | Dashboard health and disks; sync with its preview (new and deleted files); bit rot in a file, found by a full scrub, repaired and verified by *Repair and verify*, byte for byte; *Undelete* of a deleted file; spinning disks up and down |
| `schedules.spec.ts` | The nightly routine (touch, sync, scrub) created in the form and started with *Run now*; a scheduled sync skipped while a disk is empty (not mounted), the dashboard shows *Disk not available*; a sync skipped for mass changes, as ransomware leaves them; *Skip next run* and taking it back |
| `setup.spec.ts` | The setup wizard after a first start: disks picked, the configuration written and synced, the placeholder entry replaced; a setup without parity or with a too small parity disk refused |
| `recovery.spec.ts` | *Recover files*: a deleted file and an encrypted one restored byte for byte; a file of the same path on another disk left alone |
| `home-assistant.spec.ts` | Home Assistant set up in the UI against an MQTT broker in the test: discovery and state arrive, the Scrub and Sync buttons run their jobs |
| `monitoring.spec.ts` | The heartbeat pinged by *Send ping* and after a successful scheduled run; Prometheus metrics switched on, refused without the token, describing the array with it |
| `notifications.spec.ts` | Webhook set up in the UI: the test message and the *job failed* message of a sync without its parity disk reach a local receiver |
| `config.spec.ts` | A data disk added in the visual editor is in `snapraid.conf` and protected by the next sync |
| `docker.spec.ts` | A container picked under Automation is paused during the sync and resumed after it (`docker events`); skipped without a Docker daemon |
| `daemon.spec.ts` | Daemon mode switched on in the UI: *Test connection*, then a sync runs as a task of snapraid-daemon |

```bash
cd e2e
npm ci
npx playwright install chromium   # once
npm run setup                     # builds the tools into e2e/.tools, needs autoconf, automake, zlib1g-dev
npm test                          # builds the frontend, starts everything, runs the tests (about 2 min)
npm run test:image                # the same tests against the Docker image built from docker/Dockerfile
```

`npm run setup` builds SnapRAID 14.10 (the version of the image) for the jobs SnapRAID UI runs itself, and SnapRAID 15 with snapraid-daemon at the version in `backend/src/engine/REVIEWED_DAEMON_VERSION`. The test disks are directories on one filesystem, so SnapRAID runs with `--test-skip-device`: the backend gets it through `SNAPRAID_EXTRA_ARGS`, the daemon through a small compiled wrapper as `sys_engine`.

The global setup (`e2e/harness/global-setup.ts`) recreates `e2e/.run/` on every run: the backend's data directory, the arrays and a log per server. It starts snapraid-daemon on its own array, the backend (with `PORT`, `SNAPRAID_BASE_PATH` and `SNAPRAID_BIN` pointing into `e2e/`), the production build of the frontend and a small proxy that sends `/api` and `/ws` to the backend like nginx in the image. Each test creates its own array, adds it through the API and opens it; the `app` fixture removes it, and the schedules, afterwards. Tests run one after the other, the backend runs one job at a time.

With `E2E_IMAGE=<image>` the container takes the place of backend, frontend and proxy: started as in `docker/docker-compose.yml`, with the data directory in `/app/snapraid`, the arrays at the same paths as on the host and the Docker socket mounted. It shares the host's network (nginx on port 80), so the backend reaches snapraid-daemon and the webhook receiver on `127.0.0.1`. `E2E_SKIP_BUILD=1` skips the frontend build of a local run. A failed test leaves a trace (`npx playwright show-trace e2e/test-results/…/trace.zip`) and the server logs in `e2e/.run/*.log`; CI uploads both.

## Linting and type checking

| | Command | Where |
|---|---|---|
| Frontend lint + format | `npx biome check` (add `--write` to fix) | `frontend/` |
| Frontend types | `npm run typecheck` | `frontend/` |
| Backend types | `deno check src/main.ts` | `backend/` |

Biome (`frontend/biome.json`) uses the recommended rules, 2-space indentation, single quotes, double quotes in JSX, no semicolons, and organizes imports. It covers `frontend/src/` except the generated `routeTree.gen.ts`, `src/paraglide/` and `styles.css`. The backend has no linter configured; it follows the style of the existing code (double quotes, semicolons).

`npm run typecheck` compiles the Paraglide messages first, because components import them from the generated `src/paraglide/`.

## Translations

The UI is available in English, German and Italian. All texts are in `frontend/messages/{en,de,it}.json` in the inlang message format (`@inlang/plugin-message-format`); `en` is the base locale (`frontend/project.inlang/settings.json`). Placeholders are written as `{name}`.

- **Frontend:** import the messages as `import * as m from '../paraglide/messages'` (relative path) and call `m.key({ … })`.
- **Backend:** for errors a user can see, return `msg("server_error_…", { … })` from `shared/i18n.ts` instead of text. The frontend renders the key in the UI language with `localizeServer()`. Notification texts are not in the message files; they are in `backend/src/notification-events.ts` and `backend/src/routes/notifications.ts`, one block per language.

To add, change or remove a key in all three files at once, use the helper script from `frontend/`:

```bash
python3 scripts/add-messages.py '{"dashboard_new_hint": {"en": "Hello {name}", "de": "Hallo {name}", "it": "Ciao {name}"}}'
python3 scripts/add-messages.py --remove dashboard_new_hint old_key
```

Every key needs all three languages, otherwise the script exits with an error. Existing keys are overwritten. The script takes a file lock, so several editors (or agents) can run it in parallel.

`frontend/src/lib/__tests__/i18n.test.ts` fails when:

- a language is missing a key, has an empty text, or uses different placeholders than English;
- a key is not used anywhere in the frontend or backend code;
- the code uses a key (`m.key(` or `msg("key"`) that does not exist.

Adding a language touches more than a JSON file: the `locales` in `project.inlang/settings.json`, the locale list in `scripts/add-messages.py` and in `i18n.test.ts`, the `language` type of `NotificationSettings` in `shared/types.ts`, and the notification texts in the backend.

## UI components

The UI is built with [shadcn/ui](https://ui.shadcn.com/) on top of Radix UI and Tailwind CSS v4, with icons from [lucide](https://lucide.dev/). `frontend/components.json` configures the *new-york* style, base color *zinc*, CSS variables in `src/styles.css`, and the aliases `@/components/ui`, `@/lib/utils` and `@/hooks`.

The primitives in `frontend/src/components/ui/` are owned by the project and can be edited. To add another one, run the shadcn CLI in `frontend/`, for example:

```bash
npx shadcn@latest add popover
```

Colors come from the CSS variables in `src/styles.css`, which define the light and dark theme. Use these tokens (`bg-background`, `text-muted-foreground`, …) instead of fixed colors so both themes keep working. Charts use Chart.js through `react-chartjs-2`; the command palette uses `cmdk`; toasts use `sonner`.

## Building the image

From the repository root:

```bash
docker build -f docker/Dockerfile -t snapraid-ui .
# pin another SnapRAID release
docker build -f docker/Dockerfile --build-arg SNAPRAID_VERSION=14.10 -t snapraid-ui .
# or build and start with Compose
docker compose -f docker/docker-compose.yml up --build
```

The build context is the whole repository; `.dockerignore` leaves out `node_modules`, test files, the local `snapraid/` data, `dev/` and `e2e/`. See [Architecture](architecture.md#container-layout) for the stages and [Installation](installation.md) for running the image.

### Updating SnapRAID

The image pins one SnapRAID release that the parsers are tested against. A weekly workflow (`upstream-release.yml`) opens an issue when a newer stable release is out. To bump it:

1. Read SnapRAID's `HISTORY` for changes to the structured log (`--log`).
2. Change `SNAPRAID_VERSION` in `docker/Dockerfile`, `dev/setup.sh` **and** `e2e/scripts/setup-tools.sh`.
3. Run `SNAPRAID_VERSION=<new> dev/setup.sh --reset`, start `./start.sh --demo` and run status, diff, sync, scrub, check, list, dup, touch and smart in the UI.
4. For a major version, compare the log tags with the fixtures in `backend/src/parsers/__tests__/fixtures/`.

### Watching snapraid-daemon

Jobs, status, diff, SMART and the power state go through the [SnapRAID engine](architecture.md#snapraid-engine), so they could also run on snapraid-daemon's REST API one day. Its API was last compared with the version in `backend/src/engine/REVIEWED_DAEMON_VERSION`. The same weekly workflow opens an issue when snapraid-daemon has a newer tag. Then follow the checklist in [Keeping the engine in line with snapraid-daemon](architecture.md#keeping-the-engine-in-line-with-snapraid-daemon), above all: extend the interface when the daemon gained an API for something that is CLI-only today.

## CI and releases

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push and pull request to `master`; called by the release workflow | Backend: `deno check src/main.ts`, `deno test --allow-all`. Frontend: `npm ci`, `npx biome check`, `npm run typecheck`, `npm test`, `npm run build`. [End-to-end tests](#end-to-end-tests) twice, against the local build and against the Docker image; the built tools are cached, a failure uploads traces and server logs |
| `release.yml` | Push of a `v*` tag; manual run | Runs CI, then the shared Docker release workflow from `firsttris/workflows`. A tag `vX.Y.Z` publishes `tristanteu/snapraid-ui:X.Y.Z`, `:X.Y` and `:latest`, updates the Docker Hub description and creates the GitHub release. A manual run on `master` runs the same checks and pushes `:edge`, without a release |
| `bump.yml` | Manual run | Raises the version in `frontend/package.json` (patch, minor or major), commits it, tags the commit `vX.Y.Z` and starts `release.yml` on it (shared [`bump-version`](https://github.com/firsttris/workflows#bump-version)) |
| `upstream-release.yml` | Mondays 06:00 UTC; manual run | Two jobs, each opens an issue with a checklist. `snapraid` compares the pinned `SNAPRAID_VERSION` with SnapRAID's latest stable release. `snapraid-daemon` compares `backend/src/engine/REVIEWED_DAEMON_VERSION` with snapraid-daemon's newest tag, release candidates included |
| `docs.yml` | Push to `master` that changes `docs/`, `mkdocs.yml` or `requirements-docs.txt`; manual run | Builds `docs/` with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs build --strict`, broken links fail the build) and publishes it to GitHub Pages at https://firsttris.github.io/snapraid-ui/. Locally: `pip install -r requirements-docs.txt && mkdocs serve` |

The version lives in `frontend/package.json`, the tag is `v` + that version (the release checks
that they match), and the sidebar shows it bottom left. To release, run *Bump version* in the
Actions tab, or from `frontend/`:

```bash
npm run release minor    # patch (default), minor, major or x.y.z: raises package.json, commits, tags vX.Y.Z and pushes
```

## Screenshots

The pictures in the README and the documentation (`docs/screenshot*.png`, `docs/screenshots/`) come
from the demo sandbox: `e2e/screenshots/readme.spec.ts` with `e2e/playwright.screenshots.config.ts`
recreates the sandbox (`dev/setup.sh --reset`), builds the frontend, starts the backend in demo mode
behind the proxy of the end-to-end tests and takes them, in English at 1280 × 900 with a device scale
factor of 2. Run it as root with the disks at `/mnt`, or without `DISKS_DIR` with sandbox paths:

```bash
cd e2e
DISKS_DIR=/mnt npm run screenshots
```

After a change to the look, run **Update screenshots** (Actions → Run workflow,
`.github/workflows/screenshots.yml`) on the branch: it takes the pictures in the official Playwright
image and commits the ones that changed. `docs/screenshots/daemon.png` (two snapraid-daemon
instances) is still taken by hand.

## Social preview image

The image GitHub shows when the repository is shared (*Settings → General → Social preview*) is
`docs/social-preview.png`, 1280 × 640. It is rendered from `scripts/social-preview/social-preview.html`
with the dark dashboard screenshot; the screenshots above render it too. To render it alone, then
upload it in the settings:

```bash
sh scripts/social-preview/render.sh
```

## Contributing

Issues and pull requests are welcome at [github.com/firsttris/snapraid-ui](https://github.com/firsttris/snapraid-ui). Before opening a pull request, run what CI runs:

```bash
cd frontend && npx biome check && npm run typecheck && npm test
cd backend && deno check src/main.ts && deno test --allow-all
```

A few conventions that keep the code base consistent:

- Read SnapRAID's structured log, not its console text, when you need data from a run. Add a fixture from a real run for new parsers.
- New user-facing texts go into all three message files (use `add-messages.py`); backend errors use `msg()`.
- Types shared between backend and frontend belong in `shared/types.ts`.
- When you add or change an endpoint, update the [API reference](architecture.md#api-reference).
