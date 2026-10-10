# Scheduling

The built-in scheduler runs SnapRAID commands on a cron schedule, so you don't need a crontab on the host. Open **Schedules** in the sidebar to create and manage them.

<img src="screenshots/schedules.png" alt="Schedules: the next seven days, a nightly sync with touch and scrub, a weekly scrub and a SMART check" width="900">

## Creating a schedule

Click *Create Schedule*. The form opens as a panel on the right, over the list, and goes from top to bottom:

| Section | Description |
|---|---|
| *Configuration* | The SnapRAID config the job runs against. Only shown when you have more than one; otherwise the panel names the array in its header. |
| *What should run?* | *Sync*, *Scrub*, *Check* or *SMART*. Existing schedules that run `status` or `diff` keep that choice. |
| *When?* | See [Choosing when it runs](#choosing-when-it-runs). |
| *Sequence* | `sync` only: the [nightly routine](#the-nightly-sync-routine). For `scrub` the [scrub plan](#scrub-plans) takes this place. |
| *Sync guard* | `sync` only, see [Sync guard](#sync-guard). |
| *Name (optional)* | Used in the list and in notifications. Left empty, the schedule is named after its command and time, e.g. "Sync · Daily at 02:00". |

A new schedule is enabled. You switch it on and off in the list.

> [!TIP]
> A good starting point for most arrays:
> - a daily `sync` with *Run touch first*, *Scrub afterwards* and the sync guard switched on,
> - a daily `smart` job, so you get [SMART warnings](notifications.md#smart-warnings) and a [SMART history](smart.md#history).

## Choosing when it runs

Pick *Daily*, *Weekly*, *Monthly* or *Every N hours*:

| Choice | Fields | Cron expression, e.g. |
|---|---|---|
| *Daily* | *Time* | `0 2 * * *` |
| *Weekly* | *Day of week*, *Time* | `0 2 * * 0` (Sunday, 2 AM) |
| *Monthly* | *Day of month (1-31)*, *Time* | `0 2 1 * *` (1st of the month, 2 AM) |
| *Every N hours* | *Every … hours* (1–23), *At minute* | `0 */6 * * *` |

Below, *Next runs* shows the next three times, e.g. "today 02:00 · tomorrow 02:00 · Sat 02:00".

*Edit as cron expression* switches to a raw five-field cron expression, starting from the current choice: `minute hour day month weekday`, for example `30 3 * * 1-5` for 3:30 AM on weekdays. Weekdays count from Sunday = 0. An invalid expression shows *Not a valid cron expression* and cannot be saved. *Back to the simple choice* appears when the expression fits one of the four choices.

When you edit an existing schedule, the form opens on the matching choice, or with the cron expression for anything else, so saving other fields never changes when it runs.

> [!NOTE]
> Times are evaluated in the local time zone of the backend process, i.e. the container's time zone.

## The nightly sync routine

A `sync` schedule can run more commands in the same run, under *Sequence*. All of them are off for a new schedule:

| Option | What it does |
|---|---|
| *Run touch first* | Runs `snapraid touch` before the sync. It gives files without sub-second timestamps one, so SnapRAID recognizes moved and copied files. File dates stay as they are. |
| *Pre-hash* | Runs the sync with `-h`: new data is read twice and verified before parity is computed, so faulty RAM or cabling cannot slip damaged data into the parity. Takes longer. |
| *Scrub afterwards* | Runs `snapraid scrub` right after the sync, while the parity is up to date. You can pick *Default*, *Custom amount* or *New blocks only* as plan. |

Each step only runs after the previous one succeeded (finished OK or with warnings). If a step fails, the remaining steps are skipped and the notification lists them as "not run".

If you start a job manually in the UI between two steps, the scheduler does not start the next step, because SnapRAID can't run twice at the same time. That step is recorded as failed ("Another job started before this step").

## Sync guard

If a data disk is missing, not mounted or suddenly empty, an unattended sync would remove its files from the parity, which is exactly what you need to recover them. Ransomware does the same in another way: it encrypts files in place, and the next sync would replace their parity with that of the encrypted files. The sync guard protects against both.

It is off for a new schedule. With *Skip the sync when many files changed* switched on, the scheduler first runs `snapraid diff`. The sync is skipped when:

- `diff` reports more deleted files than *Max. deleted files* (suggested **50**),
- `diff` reports more updated files than *Max. changed files* (suggested **100**, as `sync_threshold_updates` of snapraid-daemon), or
- `diff` itself fails.

Leave one of the two fields empty for no limit on that kind; at least one needs a number.

After a skip for changed files, open a few of the changed files (the *Changed* tab of the [Changes](usage.md#changes-since-the-last-sync) page lists them). If they are unreadable, do not sync: restore them there, the parity still holds the old content. If you changed them yourself, for example by re-tagging a music collection, start the sync manually.

Schedules created before this check have no limit for changed files; edit the schedule and enter one.

The schedule row then shows *Skipped* with the reason, and a [*A scheduled job was skipped*](notifications.md#events) notification is sent. Check on the [Changes](usage.md#changes-since-the-last-sync) page whether a disk is missing. If the deletions are intended, start the sync manually.

The row of a sync schedule with the guard on shows its limits, e.g. "Sync guard: at most 50 deleted, at most 100 changed".

> [!TIP]
> Set the limit above what you delete on a normal day, but far below the number of files on your smallest data disk.

## Scrub plans

A `scrub` schedule (and *Scrub afterwards*) runs one of these plans:

| Plan | SnapRAID arguments | What it checks |
|---|---|---|
| *Default* | *(none)* | About 8% of the array, only blocks not checked for at least 10 days. |
| *Custom amount* | `-p <percent> -o <days>` | *Amount (%)* (1–100) of the array, only blocks older than *Older than (days)*. |
| *New blocks only* | `-p new` | Only blocks that were synced but never checked. |
| *Full* | `-p full` | The whole array. Can take many hours. Only for `scrub` schedules, not for *Scrub afterwards*. |

*Bad blocks only* (`-p bad`) is not offered for schedules. You run it manually after a repair, see [Usage](usage.md).

## The schedule list

*Next 7 days* at the top shows, for each day, which enabled schedule runs when, coloured by command. A schedule that runs several times a day shows its first time and how often, e.g. "3×". A run that is [skipped once](#skipping-the-next-run) is struck through. A schedule that starts while another job is running is skipped, so this is where you spot two jobs at the same time.

Each row below shows:

- the name and what runs, e.g. "Touch → Sync → Scrub (New blocks only)" for a routine or the plan of a scrub schedule,
- the schedule in plain words (e.g. "Daily at 02:00", the cron expression when there are none) and the next run (enabled schedules only),
- the array, only when you have more than one,
- the [sync guard](#sync-guard) limits, when it is on,
- *Last run* with its result: *Succeeded*, *With warnings*, *Failed*, *Aborted*, *Incomplete* or *Skipped*, or *Not run yet*. For a routine where a step did not succeed, the result of each step follows, e.g. "Sync: Succeeded · Scrub: Failed".

The header shows how many schedules are active and when the next one runs, and which one.

*Run now* starts a schedule once, right away, exactly as at its time: the same steps, the [sync guard](#sync-guard), the checks for missing disks, the Docker pause and the notifications. It works for disabled schedules too, so you can try a routine before you enable it. It is greyed out while a job is running.

The switch enables or disables a schedule. A disabled schedule stays saved but never runs.

The ⋯ menu (*More actions*) holds *Edit*, *Skip next run* and *Delete* (after a confirmation).

### Skipping the next run

*Skip next run* leaves out the next timed run once, for example while you move files around or a disk is out for repair. The row shows *Next run skipped*; choose *Run next time again* in the menu to take it back. When the time comes, the run is recorded as *Skipped* with "Skipped once, as asked.", no notification is sent, and the schedule runs normally afterwards. *Run now* is not affected by it.

Every command of a scheduled run writes its own log, which you find under [Logs](logs.md). While a scheduled job runs, its output is sent to the live output like any other job.

## When a schedule is skipped

A scheduled run does not start, and is recorded as *Skipped*, in these cases (checked in this order):

| Reason | Shown as |
|---|---|
| Another job (manual or scheduled) is already running | *Another job was running.* |
| A disk of this configuration is being replaced with the [replacement wizard](disks.md) | *A disk is being replaced, scheduled jobs are paused.* |
| A data disk is missing or empty, or a parity file is gone (`sync`, `scrub`, `touch`, `check` and `fix` only) | "d3 missing or empty, probably not mounted. …" |
| The [sync guard](#sync-guard) stopped a sync | "… deleted files, more than allowed …", "… changed files, more than allowed …" or "Diff before sync failed: …" |
| *Skip next run* was set | *Skipped once, as asked.* (no notification) |

The disk check reads `snapraid status`, which only reads the content file and does not touch the disks. A disk counts as missing when its directory does not exist, or is empty (apart from `lost+found`) while the content file lists files on it. A disk on another filesystem than at the last sync is only flagged on the dashboard, it does not stop the schedule: that is expected after replacing a disk, and the next sync records the new filesystem.

Skipped runs are not queued or retried. The schedule simply runs again at its next time. Each skip, except one you asked for, sends a *A scheduled job was skipped* notification, if that event is enabled under [Notifications](notifications.md#events).

Scheduled jobs of a configuration stay paused from the start of a disk replacement until the wizard's final sync has succeeded. Schedules of other configurations keep running.

While a scheduled job runs, you can't start another command in the UI. The UI reports that a job is already running.

## Scheduled SMART checks

A `smart` schedule reads the SMART data of all disks of the configuration. Besides the usual log, each run:

- adds a point to the [SMART history](smart.md#history),
- updates the [CRC baseline](smart.md#transfer-errors-crc),
- sends a [SMART warning](notifications.md#smart-warnings) for new or changed problems.

SMART warnings are only sent by scheduled `smart` runs, not when you open the SMART page.

## Where schedules are stored

Schedules are kept in `schedules.json` in the data directory (see [Configuration](configuration.md)). They are part of the [backup](disks.md). After restoring a backup, the scheduler reloads them right away.
