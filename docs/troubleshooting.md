# Troubleshooting

Common problems and how to fix them. If your problem is not listed, check the container log (`docker logs snapraid-ui`) and the [log history](logs.md) of the failed run first; SnapRAID's own messages usually name the cause.

- [Setup and paths](#setup-and-paths)
- [Status, reports and SnapRAID version](#status-reports-and-snapraid-version)
- [Jobs and locking](#jobs-and-locking)
- [Safety stops](#safety-stops)
- [Scheduled jobs were skipped](#scheduled-jobs-were-skipped)
- [SMART and disk power state](#smart-and-disk-power-state)
- [Recover files](#recover-files)
- [Config editor and disk wizards](#config-editor-and-disk-wizards)
- [Login](#login)
- [Other](#other)
- [Getting help](#getting-help)

## Setup and paths

### The configuration shows "File not found"

The UI looks for the file **inside the container**. On the first start it creates an entry *Default* that points to `snapraid.conf` in the data folder (`/app/snapraid` in the Docker image, i.e. the folder you mounted there).

- Copy your `snapraid.conf` into that folder, **or**
- mount the file into the container (e.g. `-v /etc/snapraid.conf:/etc/snapraid.conf`) and add it in *Manage arrays* with **Add existing file**. You can remove the *Default* entry afterwards.

See [Configurations and disks](disks.md#managing-arrays).

### Validation fails or a sync complains about missing disks

The paths in `snapraid.conf` must exist inside the container. Mount every data, parity and content location **at the same path as on the host**:

```bash
-v /mnt/disk1:/mnt/disk1 \
-v /mnt/parity:/mnt/parity \
```

Parity and content locations must be writable. Check what the container sees with:

```bash
docker exec snapraid-ui ls /mnt/disk1
```

If a disk is mounted on the host only after the container started, the container may still see the empty mount point. Restart the container after mounting disks.

### "Config file not found: …" when adding a file

The path does not exist in the container, or is not a regular file. Relative paths are resolved against the data folder, absolute paths are taken as they are. Use **Browse...** to see what the container sees.

## Status, reports and SnapRAID version

### The dashboard, reports or notifications stay empty

The UI reads SnapRAID's structured log, which exists only since **SnapRAID 14.0**. If you set `SNAPRAID_BIN` to your own binary, check its version:

```bash
docker exec snapraid-ui sh -c '"${SNAPRAID_BIN:-snapraid}" --version'
```

If it is older than 14.0, remove `SNAPRAID_BIN` and the binary mount to use the bundled SnapRAID. Distribution packages are usually too old (Debian 13: 12.4, Ubuntu 24.04 LTS: 12.3). See [Installation](installation.md).

### Logs or history from before the UI are missing

The UI only knows runs it started itself. Runs from host cron jobs or the command line do not appear in the [log history](logs.md).

## Jobs and locking

### "Another job is already running" / "SnapRAID is busy with another job"

The UI runs one SnapRAID job at a time. Wait until the running job has finished (the header shows it), or abort it from the dashboard.

### "SnapRAID is already in use"

Another SnapRAID process holds the lock on the array, but it was not started by the UI. Usually this is a cron job or a manual run on the host. Wait for it to finish, then move the cron jobs to the UI's [scheduler](scheduling.md), so that only one SnapRAID version and one scheduler maintain the array.

### "No check has run for this configuration yet"

The check report reads the log of the last `check`. Run a check first.

## Safety stops

SnapRAID refuses to run when it looks like data loss. The dashboard explains the reason and offers a confirmed run with the matching switch:

| Shown as | Typical cause | What to do |
|---|---|---|
| *Stopped for safety: files suddenly have zero size* | A crash truncated files to 0 bytes | Check the files named in the output, restore damaged ones with fix. Only continue with `--force-zero` if the files are empty on purpose. |
| *Stopped for safety: all files of a disk are missing* | The disk is not mounted, or mounted at another path | Check the mount (on the host **and** in the container). Only continue with `--force-empty` if the disk is empty on purpose. |
| *Stopped for safety: several disks have a new UUID* | Disks were replaced, or mount points got mixed up | Check that every disk is mounted at its path. Only continue with `--force-uuid` if you really replaced the disks. |

> [!WARNING]
> A forced run skips SnapRAID's safety check. A sync with a missing disk drops that disk's files from parity. If in doubt, open **Changes** first and look at the deleted files.

See [Usage](usage.md) for how commands and the force option work.

## Scheduled jobs were skipped

The schedule list shows the reason of a skipped run, and you can get a notification for it (event *A scheduled job was skipped*, see [Notifications](notifications.md)).

| Reason | Meaning |
|---|---|
| *Another job was running.* | A job was still running when the schedule was due. The run is skipped, not queued. Spread your schedules apart. |
| *A disk is being replaced, scheduled jobs are paused.* | A [disk replacement](disks.md#replacing-a-failed-disk) of this configuration is in progress. Finish it, or click **Stop replacing** in the wizard. |
| *N deleted files, more than allowed.* | The [sync guard](scheduling.md#sync-guard) found more deleted files than the limit. Check on **Changes** whether a disk is missing, then start the sync manually. |
| *Diff before sync failed: …* | The diff that the sync guard runs before the sync failed, often for the same reasons a sync would (missing disk, lock held by another process). |

## SMART and disk power state

### No SMART data, temperatures or power state

SnapRAID calls `smartctl` on the device behind each mount. The device nodes only exist in the container with **`--privileged`** (`privileged: true` in Compose, `PodmanArgs=--privileged` in the Quadlet unit).

- Rootless Podman cannot read SMART data. Run the container as root if you need it.
- USB enclosures and some RAID/HBA controllers do not pass SMART through. Use a `smartctl` option in your `snapraid.conf` for such disks if your controller supports it (see the SnapRAID manual).

### "Probe command is not supported on this platform"

SnapRAID cannot read the power state of the disks. This is common with NVMe drives or certain disk controllers. Everything else keeps working.

### A disk shows "Standby"

The disk is asleep. SMART data is not read, so it is not woken up. It is read again once the disk is awake. See [SMART monitoring](smart.md).

## Recover files

### Recovered files belong to root

SnapRAID stores no owner or permissions, so a file it recreates belongs to whoever runs it, `root` in the Docker image, with mode `600`. SnapRAID UI gives recovered files, and the folders made for them, the owner and permissions of the folder they are restored into (see [Recover files](usage.md#recover-files)). They can still end up with `root` when:

- the folder they are restored into belongs to `root` itself,
- they were recovered with version 1.2.7 or older, or outside the UI (`snapraid fix` on the command line),
- the jobs run on a [snapraid-daemon](automation.md) on another machine, where SnapRAID UI can't reach the disks.

Fix them by hand, e.g. `chown -R tristan:tristan /mnt/disk1/photos` and `chmod 644` for the files. Before replacing a disk, give the new disk's top folder the owner you want.

### A recovered file is still listed as changed

SnapRAID sometimes keeps the new modification time of a file it restored in place, to not mix it up with another file. Its content is the one of the last sync; the *Changes* page hides it, and the next sync reads it again.

## Config editor and disk wizards

### Unsaved text was lost

The **Visual Editor** writes every change to the file immediately, while the **Text Editor** only writes on **Save Changes**. Switching from text to visual mode, leaving the *Configuration* page or closing the tab discards unsaved text; the page asks before it does.

### "Failed to load disk configuration"

The visual editor could not read or parse the file. Open it in the **Text Editor** to check it, or check the file's permissions in the data folder.

### Adding disks, content files or excludes

| Message | Fix |
|---|---|
| *Disk name '…' already exists* | Every data disk needs a unique name in the config. |
| *Parity file path must end with .parity* | Use a file name like `snapraid.parity`. |
| *SnapRAID supports at most 6 parity levels* | You already have six levels. |
| *Only the highest parity level (…) can be removed* | Parity levels must stay without gaps. Remove the highest level first. |
| *Content file '…' already exists* / *Pattern '…' already exists* | The line is already in the config. |
| *Value must be a positive whole number* | `autosave` and `blocksize` take whole numbers above 0; leave the field empty to remove the option. |

### `.snapraid.content` shows up in every diff

Up to version 1.2.6, a data disk added in the visual editor with a slash at the end of the mount path got a content line with a double slash, e.g. `content /mnt/disk1//.snapraid.content`. SnapRAID only recognizes its content files by the path exactly as written, so it treats this one as a normal file: every sync stores it again and every diff lists it as changed. No data is at risk, the extra content file still works.

Open the config in the **Text Editor**, replace `//.snapraid.content` with `/.snapraid.content` and save, then run a sync. Newer versions write the path with a single slash.

### Replacing a disk

| Message | Fix |
|---|---|
| *… does not exist or is not a directory* | Mount the new disk first. For a parity disk the directory that will hold the parity file must exist. |
| *Split parity can only be replaced in place, edit the config to move it* | Keep the path, or move the split parity files in the text editor. |
| *Disk '…' is still being replaced* | Only one replacement per configuration at a time. Finish or stop the other one first. |
| *Run fix first* | The check and the sync only run after `fix`. |
| The fix step fails | Check the log, e.g. whether the new path is mounted and writable, then click **Run again**. |

### Removing a data disk

| Message | Fix |
|---|---|
| *The last data disk cannot be removed* | A configuration needs at least one data disk. Remove the whole configuration instead. |
| *SnapRAID needs at least N content files on other disks, only M would remain* | Content files on the removed disk are dropped. Add content files on other disks first (one more than parity levels). |
| *… is not empty* | The `.snapraid-removal` directory on the disk contains files. Empty or delete it. |
| Disk stays at *Removal pending* | The `sync -E` failed or was aborted. Fix the cause shown in the log, then **Continue removal**. |

### "This is not a SnapRAID UI backup"

Only files created with **Download backup** can be restored. If the message after a restore lists files under *Not restored*, see [Backup and restore](disks.md#backup-and-restore).

## Login

| Problem | Fix |
|---|---|
| *Too many failed attempts. Try again in …* | After 5 failed attempts within 15 minutes, logins from that client are blocked until the 15 minutes are over. The counter lives in memory, so restarting the container also resets it. |
| No login screen at all | Login is only active when both `SNAPRAID_UI_USERNAME` and `SNAPRAID_UI_PASSWORD` are set. The backend logs a warning when it is disabled. |
| Everyone should be logged out | Change the password, or delete `.session-secret` in the data folder and restart. |
| *The server cannot be reached* | The backend is not running or not reachable. Check `docker logs snapraid-ui`. |

The lockout is counted per client address. Behind your own reverse proxy, all visitors may arrive with the proxy's address and then share one counter. See [Security](security.md).

## Other

### Live output does not update behind a reverse proxy

Live output uses a WebSocket on `/ws`. Your reverse proxy must forward WebSocket upgrades to the container. See [Installation](installation.md).

### "Copying failed, the browser only allows it over HTTPS"

Browsers only allow clipboard access on secure pages. Use the download button in the log view, or serve the UI over HTTPS.

### A block size change needs a new sync

Changing `blocksize` on an existing array requires a completely new sync. Only change it when you set up a new array.

### Where are the container logs?

Backend, frontend and Nginx all log to the container's output:

```bash
docker logs -f snapraid-ui
# Podman Quadlet
journalctl --user -u snapraid-app
```

## Getting help

If you think you found a bug, open an issue on [GitHub](https://github.com/firsttris/snapraid-ui/issues) with:

- the image tag or version and how you run it (Docker, Compose, Podman),
- the relevant part of the container log and of the SnapRAID log (remove private paths if needed),
- what you expected and what happened.
