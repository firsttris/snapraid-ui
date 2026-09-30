import { basename } from "@std/path";
import { existsSync } from "@std/fs";
import type {
  NotificationSettings,
  ScheduleOutcome,
  SmartDiskInfo,
  SnapRaidCommand,
} from "@shared/types.ts";
import { assessSmart, type SmartAssessment, type SmartReason, smartHints, smartSignature } from "@shared/smart-health.ts";
import { resolveFromBase } from "./config.ts";
import { loadNotificationSettings, type Notification, notify } from "./notifications.ts";
import { isSuccessful, type RunReport } from "./run-report.ts";
import { parseLogTags, restOf, unescapeTagValue } from "./parsers/structured-log.ts";

type Language = NotificationSettings["language"];

const TEXT = {
  en: {
    result: { ok: "OK", warning: "OK with warnings", error: "failed", aborted: "aborted", incomplete: "incomplete" },
    manualLabel: (command: string) => `Manual ${command}`,
    failedTitle: (label: string) => `Failed: ${label}`,
    dataErrorsTitle: (label: string) => `Data errors found: ${label}`,
    succeededTitle: (label: string) => `Completed: ${label}`,
    skippedTitle: (label: string) => `Skipped: ${label}`,
    smartTitle: (config: string) => `SMART warning: ${config}`,
    config: (name: string) => `Config: ${name}`,
    changes: (c: NonNullable<RunReport["changes"]>) =>
      `${c.added} added, ${c.updated} updated, ${c.removed} removed, ${c.moved} moved`,
    errors: (io: number, data: number) => `${io} I/O errors, ${data} data errors`,
    fixCounts: (recovered: number, unrecoverable: number) =>
      `${recovered} recovered, ${unrecoverable} unrecoverable`,
    notRun: "not run",
    dataErrorsHint: "Blocks marked as bad can be repaired with \"Fix errors\" on the dashboard.",
    skip: {
      job_running: "Another job was running.",
      too_many_deleted: (count: number, max: number) =>
        `diff reports ${count} deleted files, more than the limit of ${max}. Check that no disk is missing, then start the sync manually.`,
      diff_failed: (error: string) => `diff failed: ${error}`,
      recovery_in_progress: "A disk is being replaced; scheduled jobs are paused until its sync is done.",
    },
    smartReason: (reason: SmartReason) => {
      switch (reason.kind) {
        case "status":
          return {
            FAIL: "the disk reports itself as failing",
            PREFAIL: "a pre-failure value is below its limit",
            LOGFAIL: "a pre-failure value was below its limit in the past",
            LOGERR: "errors in the disk's error log",
            SELFERR: "a SMART self-test failed",
          }[reason.status as string] + ` (SMART ${reason.status})`;
        case "failure_probability":
          return `failure probability ${reason.percent}% per year`;
        case "temperature":
          return `${reason.celsius} °C`;
        case "sectors":
          return `${reason.count} ${
            { reallocated: "reallocated", pending: "pending", uncorrectable: "uncorrectable" }[reason.attribute]
          } sectors`;
        case "errors":
          return {
            reported_uncorrectable: `${reason.count} uncorrectable read errors`,
            crc: `${reason.count} transfer (CRC) errors`,
            medium: `${reason.count} media errors`,
          }[reason.attribute];
        case "wear":
          return `${reason.percent}% of the SSD's rated lifetime used`;
        case "unreadable":
          return "SMART data could not be read";
      }
    },
    smartHint: {
      replace: "Consider replacing the disk before it fails.",
      cable: "Transfer errors usually come from the cable or the backplane; replace it if the count keeps growing.",
      cooling: "Improve the cooling of the disk.",
      access: "An unreadable disk is not monitored. Check that it is connected; in Docker SMART needs a --privileged container.",
    },
  },
  de: {
    result: {
      ok: "OK",
      warning: "OK mit Warnungen",
      error: "fehlgeschlagen",
      aborted: "abgebrochen",
      incomplete: "unvollständig",
    },
    manualLabel: (command: string) => `Manueller ${command}`,
    failedTitle: (label: string) => `Fehlgeschlagen: ${label}`,
    dataErrorsTitle: (label: string) => `Datenfehler gefunden: ${label}`,
    succeededTitle: (label: string) => `Erfolgreich: ${label}`,
    skippedTitle: (label: string) => `Übersprungen: ${label}`,
    smartTitle: (config: string) => `SMART-Warnung: ${config}`,
    config: (name: string) => `Konfiguration: ${name}`,
    changes: (c: NonNullable<RunReport["changes"]>) =>
      `${c.added} neu, ${c.updated} geändert, ${c.removed} gelöscht, ${c.moved} verschoben`,
    errors: (io: number, data: number) => `${io} E/A-Fehler, ${data} Datenfehler`,
    fixCounts: (recovered: number, unrecoverable: number) =>
      `${recovered} wiederhergestellt, ${unrecoverable} nicht wiederherstellbar`,
    notRun: "nicht ausgeführt",
    dataErrorsHint: "Als fehlerhaft markierte Blöcke lassen sich im Dashboard mit „Fehler beheben“ reparieren.",
    skip: {
      job_running: "Es lief gerade ein anderer Job.",
      too_many_deleted: (count: number, max: number) =>
        `diff meldet ${count} gelöschte Dateien, mehr als die Grenze von ${max}. Prüfe, ob eine Platte fehlt, und starte den Sync dann manuell.`,
      diff_failed: (error: string) => `diff ist fehlgeschlagen: ${error}`,
      recovery_in_progress: "Eine Platte wird gerade ersetzt, geplante Jobs pausieren bis zu ihrem Sync.",
    },
    smartReason: (reason: SmartReason) => {
      switch (reason.kind) {
        case "status":
          return {
            FAIL: "die Platte meldet selbst einen Defekt",
            PREFAIL: "ein Frühwarnwert liegt unter seinem Grenzwert",
            LOGFAIL: "ein Frühwarnwert lag früher unter seinem Grenzwert",
            LOGERR: "Einträge im Fehlerprotokoll der Platte",
            SELFERR: "ein SMART-Selbsttest ist fehlgeschlagen",
          }[reason.status as string] + ` (SMART ${reason.status})`;
        case "failure_probability":
          return `Ausfallwahrscheinlichkeit ${String(reason.percent).replace(".", ",")} % pro Jahr`;
        case "temperature":
          return `${reason.celsius} °C`;
        case "sectors":
          return `${reason.count} ${
            { reallocated: "reallozierte", pending: "ausstehende", uncorrectable: "nicht korrigierbare" }[
              reason.attribute
            ]
          } Sektoren`;
        case "errors":
          return {
            reported_uncorrectable: `${reason.count} nicht korrigierbare Lesefehler`,
            crc: `${reason.count} Übertragungsfehler (CRC)`,
            medium: `${reason.count} Medienfehler`,
          }[reason.attribute];
        case "wear":
          return `${reason.percent} % der vorgesehenen SSD-Lebensdauer verbraucht`;
        case "unreadable":
          return "SMART-Daten konnten nicht gelesen werden";
      }
    },
    smartHint: {
      replace: "Die Platte sollte ersetzt werden, bevor sie ausfällt.",
      cable: "Übertragungsfehler kommen meist vom Kabel oder der Backplane; tausche es, wenn der Zähler weiter steigt.",
      cooling: "Die Kühlung der Platte sollte verbessert werden.",
      access: "Eine nicht lesbare Platte wird nicht überwacht. Prüfe, ob sie angeschlossen ist; in Docker braucht SMART einen Container mit --privileged.",
    },
  },
} as const;

