# Development

This page gets you from a fresh clone to a running development setup, and covers the project layout, tests, linting, translations, UI components, building the image and the release process. For how the pieces fit together, see [Architecture](architecture.md).

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| [Bun](https://bun.com/) | the version in `packageManager` of the root `package.json` (1.4.4) | Everything JavaScript: runs the backend and its tests, installs the packages, runs Vite and Vitest and Playwright's test runner (`bun --bun playwright test`), compiles the standalone binary (CI and the image use the same version) |
| [fish](https://fishshell.com/) | | `scripts/start.sh` is a fish script |
| `curl`, `tar`, `gcc`, `make` | | Building SnapRAID for the demo sandbox (`scripts/dev/setup.sh`) |
| SnapRAID | 14.0 or newer | Only for running against a real array without `--demo`; it has to be on your `PATH` or set via `SNAPRAID_BIN` |
| Docker or Podman | | Only for building the image |

## Getting started

```bash
git clone https://github.com/firsttris/snapraid-ui
cd snapraid-ui
bun install           # all packages of the workspace, from the one bun.lock
bun run demo          # scripts/start.sh --demo: sandbox with fake disks, no real array needed
```

Open **http://localhost:3000**. The frontend dev server runs on port 3000, the backend API and WebSocket on port 8080. `Ctrl+C` stops both.

`scripts/start.sh` (`bun run dev`, `bun run demo`) has two modes:

| Command | Data directory | SnapRAID binary | Extra |
|---|---|---|---|
| `bun run dev` (`scripts/start.sh`) | `./snapraid/` (created on first start, ignored by git) | `snapraid` from your `PATH` | Works against your real configs |
| `bun run demo` (`scripts/start.sh --demo`) | `scripts/dev/sandbox/` | `scripts/dev/bin/snapraid` | Sets `SNAPRAID_EXTRA_ARGS=--test-skip-device` and `SNAPRAID_DEMO=1` |

Under the hood it starts `bun run dev` in `apps/server/` (`bun --watch`, so the backend restarts on changes) and `bun run dev` in `apps/web/` (Vite with hot reload). You can run these two commands yourself in separate terminals; set `SNAPRAID_BASE_PATH` and friends first (see [Configuration](configuration.md)), otherwise the backend uses `snapraid/` in the repository's root (`../../snapraid` relative to `apps/server/`).

> [!NOTE]
> In development the frontend calls the backend directly at `http://localhost:8080` (`apps/web/src/lib/api/constants.ts`), and the backend only accepts credentials from the same hostname. Open the dev frontend as `http://localhost:3000`, not via a LAN IP.

To run the production build as the image does, build the frontend (`bun run build` in `apps/web/`) and start the backend with `bun run start` in `apps/server/`: it finds `apps/web/.output/` and serves the UI, the API and the WebSocket together on port 8080. Without a build it serves only the API.

<details>
<summary>Stopping leftover processes</summary>

```bash
pgrep -af "src/main.ts"                                   # show running backends
pkill -f "bun.*src/main.ts"
pkill -f "vite dev"
```

</details>

## Demo sandbox

`scripts/dev/setup.sh` (run automatically by `bun run demo`, a no-op once everything exists) prepares a self-contained SnapRAID environment:

- builds SnapRAID (`SNAPRAID_VERSION`, default 15.1) from the official release tarball into `scripts/dev/bin/snapraid`, cached in `scripts/dev/.cache/`;
- installs the packages (`bun install --frozen-lockfile` in the root) if `apps/server/node_modules/` is missing;
- creates `scripts/dev/sandbox/` with the array "Media Array": four data "disks" (`disks/disk1`–`disk4`) and a parity disk (`disks/parity1`) filled with random files, a `snapraid.conf` and `config.json`;
- puts copies of a few files on other disks, for the duplicates page;
- runs sync, scrub, touch and sync again with their logs, then adds, changes, moves and deletes files and runs `diff` and `status`, so that every page has something to show;
- gives the sandbox a past with `apps/server/scripts/seed-demo.ts` (run with Bun in `apps/server/`, whose packages it uses): the job logs move back in time (last sync 10 hours ago, scrub yesterday), `usage-history.json` gets two months of disk usage with one disk filling up, `schedules.json` a nightly sync with touch and scrub, a weekly scrub and a SMART check, and `maintenance.json` Docker pause and spindown.

All sandbox disks are directories on one filesystem, which SnapRAID only accepts with `--test-skip-device`. They hold a few KiB and have no SMART data, power state or Docker next to them, so `SNAPRAID_DEMO=1` makes the backend answer like a real home server (`apps/server/src/demo.ts`):

- `smart` and `probe`: generated results in the real structured log format: a healthy HDD, an SSD, an HDD with growing reallocated sectors, a sleeping 16 TB disk and an 18 TB parity disk;
- `status`: the real log of the sandbox, with the sizes, file counts and fragmentation of those disks and a scrub that keeps up (64 % verified, the oldest block 17 days old) instead of the sandbox's figures;
- disk usage (`df`) and the parity file's size: the same disks instead of the host's filesystem;
- Docker: three containers (immich, jellyfin, nextcloud) that can be paused and resumed.

```bash
scripts/dev/setup.sh --reset                         # recreate the sandbox from scratch
DISKS_DIR=/mnt scripts/dev/setup.sh --reset          # the disks at /mnt/disk1 … /mnt/parity1, as the screenshots show them
SNAPRAID_VERSION=15.1 scripts/dev/setup.sh --reset  # build another SnapRAID release
```

`scripts/dev/bin/`, `scripts/dev/.cache/` and `scripts/dev/sandbox/` are ignored by git.

## Project structure

```text
package.json           the Bun workspace (apps/*, packages/*, e2e) and packageManager; dev, demo
bun.lock               the one lockfile of all packages
bunfig.toml            linker = "isolated": each package sees only its own dependencies
tsconfig.base.json     compiler options every package shares
apps/server/           the backend
  package.json         scripts and packages (Hono, Croner, Nodemailer, …)
  tsconfig.json        compiler options, @shared/* paths (Bun resolves them at runtime too)
  scripts/             seed-demo.ts, the demo sandbox's history (scripts/dev/setup.sh)
  src/
    main.ts            app setup, middleware, startup
    bin.ts             entry point of the standalone binary; bin-cli.ts: --version, --help
    app-files.ts       where the frontend, its package.json and docs/ are (repository, image, binary)
    fs.ts, command.ts  file and process helpers (node:fs, Bun.spawn)
    frontend.ts        loads the built frontend, which the backend serves
    routes/            HTTP routes per area
    executors/         job runner (spawn, stream, progress, abort)
    parsers/           structured log parsers, tests and real SnapRAID fixtures
    __tests__/         backend unit tests
    *.ts               auth, scheduler, notifications, log manager, histories, wizards, backup, demo
apps/web/              the frontend
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
packages/shared/       @snapraid-ui/shared: types and logic used by backend and frontend (src/)
docker/                Dockerfile, Compose file, Quadlet units
scripts/build-binary.sh  the standalone binary (bun build --compile)
scripts/install.sh     installer of the binary with a systemd service, attached to each release
scripts/start.sh       local start (bun run dev, bun run demo)
scripts/dev/setup.sh   demo sandbox
scripts/social-preview/  the social preview image
e2e/                   end-to-end tests (Playwright) against real SnapRAID and snapraid-daemon
```

Both apps depend on the workspace package `@snapraid-ui/shared` and import it as `@shared/…`: the `paths` in their `tsconfig.json` (`apps/server/tsconfig.json`, `apps/web/tsconfig.json`) map `@shared/*` to `node_modules/@snapraid-ui/shared/src/*`, the package `bun install` links there. Keep code in `packages/shared/` free of Bun-, Node- or browser-specific APIs.

## Scripts

Frontend (`apps/web/package.json`, run with `bun run <script>` in `apps/web/`; Vite and Vitest run on Bun's runtime, `bun --bun`):

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

Backend (`apps/server/package.json`, run with `bun run <script>` in `apps/server/`):

| Script | What it does |
|---|---|
| `dev` | Run `src/main.ts` with `bun --watch` |
| `start` | Run `src/main.ts`, as the image does |
| `typecheck` | `tsc --noEmit` over `src/`, `scripts/` and `packages/shared/src/` |
| `test` | `bun test` |

Bun has no permission flags: the backend has the rights of the user that runs it, in the container as on the host.

## Tests

```bash
cd apps/server && bun test             # as in CI
cd apps/web && bun run test

# Also run the engine contract against the SnapRAID CLI, with the binary from scripts/dev/setup.sh
cd apps/server && SNAPRAID_BIN=../../scripts/dev/bin/snapraid SNAPRAID_EXTRA_ARGS=--test-skip-device bun test
```

To run the engine contract against snapraid-daemon too, build it (`./autogen.sh && ./configure && make` in a checkout of [snapraid-daemon](https://github.com/amadvance/snapraid-daemon), and SnapRAID 15 the same way) and start it in the foreground for a throwaway array:

```bash
snapraidd -f -c snapraidd.conf -C snapraid.conf -p snapraidd.pid
cd apps/server && SNAPRAID_TEST_DAEMON_URL=http://127.0.0.1:7627 SNAPRAID_TEST_DAEMON_CONF=/path/to/snapraid.conf bun test
```

The test adds files to the array's first data disk. In `snapraidd.conf` set `net_port = 127.0.0.1:7627` and leave `maintenance_schedule` empty. The daemon only runs a real binary as `sys_engine`, no script; for disks that share one filesystem, point it at a small compiled wrapper that adds `--test-skip-device`.

- **Backend** tests use `bun:test` (`test`, `expect`; `assertThrows`/`assertRejects` from `__tests__/assert-error.ts` where a test needs the error). Parser tests in `apps/server/src/parsers/__tests__/` run against real SnapRAID logs in `fixtures/`; when SnapRAID's log format changes, add or update a fixture from a real run. The [engine contract](architecture.md#snapraid-engine) runs against the fake engine always and against the CLI engine when `SNAPRAID_BIN` and `--test-skip-device` are set (otherwise it shows as *skipped*); the scheduler is tested against the fake engine. Other tests cover auth, backup/restore, config paths, the disk wizards, `--force-*` detection, the log manager, notifications, the SMART baseline and history, and the usage history.
- **Frontend** tests use Vitest and live in `apps/web/src/lib/__tests__/`: log parsing, progress, the job tracker, the changes, duplicates and protected files pages' logic and the i18n checks described [below](#translations). Run them from `apps/web/`, they read `messages/` and `../server/src` by relative path.

### End-to-end tests

`e2e/` drives the whole application through a browser (Playwright, Chromium) against real SnapRAID and snapraid-daemon on throwaway arrays, so a change to the backend, the frontend or the Docker image is checked the way a user would notice it:

| Test | What happens |
|---|---|
| `array.spec.ts` | Dashboard health and disks; sync with its preview (new and deleted files); bit rot in a file, found by a full scrub, repaired and verified by *Repair and verify*, byte for byte; *Changes* in the sidebar restoring all deleted files (`fix -m`); Scrub and Sync as buttons, only the maintenance commands in the menu, *Details* opening the *Integrity* page; spinning disks up and down |
| `schedules.spec.ts` | The nightly routine (touch, sync, scrub) created in the form and started with *Run now*; a scheduled sync skipped while a disk is empty (not mounted), the dashboard shows *Disk not available*; a sync skipped for mass changes, as ransomware leaves them; *Skip next run* and taking it back |
| `setup.spec.ts` | The setup wizard after a first start: disks picked, the configuration written and synced, the placeholder entry replaced; a setup without parity or with a too small parity disk refused |
| `changes.spec.ts` | *Changes*: a deleted file and an encrypted one restored byte for byte, the old `/recovery` address leading there; a file of the same path on another disk left alone; restored files and a recreated folder get the owner and permissions of their folder, not `root` and `600`; new files with their folder totals and a moved file listed, *Start sync* opening the sync preview; *diff* in the command palette leading to the page |
| `files.spec.ts` | *Duplicates*: the copy chosen by path or by hand stays, the others are deleted, a copy changed since the sync is left alone with its reason, deleted copies drop out of the list and show up as deleted; *Protected files*: search with the disks of the matches (a file added after the sync is not found), opening a folder |
| `smart.spec.ts` | SMART self-tests on the SMART page: a short test followed to *Passed* in the disk's log, a long one stopped; `smartctl` is a stand-in (`harness/bin/smartctl`), there are no disks to test |
| `replace.spec.ts` | A failed data disk replaced in the wizard: its files come back from parity onto an empty disk, owned like the same folders on the other disk |
| `home-assistant.spec.ts` | Home Assistant set up in the UI against an MQTT broker in the test: discovery and state arrive, the Scrub and Sync buttons run their jobs |
| `monitoring.spec.ts` | The heartbeat pinged by *Send ping* and after a successful scheduled run; Prometheus metrics switched on, refused without the token, describing the array with it |
| `mcp.spec.ts` | The MCP endpoint switched on in the UI and refused without the token, read only until *Allow actions* is ticked; an agent's calls answered from the array and the shipped documentation, a sync it starts |
| `notifications.spec.ts` | Webhook set up in the UI: the test message and the *job failed* message of a sync without its parity disk reach a local receiver |
| `config.spec.ts` | A data disk added on the configuration page (next free name suggested) is in `snapraid.conf` and protected by the next sync; *Manage arrays*: rename from the row menu, *Edit* opens the array's page, an option under *Advanced* saved on leaving the field, *Set up a new array* starts the wizard at the disks |
| `docker.spec.ts` | A container picked under Automation is paused during the sync and resumed after it (`docker events`); skipped without a Docker daemon |
| `daemon.spec.ts` | Daemon mode switched on in the UI: *Test connection*, then a sync runs as a task of snapraid-daemon |
| `login.spec.ts` | A second backend with the login on, at `http://localhost`: the password changed in *Sign-in* (a wrong current one refused, the old one no longer signs in), a passkey added with Chromium's virtual authenticator, used on the login page, renamed and deleted; on `127.0.0.1` *Sign-in* says why passkeys are off; skipped against the image |

```bash
cd e2e
bun install                             # the whole workspace, from the root's bun.lock
bun --bun playwright install chromium   # once
bun run setup                           # builds the tools into e2e/.tools, needs autoconf, automake, zlib1g-dev
bun run test                            # builds the frontend, starts everything, runs the tests (about 2 min);
                                        # the backend runs with the packages of apps/server/
bun run test:image                      # the same tests against the Docker image built from docker/Dockerfile
E2E_BINARY=../dist/snapraid-ui-linux-x86_64 bun run test   # against the standalone binary, see below
```

`bun run setup` builds SnapRAID 15.1 (the version of the image) from the release tarball for the jobs SnapRAID UI runs itself, and SnapRAID from git (`SNAPRAID15_REF`) with snapraid-daemon at the version in `apps/server/src/engine/REVIEWED_DAEMON_VERSION`. The test disks are directories on one filesystem, so SnapRAID runs with `--test-skip-device`: the backend gets it through `SNAPRAID_EXTRA_ARGS`, the daemon through a small compiled wrapper as `sys_engine`.

The global setup (`e2e/harness/global-setup.ts`) recreates `e2e/.run/` on every run: the backend's data directory, the arrays and a log per server. It starts snapraid-daemon on its own array, the backend (with `PORT`, `SNAPRAID_BASE_PATH` and `SNAPRAID_BIN` pointing into `e2e/`), which serves the production build of the frontend as in the image. Each test creates its own array, adds it through the API and opens it; the `app` fixture removes it, and the schedules, afterwards. Tests run one after the other, the backend runs one job at a time.

With `E2E_IMAGE=<image>` the container takes the place of the backend: started as in `docker/docker-compose.yml`, with the data directory in `/app/snapraid`, the arrays at the same paths as on the host and the Docker socket mounted. It shares the host's network (the UI on port 80), so the backend reaches snapraid-daemon and the webhook receiver on `127.0.0.1`. With `E2E_BINARY=<path>` the standalone binary takes the place of the backend's sources, with the same environment; it carries its own frontend, so nothing is built. `E2E_SKIP_BUILD=1` skips the frontend build of a local run. A failed test leaves a trace (`bun --bun playwright show-trace e2e/test-results/…/trace.zip`) and the server logs in `e2e/.run/*.log`; CI uploads both.

## Linting and type checking

| | Command | Where |
|---|---|---|
| Frontend lint + format | `bunx biome check` (add `--write` to fix) | `apps/web/` |
| Frontend types | `bun run typecheck` | `apps/web/` |
| Backend types | `bun run typecheck` | `apps/server/` |

Biome (`apps/web/biome.json`) uses the recommended rules, 2-space indentation, single quotes, double quotes in JSX, no semicolons, and organizes imports. It covers `apps/web/src/` except the generated `routeTree.gen.ts`, `src/paraglide/` and `styles.css`. The backend has no linter configured; it follows the style of the existing code (double quotes, semicolons).

`bun run typecheck` compiles the Paraglide messages first, because components import them from the generated `src/paraglide/`.

## Translations

The UI is available in English, German and Italian. All texts are in `apps/web/messages/{en,de,it}.json` in the inlang message format (`@inlang/plugin-message-format`); `en` is the base locale (`apps/web/project.inlang/settings.json`). Placeholders are written as `{name}`.

- **Frontend:** import the messages as `import * as m from '../paraglide/messages'` (relative path) and call `m.key({ … })`.
- **Backend:** for errors a user can see, return `msg("server_error_…", { … })` from `@shared/i18n.ts` (`packages/shared/src/i18n.ts`) instead of text. The frontend renders the key in the UI language with `localizeServer()`. Notification texts are not in the message files; they are in `apps/server/src/notification-events.ts` and `apps/server/src/routes/notifications.ts`, one block per language.

To add, change or remove a key in all three files at once, use the helper script from `apps/web/`:

```bash
python3 scripts/add-messages.py '{"dashboard_new_hint": {"en": "Hello {name}", "de": "Hallo {name}", "it": "Ciao {name}"}}'
python3 scripts/add-messages.py --remove dashboard_new_hint old_key
```

Every key needs all three languages, otherwise the script exits with an error. Existing keys are overwritten. The script takes a file lock, so several editors (or agents) can run it in parallel.

`apps/web/src/lib/__tests__/i18n.test.ts` fails when:

- a language is missing a key, has an empty text, or uses different placeholders than English;
- a key is not used anywhere in the frontend or backend code;
- the code uses a key (`m.key(` or `msg("key"`) that does not exist.

Adding a language touches more than a JSON file: the `locales` in `project.inlang/settings.json`, the locale list in `scripts/add-messages.py` and in `i18n.test.ts`, the `language` type of `NotificationSettings` in `packages/shared/src/types.ts`, and the notification texts in the backend.

## UI components

The UI is built with [shadcn/ui](https://ui.shadcn.com/) on top of Radix UI and Tailwind CSS v4, with icons from [lucide](https://lucide.dev/). `apps/web/components.json` configures the *new-york* style, base color *zinc*, CSS variables in `src/styles.css`, and the aliases `@/components/ui`, `@/lib/utils` and `@/hooks`.

The primitives in `apps/web/src/components/ui/` are owned by the project and can be edited. To add another one, run the shadcn CLI in `apps/web/`, for example:

```bash
bunx shadcn@latest add popover
```

Colors come from the CSS variables in `src/styles.css`, which define the light and dark theme. Use these tokens (`bg-background`, `text-muted-foreground`, …) instead of fixed colors so both themes keep working. Charts use Chart.js through `react-chartjs-2`; the command palette uses `cmdk`; toasts use `sonner`.

## Building the image

From the repository root:

```bash
docker build -f docker/Dockerfile -t snapraid-ui .
# pin another SnapRAID release
docker build -f docker/Dockerfile --build-arg SNAPRAID_VERSION=15.1 -t snapraid-ui .
# or build and start with Compose
docker compose -f docker/docker-compose.yml up --build
```

The build context is the whole repository; `.dockerignore` leaves out `node_modules`, test files, the local `snapraid/` data, `scripts/dev/` and `e2e/` (but for `e2e/package.json`, which the workspace's lockfile needs). See [Architecture](architecture.md#container-layout) for the stages and [Installation](installation.md) for running the image.

## Building the binary

`scripts/build-binary.sh` builds SnapRAID UI as one executable with [`bun build --compile`](https://bun.com/docs/bundler/executables): the backend, the built frontend, `apps/web/package.json` (for the version) and the documentation pages (for the MCP endpoint) inside, nothing else to install but SnapRAID itself. It needs Bun and the workspace's packages (`bun install` in the root); Bun downloads the runtime of another architecture on the first cross-compile:

```bash
scripts/build-binary.sh                              # the host's architecture: dist/snapraid-ui-linux-x86_64
scripts/build-binary.sh bun-linux-x64 bun-linux-arm64   # both, cross-compiled
SKIP_FRONTEND_BUILD=1 scripts/build-binary.sh        # with apps/web/.output as it is

dist/snapraid-ui-linux-x86_64 --version
PORT=8080 SNAPRAID_BASE_PATH=$PWD/snapraid dist/snapraid-ui-linux-x86_64
```

The binary reads the same environment variables as the image ([Configuration](configuration.md)); without `SNAPRAID_BASE_PATH` the data directory is `./snapraid` in the working directory. See [Architecture](architecture.md#standalone-binary) for how the parts find each other inside it.

### Dependency updates

[Renovate](https://github.com/apps/renovate) (`.github/renovate.json5`) opens a pull request for each new release of what SnapRAID UI builds on and lists what is open in the "Dependency Dashboard" issue. None of these merges itself:

| Pull request | What it moves |
|---|---|
| SnapRAID | the pinned SnapRAID release, see [Updating SnapRAID](#updating-snapraid) |
| Bun | the Bun of everything: `packageManager` in the root `package.json` (which the workflows read with `bun-version-file`) and the image's `oven/bun` stages, the final one included |

Everything else (the other packages, the actions, the images) comes with the shared settings of [firsttris/workflows](https://github.com/firsttris/workflows#renovate-in-every-project): minor and patch updates on the 1st of the month in one pull request that Renovate merges itself when CI is green, majors only when ticked in the Dependency Dashboard, security fixes at once.

### Updating SnapRAID

The image pins one SnapRAID release that the parsers are tested against. [Renovate](#dependency-updates) opens a pull request when a newer stable release is out; it changes the version everywhere it is named (`docker/Dockerfile`, `scripts/dev/setup.sh`, `e2e/scripts/setup-tools.sh` with `SNAPRAID15_REF`, `scripts/install.sh`, the version check in `ci.yml` and these docs), and its end-to-end tests build and run the new release. Before merging:

1. Read SnapRAID's `HISTORY` for changes to the structured log (`--log`).
2. Run `SNAPRAID_VERSION=<new> scripts/dev/setup.sh --reset`, start `bun run demo` and run status, diff, sync, scrub, check, list, dup, touch and smart in the UI.
3. For a major version, compare the log tags with the fixtures in `apps/server/src/parsers/__tests__/fixtures/`.

### Watching snapraid-daemon

Jobs, status, diff, SMART and the power state go through the [SnapRAID engine](architecture.md#snapraid-engine), so they could also run on snapraid-daemon's REST API one day. Its API was last compared with the version in `apps/server/src/engine/REVIEWED_DAEMON_VERSION`. A weekly workflow (`upstream-release.yml`) opens an issue when snapraid-daemon has a newer tag. Then follow the checklist in [Keeping the engine in line with snapraid-daemon](architecture.md#keeping-the-engine-in-line-with-snapraid-daemon), above all: extend the interface when the daemon gained an API for something that is CLI-only today.

## CI and releases

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push and pull request to `master`; called by the release workflow | Backend: `bun install --frozen-lockfile` (the workspace, in the root), `bun run typecheck`, `bun test`. Frontend: `bun install --frozen-lockfile`, `bunx biome check`, `bun run typecheck`, `bun run test`, `bun run build`. [End-to-end tests](#end-to-end-tests) three times: against the local build, against the Docker image (built with the release's registry cache) and against the standalone binary (built for x86_64 and arm64, the tests run the x86_64 one), each split into two shards that run side by side; the built tools and apt packages are cached, a failure uploads traces and server logs. Installer: `shellcheck`, then `scripts/install.sh` on a runner with systemd against the binary built there (SnapRAID built from source, login, update, uninstall) |
| `release.yml` | Push of a `v*` tag; manual run | Runs CI unless `master`'s CI already passed for the same code (a *Bump version* commit only changes the version), then the shared Docker release workflow from `firsttris/workflows`. A tag `vX.Y.Z` publishes `tristanteu/snapraid-ui:X.Y.Z`, `:X.Y` and `:latest`, updates the Docker Hub description and creates the GitHub release, then the standalone binaries for x86_64 and arm64 are built and attached to it with their `SHA256SUMS` and `scripts/install.sh` as `install.sh`. A manual run on `master` runs the same checks and pushes `:edge`, without a release |
| `bump.yml` | Manual run | Raises the version in `apps/web/package.json` (patch, minor or major), commits it, tags the commit `vX.Y.Z` and starts `release.yml` on it (shared [`bump-version`](https://github.com/firsttris/workflows#bump-version)) |
| `upstream-release.yml` | Mondays 06:00 UTC; manual run | Opens an issue with a checklist when snapraid-daemon has a tag newer than `apps/server/src/engine/REVIEWED_DAEMON_VERSION`, release candidates included |
| `docs.yml` | Push to `master` that changes `docs/`, `mkdocs.yml` or `requirements-docs.txt`; manual run | Builds `docs/` with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs build --strict`, broken links fail the build) and publishes it to GitHub Pages at https://firsttris.github.io/snapraid-ui/. Locally: `pip install -r requirements-docs.txt && mkdocs serve` |

The version lives in `apps/web/package.json`, the tag is `v` + that version (the release checks
that they match), and the sidebar shows it bottom left. To release, run *Bump version* in the
Actions tab, or from `apps/web/`:

```bash
bun run release minor    # patch (default), minor, major or x.y.z: raises package.json, commits, tags vX.Y.Z and pushes
```

## Screenshots

The pictures in the README and the documentation (`docs/screenshot*.png`, `docs/screenshots/`) come
from the demo sandbox: `e2e/screenshots/readme.spec.ts` with `e2e/playwright.screenshots.config.ts`
recreates the sandbox (`scripts/dev/setup.sh --reset`), builds the frontend, starts the backend in demo mode
behind the proxy of the end-to-end tests and takes them, in English at 1280 × 900 with a device scale
factor of 2. Run it as root with the disks at `/mnt`, or without `DISKS_DIR` with sandbox paths:

```bash
cd e2e
DISKS_DIR=/mnt bun run screenshots
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
cd apps/web && bunx biome check && bun run typecheck && bun run test
cd apps/server && bun run typecheck && bun test
```

A few conventions that keep the code base consistent:

- Read SnapRAID's structured log, not its console text, when you need data from a run. Add a fixture from a real run for new parsers.
- New user-facing texts go into all three message files (use `add-messages.py`); backend errors use `msg()`.
- Types shared between backend and frontend belong in `packages/shared/src/types.ts`.
- When you add or change an endpoint, update the [API reference](architecture.md#api-reference).
