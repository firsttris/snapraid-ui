# Configuration

Almost everything in SnapRAID UI is set up in the interface. This page covers the few settings made outside it: environment variables, the data directory and its files, log retention, and how SnapRAID config files are managed.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SNAPRAID_UI_USERNAME` | *(unset)* | Username for the login. The login is enabled only when both username and password are set. |
| `SNAPRAID_UI_PASSWORD` | *(unset)* | Password for the login. Changing it ends all existing sessions. |
| `SNAPRAID_UI_SESSION_HOURS` | `168` (7 days) | How long a login lasts, in hours. Invalid or non-positive values fall back to 168. |
| `SNAPRAID_BIN` | `/usr/local/bin/snapraid` in the image, `snapraid` otherwise | The SnapRAID binary to run. See [Using your own SnapRAID binary](installation.md#using-your-own-snapraid-binary). |
| `SNAPRAID_BASE_PATH` | `/app/snapraid` in the image | The [data directory](#data-directory). Keep the default in the container and mount a volume there instead. |
| `SNAPRAID_EXTRA_ARGS` | *(empty)* | Extra arguments put in front of every SnapRAID call, separated by spaces. Meant for testing, for example `--test-skip-device` in the development sandbox. Leave it empty on a real array. |
| `TZ` | `UTC` | Time zone of the container, e.g. `Europe/Berlin`. Schedules run in this time zone, see below. |

The login is described in [Security](security.md).

> [!TIP]
> Schedules use the time zone of the backend, which is UTC in the container unless you set `TZ`. Set `TZ` to your local zone so that a schedule for 03:00 runs at 03:00 your time. No extra packages are needed, the backend's runtime brings its own time zone data:
>
> ```yaml
>     environment:
>       - TZ=Europe/Berlin
> ```

`SNAPRAID_DEMO=1` exists for the development sandbox only; it replaces SMART data with made-up values. Don't set it on a real system. See [Development](development.md).

The container's ports are fixed: Nginx listens on port 80 inside the container. Change the port on the host side of the mapping instead, e.g. `-p 8090:80`.

## Data directory

All state lives in one directory, `/app/snapraid` in the container. Mount it as a volume so it survives updates. When you run the backend outside Docker without `SNAPRAID_BASE_PATH`, it is `../snapraid` relative to the backend's working directory, which is `snapraid/` in the repository root.

| Path | Contents |
|---|---|
| `config.json` | The list of SnapRAID configurations and the log settings. Created with defaults on first start. |
| `*.conf` | SnapRAID config files created in the UI, or copied here by you. |
| `schedules.json` | Scheduled jobs, see [Scheduling](scheduling.md). |
| `notifications.json` | Notification settings, including the SMTP password and ntfy token in plain text. See [Notifications](notifications.md). |
| `notifications-state.json` | The last reported SMART problem per disk, so the same problem isn't reported twice. |
| `maintenance.json` | Docker pause and spindown settings, see [Automation](automation.md). |
| `engine.json` | Whether jobs run on the SnapRAID CLI or on snapraid-daemon, with the daemons' addresses and passwords (file mode `600`). See [Automation](automation.md#snapraid-daemon-experimental). |
| `paused-containers.json` | Containers paused for the running job, so they are resumed after a restart. Only exists while a job runs. |
| `smart-history.json` | Daily SMART values per disk (temperature, sector counts, CRC errors, wear), up to 365 days. |
| `smart-baseline.json` | The last known CRC error count per disk, to tell new transfer errors from old ones. See [SMART](smart.md). |
| `usage-history.json` | Daily used and free space per configuration and disk, up to 730 days. |
| `replacements.json` | Progress of a running disk replacement, see [Managing disks](disks.md). |
| `.session-secret` | Random key that signs login sessions, created on first start with the login enabled (file mode `600`). |
| `logs/` | One log file per SnapRAID run, see [Log retention](#log-retention). |

Files that don't exist yet are created when they are first needed. The container runs as root, so the files on the host belong to root.

> [!TIP]
> To move SnapRAID UI to another machine, copy the whole data directory, or use *Download backup* and *Restore backup* in the interface. The backup contains `config.json`, `schedules.json`, `notifications.json`, `maintenance.json`, `engine.json`, the SMART and usage histories and the SnapRAID configs inside the data directory. It doesn't contain logs, `replacements.json` or the session secret. See [Managing disks](disks.md).

Content files you put in the data directory (e.g. `content /app/snapraid/snapraid.content`) are also stored here. Keep that in mind when you clean up or move the directory.

## config.json

`config.json` looks like this after the first start:

```json
{
  "version": "1.0.0",
  "snapraidConfigs": [
    {
      "name": "Default",
      "path": "snapraid.conf",
      "enabled": true
    }
  ],
  "logs": {
    "maxHistoryEntries": 50,
    "directory": "logs",
    "maxFiles": 100,
    "maxAge": 30
  }
}
```

| Key | Meaning |
|---|---|
| `snapraidConfigs[].name` | Display name in the config selection. |
| `snapraidConfigs[].path` | Path of the SnapRAID config file: absolute, or relative to the data directory. |
| `snapraidConfigs[].enabled` | Whether the config appears in the config selection. |
| `logs.directory` | Log directory, relative to the data directory or absolute. |
| `logs.maxFiles` | How many log files to keep. `0` means no limit. |
| `logs.maxAge` | How many days to keep log files. `0` means no limit. |

You normally change the configuration list in the interface. If you edit `config.json` by hand, restart the container afterwards for the `logs` settings to take effect; the list of configurations is read fresh on every request.

## Log retention

Every SnapRAID run writes a log file named `<command>-YYYYMMDD-HHMMSS.log` (time in UTC) to `logs/`. Old logs are deleted:

- when the backend starts, and
- when you click *Clean Old* on the *Logs* page.

A log is deleted when it is older than `maxAge` days, or when it is not among the newest `maxFiles` logs. The defaults keep up to 100 logs and nothing older than 30 days. The current retention is shown at the top of the *Logs* page. There is no setting for this in the interface; change `logs.maxFiles` and `logs.maxAge` in `config.json` and restart the container.

More about reading logs in [Logs](logs.md).

## SnapRAID config files

SnapRAID UI works with ordinary `snapraid.conf` files. It keeps a list of them in `config.json` and reads and writes the files directly, so the SnapRAID command line can use the same files.

In *Manage Configurations*:

- **Add existing file** adds a config file by its path. Enter an absolute path, or a path relative to the data directory. The file must exist and be reachable inside the container.
- **Create new config** creates `<file name>.conf` in the data directory from a template with a few common `exclude` rules. You then add parity, content and data disks in the visual editor.
- **Rename** and the on/off switch change only the entry in `config.json`. A disabled config is hidden from the config selection.
- **Remove** takes the config off the list. The file itself is kept.

Several configurations can be managed side by side, for example one per array. Each has its own schedules, logs, status and history.

Editing a config file:

- In the interface, use the visual editor or the text view. Changes in the visual editor are written to the file immediately. See [Managing disks](disks.md).
- You can also edit the file on the host with any text editor. The UI reads the file each time it needs it, so changes show up after a page reload.

SnapRAID UI doesn't keep previous versions of your config files. Make a copy or a *Download backup* before larger changes.
