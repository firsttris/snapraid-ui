# Automation

Two things SnapRAID UI can do around the jobs, both off by default: pause Docker containers while SnapRAID reads the disks, and spin disks down once they have been idle for a while. Set them up under **Automation** in the sidebar.

<img src="screenshots/automation.png" alt="Automation settings with Docker containers and disk spindown" width="900">

Changes take effect when you click *Save*. The settings are stored in `maintenance.json` in the data folder and are part of the [settings backup](disks.md#backup-and-restore).

## Pause Docker containers

Apps like Nextcloud, Immich, photo libraries or databases keep writing files on the data disks. A file that changes while `sync` reads it gets parity that does not match, and `scrub` reports it as an error. Pausing those containers for the duration of the job keeps their files still.

| Field | Default | Description |
|---|---|---|
| *Docker socket* | `/var/run/docker.sock` | The Docker API socket, [mounted into the container](installation.md#docker-socket-optional). The line below it shows whether it can be reached and how many containers it reports. |
| *Containers to pause* | none | The containers on that socket. SnapRAID UI's own container is listed but can't be picked: paused, it could not resume the others. A container picked earlier that no longer exists is shown as *not found*. |
| *Pause during* | *Sync*, *Scrub* | The jobs to pause them for: *Touch*, *Sync*, *Scrub*, *Check*, *Undelete*. |

How it works:

- Before the job starts, every picked container that is *running* is paused (`docker pause`). Containers that are stopped or already paused are left alone, and are not resumed afterwards.
- When the job ends, successful or not, the containers paused for it are resumed in reverse order.
- A schedule with the [nightly routine](scheduling.md#the-nightly-sync-routine) keeps them paused from `touch` through `sync` to `scrub`, instead of resuming them between the steps.
- The job output shows which containers were paused and resumed, and any container that could not be paused. A container that fails to pause does not stop the job.
- If SnapRAID UI is restarted while containers are paused, it resumes them on the next start.

`docker pause` freezes the processes, it does not stop them. Connections stay open and the apps continue where they were. Clients of a paused app wait for the job; schedule long syncs and scrubs for the night.

> [!WARNING]
> Access to the Docker socket is access to the host: whoever can use it can start privileged containers. Only mount it if you need this feature, and protect the UI with a [login](security.md).

## Spin down idle disks

A disk without reads or writes for the set time is spun down with `snapraid down`, which uses `smartctl -s standby,now`. The next access wakes it up again.

| Field | Default | Description |
|---|---|---|
| *Spin down after* | 30 | Minutes without access, 5 to 1440. |

How it works:

- Once a minute SnapRAID UI reads the kernel's I/O counters (`/proc/diskstats`) for every disk of the enabled configurations; which device belongs to which disk comes from `snapraid devices`.
- It watches the counters of the disk's partition. SMART reads and the power state checks of the dashboard only count as I/O of the whole disk, so they do not keep a disk awake.
- A disk that has been spun down is not sent to sleep again until it was active in between.
- While a job runs, and in the two minutes before a schedule starts, nothing is spun down: `snapraid down` holds SnapRAID's lock for a moment, a job starting meanwhile would fail.

*Watched disks* lists the disks with their device, their last access and when they will be spun down, or *Spun down …* for sleeping ones. If no disks show up, SnapRAID can't see the devices; in Docker the container has to be [privileged](installation.md#privileged-mode-and-smart).

> [!NOTE]
> If the host already spins disks down, for example with `hdparm -S` or `hd-idle`, leave this off or use the same idle time. Frequent spin-ups wear disks more than running; very short idle times are not worth it for disks that are used every few minutes.
