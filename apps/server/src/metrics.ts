// Prometheus metrics (text exposition format) from what SnapRAID UI already knows: the last
// runs in the logs, the last status read, the usage and SMART histories and the schedules.
// Nothing here runs SnapRAID or smartctl, a scrape never wakes a disk.
import type { LastRuns, RunningJob, Schedule, SmartHistoryPoint, UsagePoint } from "@shared/types.ts";
import { isSuccessful } from "./run-report.ts";
import { blockingIssues } from "./disk-check.ts";
import type { CachedStatus } from "./status-cache.ts";

export interface ConfigMetrics {
  name: string;
  path: string;
  lastRuns: LastRuns | null;
  status?: CachedStatus;
  usage?: UsagePoint;                              // Latest point of the usage history
  smart: Record<string, SmartHistoryPoint | undefined>; // Latest SMART values by disk
}

export interface MetricsInput {
  configs: ConfigMetrics[];
  schedules: Schedule[];
  job: RunningJob | null;
}

type Labels = Record<string, string>;
interface Sample {
  labels: Labels;
  value: number;
}
interface Family {
  name: string;
  help: string;
  type: "gauge";
  samples: Sample[];
}

const GB = 1e9;

const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const formatLabels = (labels: Labels) => {
  const entries = Object.entries(labels);
  return entries.length === 0 ? "" : `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;
};

const seconds = (iso: string | undefined) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined);

export const renderMetrics = (input: MetricsInput): string => {
  const families = new Map<string, Family>();
  const add = (name: string, help: string, labels: Labels, value: number | undefined) => {
    if (value === undefined || Number.isNaN(value)) return;
    const family = families.get(name) ?? { name, help, type: "gauge" as const, samples: [] };
    family.samples.push({ labels, value });
    families.set(name, family);
  };

  add("snapraid_ui_up", "SnapRAID UI is running", {}, 1);
  add("snapraid_job_running", "1 while a SnapRAID job runs", {}, input.job ? 1 : 0);
  if (input.job) {
    const config = input.configs.find((c) => c.path === input.job?.configPath);
    add("snapraid_job_info", "The running job", {
      command: input.job.command,
      config: config?.name ?? input.job.configPath,
    }, 1);
  }

  for (const config of input.configs) {
    const labels = { config: config.name };
    for (const command of ["sync", "scrub"] as const) {
      const run = config.lastRuns?.[command];
      add(`snapraid_last_${command}_timestamp_seconds`, `When the last ${command} finished`, labels, seconds(run?.timestamp));
      add(
        `snapraid_last_${command}_success`,
        `1 when the last ${command} succeeded (also with warnings)`,
        labels,
        run ? (isSuccessful(run.result) ? 1 : 0) : undefined,
      );
    }

    const status = config.status?.status;
    if (status && config.status) {
      add("snapraid_status_timestamp_seconds", "When the status values below were read", labels, seconds(config.status.timestamp));
      add("snapraid_bad_blocks", "Blocks marked bad by scrub or check, repaired by fix -e", labels, status.badBlocks ?? 0);
      add("snapraid_sync_incomplete", "1 when the last sync did not finish, blocks have no parity", labels, status.syncIncomplete ? 1 : 0);
      add("snapraid_scrubbed_ratio", "Share of the array scrubbed so far", labels, status.scrubPercentage === undefined ? undefined : status.scrubPercentage / 100);
      add("snapraid_oldest_scrub_days", "Days since the oldest block was scrubbed", labels, status.oldestScrubDays);
      add("snapraid_disks_unavailable", "Disks missing or empty, probably not mounted", labels, blockingIssues(status.diskIssues ?? []).length);
    }

    for (const [disk, values] of Object.entries(config.usage?.disks ?? {})) {
      const diskLabels = { ...labels, disk };
      add("snapraid_disk_used_bytes", "Space used on the disk, at the last status read", diskLabels, values.usedGB * GB);
      add("snapraid_disk_free_bytes", "Space free on the disk, at the last status read", diskLabels, values.freeGB * GB);
    }

    for (const [disk, point] of Object.entries(config.smart)) {
      if (!point) continue;
      const diskLabels = { ...labels, disk };
      add("snapraid_disk_temperature_celsius", "Temperature at the last SMART read", diskLabels, point.temperature);
      add("snapraid_disk_reallocated_sectors", "SMART reallocated sector count", diskLabels, point.reallocated);
      add("snapraid_disk_pending_sectors", "SMART current pending sector count", diskLabels, point.pending);
      add("snapraid_disk_crc_errors", "SMART UDMA CRC error count, usually cabling", diskLabels, point.crc);
    }
  }

  for (const schedule of input.schedules) {
    const labels = { schedule: schedule.name, command: schedule.command };
    const outcome = schedule.lastOutcome;
    add("snapraid_schedule_enabled", "1 when the schedule is enabled", labels, schedule.enabled ? 1 : 0);
    add("snapraid_schedule_next_run_timestamp_seconds", "Next time the schedule runs", labels, schedule.enabled ? seconds(schedule.nextRun) : undefined);
    add("snapraid_schedule_last_run_timestamp_seconds", "When the last run of the schedule ended or was skipped", labels, seconds(outcome?.timestamp));
    if (outcome) {
      add("snapraid_schedule_last_success", "1 when the last run succeeded", labels, outcome.result !== "skipped" && isSuccessful(outcome.result) ? 1 : 0);
      add("snapraid_schedule_last_skipped", "1 when the last run was skipped, e.g. by the sync guard", labels, outcome.result === "skipped" ? 1 : 0);
    }
  }

  return [...families.values()]
    .map((family) => [
      `# HELP ${family.name} ${family.help}`,
      `# TYPE ${family.name} ${family.type}`,
      ...family.samples.map((sample) => `${family.name}${formatLabels(sample.labels)} ${sample.value}`),
    ].join("\n"))
    .join("\n") + "\n";
};