const COMMAND_LABEL: Partial<Record<SnapRaidCommand, string>> = {
  sync: "Sync",
  scrub: "Scrub",
  touch: "Touch",
  fix: "Fix",
  check: "Check",
  smart: "SMART",
  status: "Status",
  diff: "Diff",
};

const commandLabel = (command: SnapRaidCommand) => COMMAND_LABEL[command] ?? command;

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// The reason SnapRAID gave up, e.g. a missing disk
const fatalMessage = (log: string): string | undefined => {
  const tag = parseLogTags(log).find((t) => t.name === "msg" && t.values[0] === "fatal");
  return tag ? unescapeTagValue(restOf(tag.values, 1)) : undefined;
};

const hasErrors = (report: RunReport) => report.ioErrors + report.dataErrors > 0;

const stepLine = (lang: Language, report: RunReport): string => {
  const t = TEXT[lang];
  const details = [
    report.changes && t.changes(report.changes),
    hasErrors(report) && t.errors(report.ioErrors, report.dataErrors),
    report.command === "fix" && t.fixCounts(report.recovered ?? 0, report.unrecoverable ?? 0),
    !isSuccessful(report.result) && (report.error ?? fatalMessage(report.log)),
  ].filter(Boolean);
  return `${commandLabel(report.command)}: ${t.result[report.result]} (${formatDuration(report.durationSec)})` +
    (details.length ? `\n  ${details.join("\n  ")}` : "");
};

/**
 * One notification for a run of one or more commands, the most severe outcome wins
 */
export const buildRunNotification = (
  lang: Language,
  label: string,
  configPath: string,
  reports: RunReport[],
  notRun: SnapRaidCommand[] = [],
): Notification | null => {
  const t = TEXT[lang];
  // Stopped on request, nobody needs to be told
  if (reports.some((report) => report.result === "aborted")) return null;

  const lines = [
    ...reports.map((report) => stepLine(lang, report)),
    ...notRun.map((command) => `${commandLabel(command)}: ${t.notRun}`),
    "",
    t.config(basename(configPath)),
  ];

  if (reports.some(hasErrors)) {
    return {
      event: "data_errors",
      severity: "error",
      title: t.dataErrorsTitle(label),
      message: [...lines, "", t.dataErrorsHint].join("\n"),
    };
  }
  if (reports.some((report) => !isSuccessful(report.result))) {
    return { event: "job_failed", severity: "error", title: t.failedTitle(label), message: lines.join("\n") };
  }
  return { event: "job_succeeded", severity: "info", title: t.succeededTitle(label), message: lines.join("\n") };
};

