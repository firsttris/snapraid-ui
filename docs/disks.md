# Configurations and disks

SnapRAID UI works with your existing `snapraid.conf` files. This page explains how to add or create configurations, edit disks and settings in the config editor, replace a failed disk, remove a data disk and back up your settings.

- [Managing configurations](#managing-configurations)
- [The config editor](#the-config-editor)
- [Adding disks and parity levels](#adding-disks-and-parity-levels)
- [Replacing a failed disk](#replacing-a-failed-disk)
- [Removing a data disk](#removing-a-data-disk)
- [Backup and restore](#backup-and-restore)

> [!NOTE]
> All paths you enter (config files, disks, parity, content files) are paths **inside the container**. Mount your disks at the same paths as on the host so the paths in `snapraid.conf` stay valid, see [Installation](installation.md).

## Managing configurations

Open **Manage Configurations** from the sidebar (or from the config selection menu, or the command palette). The dialog lists every SnapRAID config file the UI knows, with a short summary per file, such as `3 data · 1 parity · 4 content`.

| Badge | Meaning |
|---|---|
| *File not found* | The file does not exist at this path inside the container. *Edit* is disabled until it does. |
| *File not readable* | The file exists but could not be parsed. Hover the badge for the error. |
| Summary with a warning sign | *Incomplete: needs at least one parity, content and data entry* |

On the very first start, before `config.json` exists, the UI creates an entry named *Default* that points to `snapraid.conf` in the data folder (`SNAPRAID_BASE_PATH`, `/app/snapraid` in the Docker image). Put your `snapraid.conf` there, or remove that entry and add your file instead.

### Add an existing file

1. Click **Add existing file**.
2. Enter the *Config File Path*, or pick it with **Browse...**. The path can be absolute or relative to the data folder. The browser shows directories and `.conf` files and starts in the data folder.
3. The *Configuration Name* is suggested from the file name (`/etc/snapraid-media.conf` becomes `snapraid-media`). Change it if you like.
4. Click **Add Configuration**.

The file must exist, and the same file cannot be added twice. Files inside the data folder are stored with a relative path, so the data folder can move without breaking them.

### Create a new config

1. Click **Create new config**.
2. Enter a *Configuration Name*. A *File name* is derived from it (`Media Server` becomes `media-server.conf`).
3. Click **Create and edit**.

The file is created in the data folder; `.conf` is appended if you leave it out. File names may only contain letters, digits, `.`, `-` and `_`, and an existing file is never overwritten. The new file starts from a short template with three excludes (`*.unrecoverable`, `/tmp/`, `/lost+found/`) and comments; the config editor opens right away so you can add parity, content and data disks.

### Rename, enable or remove

- **Rename** (pencil icon) changes the display name only. The file is not renamed.
- The **switch** in front of each entry shows or hides the configuration in the config selection.
- **Remove** (trash icon) takes the configuration out of SnapRAID UI. The config file itself is kept.

## The config editor

Click **Edit** next to a configuration, or **Edit configuration** in the sidebar for the selected one. The editor has two modes, switched in its header.

### Visual Editor

> [!IMPORTANT]
> Changes in the visual editor are written to the file immediately. There is no separate save step.

The visual editor shows the configuration in sections:

| Section | What you can do |
|---|---|
| **Parity Disks** | Add the next parity level, replace a parity disk, remove the highest level. Split parity (several files per level) is shown as *split across N files*. |
| **Content files** | Add or remove `content` lines. *Browse* picks a directory and appends `snapraid.content`. Removing a line keeps the file on disk. |
| **Data Disks** | Add a data disk, replace or remove one. |
| **Exclude Patterns** | Add or remove `exclude` lines, e.g. `*.bak`, `/tmp/`, `Thumbs.db`. The same pattern cannot be added twice. |
| **Pooling** | Set, change or remove the `pool` directory, a virtual view of all files in your array using symbolic links. |
| **Options** | `autosave` in GiB and `blocksize` in KiB. Leave a field empty and save to remove the line and use SnapRAID's default. |

> [!WARNING]
> SnapRAID's default block size is 256 KiB. Changing `blocksize` on an existing array requires a completely new sync.

If a config contains no `content` line, the section shows a red warning: SnapRAID needs at least one. Keep at least one more content file than you have parity levels, each on a different disk.

### Text Editor

The text editor shows the raw file with syntax highlighting.

- **Save Changes** (or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd>) writes the file and then validates it automatically.
- *● Unsaved changes* marks edits that are not written yet. Closing the editor or switching to the visual editor asks before it discards them.

Use the text editor for everything the visual editor does not cover, for example `smartctl` or `nohidden` options.

### Validation

**Validate Config** runs `snapraid status` with this config. If SnapRAID exits without error, *Configuration is Valid* is shown; otherwise *Validation Issues Found* with SnapRAID's error output. This catches typos, missing paths and unmounted disks before your first sync. Since `status` needs SnapRAID's lock, validate when no other job is running.

## Adding disks and parity levels

### Data disk

1. In **Data Disks**, click **Add Data Disk**.
2. Enter a *Disk Name* (e.g. `d1`, must be unique in this config) and the *Mount Path* (e.g. `/mnt/disk1`), or pick it with the folder button.
3. Click **Add**.

The UI writes a `data` line and, directly below it, a content file on the new disk: `content <mount path>/.snapraid.content`. Remove that content line again if you do not want one on this disk. Run a sync afterwards to protect the new disk.

### Parity level

1. In **Parity Disks**, click **Add Parity Disk**. The form tells you which keyword the new level gets (`parity`, `2-parity`, …).
2. Enter the *Parity Directory* (e.g. `/mnt/parity2`) and the *Parity Filename* (default `snapraid.parity`, must end with `.parity`).
3. Click **Add**, then run a sync.

A new parity disk always becomes the next level above the existing ones. SnapRAID supports at most 6 parity levels; each additional level protects against one more disk failure.

Only the **highest** parity level can be removed, because SnapRAID needs the levels without gaps. Removing it deletes the line from the config; the parity file on disk is left alone.

## Replacing a failed disk

The replace wizard restores a failed data or parity disk onto a new one, following "Recovering" in the SnapRAID manual. Mount the new, empty disk in the container first.

1. In the editor, click **Replace** next to the failed disk.
2. Enter the new location:
   - data disk: *Mount point of the new disk* (or pick it with the folder button)
   - parity disk: *Parity file on the new disk*, ending with `.parity`

   If the new disk is mounted at the same path as the old one, keep the path as is. The directory (for parity: the directory of the file) must already exist.
3. Click **Start recovery** and confirm.

The wizard then runs these steps:

| Step | Command | Notes |
|---|---|---|
| 1. Point the config to the new disk | – | Changes the `data` or `parity` line. `content` files stored on the old disk move to the same place on the new disk. |
| 2. Restore the files from parity | `snapraid fix -d NAME` | Starts right away. *Run again* repeats it. |
| 3. Verify the restored files (optional) | `snapraid check -a -d NAME` | Data disks only. Checks the restored files against their hashes without reading parity. |
| 4. Sync the array | `snapraid sync` | **Start sync** completes the replacement. |

Each step runs as a normal job, with live output on the dashboard. You can close the dialog at any time; reopen it with **Continue replacing**. The disk shows the badge *Being replaced* meanwhile.

- After each step the wizard shows how many blocks were restored, how many are unrecoverable, errors and the log file.
- If blocks could not be restored, the affected files get the extension `.unrecoverable`. If files were deleted after the last sync, restoring them may help before you run fix again. The wizard asks again before you sync in this case.
- **After the sync, fix cannot be retried.** Only sync once you are satisfied with the result.
- When the sync succeeds, click **Done**.
- **Stop replacing** ends the wizard early. The config keeps pointing to the new disk and scheduled jobs run again. Only do this if you want to finish by hand.

> [!NOTE]
> While a replacement is in progress, scheduled jobs of this configuration are skipped (see [Scheduling](scheduling.md)). Only one disk per configuration can be replaced at a time, and the wizard can only start a step when no other job is running.

Split parity (several files on one level) can only be replaced in place, at the same path. To move it, edit the config in the text editor.

## Removing a data disk

The remove wizard takes a data disk out of the array the way the SnapRAID FAQ describes. Its files are no longer protected afterwards, so move or back them up first if you still need them.

1. In **Data Disks**, click the trash icon next to the disk.
2. Check the steps and click **Start removal**.

| Step | What happens |
|---|---|
| 1. Point the disk to an empty directory | The `data` line is changed to `<mount path>/.snapraid-removal`, an empty directory the UI creates. |
| 2. Remove the content files on this disk | `content` lines below the disk's mount path are removed from the config. |
| 3. Recompute the parity without the disk | `snapraid sync -E` runs as a normal job. |
| 4. Delete the disk from the config | After a successful sync the `data` line and the empty directory are removed automatically. |

The sync can take a long time; you can close the dialog. If the sync fails or is aborted, the disk keeps pointing to the empty directory and shows *Removal pending*. Fix the cause (see the console or the [logs](logs.md)), then click **Continue removal** and **Start sync again**.

The wizard refuses to start when:

- it is the last data disk of the configuration,
- fewer content files would remain on other disks than SnapRAID needs (number of parity levels + 1). Add a content file elsewhere first,
- the `.snapraid-removal` directory exists and is not empty,
- another job is running.

## Backup and restore

At the bottom of **Manage Configurations**, **Backup** saves everything you configured in one JSON file, e.g. to move to a new server.

**Download backup** creates `snapraid-ui-backup-YYYY-MM-DD.json` with:

| File | Content |
|---|---|
| `config.json` | Configurations and app settings |
| `schedules.json` | Schedules |
| `notifications.json` | Notification settings |
| `smart-baseline.json`, `smart-history.json` | SMART history |
| `usage-history.json` | Usage history |
| SnapRAID configs | Every config file listed in `config.json` |

Logs and the state of a running disk replacement are not included.

> [!WARNING]
> The backup contains your notification passwords and tokens. Keep it private.

**Restore backup** asks for confirmation, then writes the files back and restarts the schedules. Files the backup does not contain stay as they are. Some files are not restored, and the message lists them under *Not restored*:

- SnapRAID configs outside the data folder (absolute paths such as `/etc/snapraid.conf`). They are in the backup, so you can copy them back by hand.
- Settings files that are not valid JSON.

A file that is not a SnapRAID UI backup is rejected with *This is not a SnapRAID UI backup*.
