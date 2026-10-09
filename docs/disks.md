# Configurations and disks

SnapRAID UI works with your existing `snapraid.conf` files. This page explains how to manage your arrays, edit disks and settings on the configuration page, replace a failed disk, remove a data disk and back up your settings.

- [Managing arrays](#managing-arrays)
- [The configuration page](#the-configuration-page)
- [Adding disks and parity levels](#adding-disks-and-parity-levels)
- [Replacing a failed disk](#replacing-a-failed-disk)
- [Removing a data disk](#removing-a-data-disk)
- [Backup and restore](#backup-and-restore)

> [!NOTE]
> All paths you enter (config files, disks, parity, content files) are paths **inside the container**. Mount your disks at the same paths as on the host so the paths in `snapraid.conf` stay valid, see [Installation](installation.md).

## Managing arrays

Open **Manage arrays** from the sidebar (or from the array selection menu, or the command palette). The dialog lists every array the UI knows, each with its SnapRAID config file and a short summary, such as `3 data · 1 parity · 4 content`.

| Badge | Meaning |
|---|---|
| *File not found* | The file does not exist at this path inside the container. *Edit* is disabled until it does. |
| *File not readable* | The file exists but could not be parsed. Hover the badge for the error. |
| Summary with a warning sign | *Incomplete: needs at least one parity, content and data entry* |

On the very first start, before `config.json` exists, the UI creates an entry named *Default* that points to `snapraid.conf` in the data folder (`SNAPRAID_BASE_PATH`, `/app/snapraid` in the Docker image). Put your `snapraid.conf` there, or remove that entry and add your file instead.

### Set up a new array

The setup wizard (`/setup`) turns your disks into a working array. The dashboard offers it as long as there is no configuration file; later, **Set up a new array** in *Manage arrays* starts it for another array:

1. **Existing or new.** *Add existing configuration* opens *Manage arrays* for a `snapraid.conf` you already have. *Set up a new array* starts the wizard. Started with **Set up a new array** in *Manage arrays*, for a second array, the wizard begins right at this step.
2. **Disks.** Give the array a name (it becomes the file name, `Media Server` → `media-server.conf`). The wizard lists the mounted filesystems with their size and used space, without system directories, the app's own folders and bind-mounted files. Choose a role for each: *Data*, *Parity* or *Not used*. Data disks get the names `d1`, `d2`, … which you can change. A disk that already holds a parity file is preselected as parity, empty disks are marked *empty*. *Add a folder* adds a path the list does not show, e.g. a subfolder.
3. **Check.** The wizard needs at least one data and one parity disk (up to six), unique names and separate paths. It warns when a parity disk is smaller than the data on the largest data disk (the sync would fail), smaller than the largest data disk (fine until it fills up), or not empty.
4. **Review.** The generated `snapraid.conf` is shown before it is written to the data folder. *Run the first sync right away* (on by default) starts it as soon as the array is created; on large disks it takes hours, the UI stays usable.

The configuration the wizard writes:

| Line | Choice |
|---|---|
| `parity`, `2-parity`, … | `snapraid.parity`, `snapraid.2-parity`, … at the top of each parity disk |
| `content` | One copy in the data folder (`<name>.content`) and one on the first data disks, one per parity level, so SnapRAID has one more copy than parity levels, on different disks |
| `data` | Each data disk with its name and mount point |
| `exclude` | `*.unrecoverable`, `/tmp/`, `/lost+found/`, `.Trash-*/`, `.recycle/` |

Data disks keep their files, SnapRAID only reads them. In Docker the wizard can only offer disks mounted into the container, so mount every disk first, at the same path as on the host. Creating the array replaces the *Default* entry of the first start if its `snapraid.conf` never existed; an existing file is never overwritten.

### Add an existing file

1. Click **Add existing file**.
2. Enter the *Config File Path*, or pick it with **Browse...**. The path can be absolute or relative to the data folder. The browser shows directories and `.conf` files and starts in the data folder.
3. The *Configuration Name* is suggested from the file name (`/etc/snapraid-media.conf` becomes `snapraid-media`). Change it if you like.
4. Click **Add Configuration**.

The file must exist, and the same file cannot be added twice. Files inside the data folder are stored with a relative path, so the data folder can move without breaking them.

### Edit, rename, show or remove

- **Edit** opens the array's [configuration page](#the-configuration-page) and makes it the active array. A hidden array, or any array while a job runs, opens there without changing the active one.
- **Rename** (in the **⋯** menu) changes the display name only. The file is not renamed.
- The **switch** in front of each entry, *Shown* or *Hidden*, shows or hides the array in the array selection. A hidden array keeps its schedules, they go on running.
- **Remove** (in the **⋯** menu) takes the array out of SnapRAID UI. The config file itself is kept.

## The configuration page

**Configuration** in the sidebar (under *Array*) opens the `snapraid.conf` of the active array as its own page, at `/array`. It has two modes, *Visual Editor* and *Text Editor*, and **Validate Config** next to them.

### Visual Editor

> [!IMPORTANT]
> Changes in the visual editor are written to the file immediately. There is no separate save step.

The visual editor shows the disks first and keeps the rest under **Advanced**, which opens by itself when the config has too few content files:

| Section | What you can do |
|---|---|
| **Data Disks** | Add a data disk, replace or remove one. |
| **Parity Disks** | Add the next parity level, replace a parity disk, remove the highest level. Split parity (several files per level) is shown as *split across N files*. |
| *Advanced:* **Content files** | Add or remove `content` lines. *Browse* picks a directory and appends `snapraid.content`. Removing a line keeps the file on disk. |
| *Advanced:* **Exclude Patterns** | Add or remove `exclude` lines, e.g. `*.bak`, `/tmp/`, `Thumbs.db`. The same pattern cannot be added twice. |
| *Advanced:* **Pooling** | Set, change or remove the `pool` directory, a virtual view of all files in your array using symbolic links. |
| *Advanced:* **Options** | `autosave` in GiB and `blocksize` in KiB, saved when you leave the field or press <kbd>Enter</kbd>. Empty the field to remove the line and use SnapRAID's default. |

> [!WARNING]
> SnapRAID's default block size is 256 KiB. Changing `blocksize` on an existing array requires a completely new sync.

If a config contains no `content` line, the section shows a red warning: SnapRAID needs at least one. Keep at least one more content file than you have parity levels, each on a different disk.

### Text Editor

The text editor shows the raw file with syntax highlighting.

- **Save Changes** (or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd>) writes the file and then validates it automatically.
- *● Unsaved changes* marks edits that are not written yet. **Cancel** takes them back. Leaving the page, closing the tab or switching to the visual editor asks before it discards them.

Use the text editor for everything the visual editor does not cover, for example `smartctl` or `nohidden` options.

### Validation

**Validate Config** runs `snapraid status` with this config. If SnapRAID exits without error, *Configuration is Valid* is shown; otherwise *Validation Issues Found* with SnapRAID's error output. This catches typos, missing paths and unmounted disks before your first sync. Since `status` needs SnapRAID's lock, validate when no other job is running.

## Adding disks and parity levels

### Data disk

1. In **Data Disks**, click **Add Data Disk**.
2. The *Disk Name* is filled in with the next free name (`d1`, `d2`, …); change it if you like, it must be unique in this config. For the *Mount Path*, click one of the **Detected disks**, the mounted filesystems that are not in the array yet with their size and free space (as in the setup wizard), or enter the path or pick it with the folder button.
3. Click **Add**.

The UI writes a `data` line and, directly below it, a content file on the new disk: `content <mount path>/.snapraid.content`. Remove that content line again if you do not want one on this disk. Run a sync afterwards to protect the new disk.

### Parity level

1. In **Parity Disks**, click **Add Parity Disk**. The form tells you which keyword the new level gets (`parity`, `2-parity`, …).
2. Enter the *Parity Directory* (e.g. `/mnt/parity2`), or click one of the **Detected disks** (a disk that is not empty is marked *Not empty*), and the *Parity Filename* (default `snapraid.parity`, must end with `.parity`).
3. Click **Add**, then run a sync.

A new parity disk always becomes the next level above the existing ones. SnapRAID supports at most 6 parity levels; each additional level protects against one more disk failure.

Only the **highest** parity level can be removed, because SnapRAID needs the levels without gaps. Removing it deletes the line from the config; the parity file on disk is left alone.

## Replacing a failed disk

The replace wizard restores a failed data or parity disk onto a new one, following "Recovering" in the SnapRAID manual. Mount the new, empty disk in the container first.

1. On the configuration page, click **Replace** next to the failed disk.
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

**Backup** at the bottom of the sidebar (or in the command palette) saves everything you configured in one JSON file, e.g. to move to a new server.

**Download backup** creates `snapraid-ui-backup-YYYY-MM-DD.json` with:

| File | Content |
|---|---|
| `config.json` | Configurations and app settings |
| `schedules.json` | Schedules |
| `notifications.json` | Notification settings |
| `maintenance.json`, `engine.json`, `home-assistant.json` | Automation settings: Docker pause, spindown, metrics, snapraid-daemon, Home Assistant |
| `smart-baseline.json`, `smart-history.json` | SMART history |
| `usage-history.json` | Usage history |
| SnapRAID configs | Every config file listed in `config.json` |

Logs and the state of a running disk replacement are not included.

> [!WARNING]
> The backup contains your notification, daemon and MQTT passwords and tokens. Keep it private.

**Restore backup** asks for confirmation, then writes the files back and restarts the schedules. Files the backup does not contain stay as they are. Some files are not restored, and the message lists them under *Not restored*:

- SnapRAID configs outside the data folder (absolute paths such as `/etc/snapraid.conf`). They are in the backup, so you can copy them back by hand.
- Settings files that are not valid JSON.

A file that is not a SnapRAID UI backup is rejected with *This is not a SnapRAID UI backup*.