export const buildSkipNotification = (
  lang: Language,
  label: string,
  configPath: string,
  outcome: ScheduleOutcome,
  maxDeletedFiles?: number | null,
): Notification => {
  const t = TEXT[lang];
  const reason = (() => {
    switch (outcome.skipReason) {
      case "too_many_deleted":
        return t.skip.too_many_deleted(outcome.deletedFiles ?? 0, maxDeletedFiles ?? 0);
      case "diff_failed":
        return t.skip.diff_failed(outcome.error ?? "");
      case "recovery_in_progress":
        return t.skip.recovery_in_progress;
      default:
        return t.skip.job_running;
    }
  })();
  return {
    event: "schedule_skipped",
    severity: "warning",
    title: t.skippedTitle(label),
    message: [reason, "", t.config(basename(configPath))].join("\n"),
  };
};

// ====================
// SMART
// ====================

const STATE_FILE = "notifications-state.json";

interface NotificationState {
  // Last reported problem per disk, a disk is reported again only when it changes
  smart: Record<string, string>;
}

const smartKey = (configPath: string, disk: SmartDiskInfo) =>
  `${configPath}|${disk.name}|${disk.serial ?? disk.device}`;

/**
 * Disks with a new or changed problem, and the state to remember for the config
 */
export const diffSmartProblems = (
  configPath: string,
  disks: SmartDiskInfo[],
  threshold: number,
  previous: Record<string, string>,
): { report: Array<{ disk: SmartDiskInfo; assessment: SmartAssessment }>; state: Record<string, string> } => {
  const ownKeys = (key: string) => key.startsWith(`${configPath}|`);
  const state = Object.fromEntries(Object.entries(previous).filter(([key]) => !ownKeys(key)));
  const report: Array<{ disk: SmartDiskInfo; assessment: SmartAssessment }> = [];

  disks.forEach((disk) => {
    const assessment = assessSmart(disk, threshold);
    const problem = smartSignature(assessment);
    if (!problem) return;
    const key = smartKey(configPath, disk);
    state[key] = problem;
    if (previous[key] !== problem) report.push({ disk, assessment });
  });
  return { report, state };
};

const loadState = async (): Promise<NotificationState> => {
  const path = resolveFromBase(STATE_FILE);
  if (!existsSync(path)) return { smart: {} };
  try {
    return { smart: {}, ...JSON.parse(await Deno.readTextFile(path)) };
  } catch {
    return { smart: {} };
  }
};

const saveState = (state: NotificationState) =>
  Deno.writeTextFile(resolveFromBase(STATE_FILE), JSON.stringify(state, null, 2));

// ====================
// Entry points, never throw: a failed notification must not fail the job
// ====================

const safely = async (what: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (error) {
    console.error(`Failed to send ${what} notification:`, error);
  }
};

export const notifyRun = (
  label: string,
  configPath: string,
  reports: RunReport[],
  notRun: SnapRaidCommand[] = [],
): Promise<void> =>
  safely("run", async () => {
    const settings = await loadNotificationSettings();
    const notification = buildRunNotification(settings.language, label, configPath, reports, notRun);
    if (notification) await notify(notification);
  });

/**
 * A job started in the UI, only reported when the settings ask for it
 */
export const notifyManualRun = (configPath: string, report: RunReport): Promise<void> =>
  safely("run", async () => {
    const settings = await loadNotificationSettings();
    if (!settings.includeManualJobs) return;
    const label = TEXT[settings.language].manualLabel(commandLabel(report.command));
    const notification = buildRunNotification(settings.language, label, configPath, [report]);
    if (notification) await notify(notification);
  });

export const notifySkipped = (
  label: string,
  configPath: string,
  outcome: ScheduleOutcome,
  maxDeletedFiles?: number | null,
): Promise<void> =>
  safely("skip", async () => {
    const settings = await loadNotificationSettings();
    await notify(buildSkipNotification(settings.language, label, configPath, outcome, maxDeletedFiles));
  });

export const notifySmart = (configPath: string, disks: SmartDiskInfo[]): Promise<void> =>
  safely("SMART", async () => {
    const settings = await loadNotificationSettings();
    const state = await loadState();
    const { report, state: smart } = diffSmartProblems(
      configPath,
      disks,
      settings.smartFailureThreshold,
      state.smart,
    );
    await saveState({ ...state, smart });
    if (report.length === 0) return;

    const t = TEXT[settings.language];
    const lines = report.map(({ disk, assessment }) =>
      `${disk.name} (${[disk.device, disk.model, disk.serial].filter(Boolean).join(", ")}): ` +
      assessment.reasons.map(t.smartReason).join(", ")
    );
    await notify({
      event: "smart_warning",
      severity: report.some(({ assessment }) => assessment.level === "critical") ? "error" : "warning",
      title: t.smartTitle(basename(configPath)),
      message: [...lines, "", ...smartHints(report.map(({ assessment }) => assessment)).map((hint) => t.smartHint[hint])]
        .join("\n"),
    });
  });
