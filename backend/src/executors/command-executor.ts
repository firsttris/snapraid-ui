import type { SnapRaidCommand, CommandOutput, RunningJob, FinishedJob } from "@shared/types.ts";
import type { LogManager } from "../log-manager.ts";
import { basename } from "@std/path";
import { snapraidCommand } from "../config.ts";

/**
 * Global state for command executor
 */
const state = {
  processes: new Map<string, Deno.ChildProcess>(),
  abortRequested: new Set<string>(),
  currentJob: null as RunningJob | null,
  // Tail of the running job's output, replayed to clients that connect while it runs
  currentOutput: "",
  lastJob: null as FinishedJob | null,
  logManager: null as LogManager | null,
};

// Enough for the console and the progress bar, SnapRAID rewrites its progress line over and over
const MAX_BUFFERED_OUTPUT = 64 * 1024;

const bufferOutput = (chunk: string): void => {
  state.currentOutput = (state.currentOutput + chunk).slice(-MAX_BUFFERED_OUTPUT);
};

/**
 * Prepare log path and ensure directory exists
 */
const prepareLogPath = async (command: SnapRaidCommand): Promise<string> => {
  if (!state.logManager) throw new Error("Log manager not configured");
  await state.logManager.ensureLogDirectory();
  return state.logManager.getLogPath(command);
};

/**
 * Build command arguments functionally
 */
const buildCommandArgs = (
  command: SnapRaidCommand,
  configPath: string,
  additionalArgs: string[],
  logPath?: string
): string[] => {
  const baseArgs = [command, "-c", configPath];
  const logArgs = logPath ? ["-l", logPath] : [];
  return [...baseArgs, ...logArgs, ...additionalArgs];
};

/**
 * Async generator for reading stream chunks
 */
async function* readStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Uint8Array> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

/**
 * Create stream reader
 */
const createStreamReader = (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onOutput: (chunk: string) => void
) => async (): Promise<string> => {
  // One decoder per stream, in streaming mode, so characters split across chunks stay intact
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for await (const value of readStream(reader)) {
    const chunk = decoder.decode(value, { stream: true });
    chunks.push(chunk);
    onOutput(chunk);
  }
  const rest = decoder.decode();
  if (rest) {
    chunks.push(rest);
    onOutput(rest);
  }
  return chunks.join("");
};

/**
 * Read both stdout and stderr streams
 */
const readProcessStreams = async (
  process: Deno.ChildProcess,
  onOutput: (chunk: string) => void
): Promise<string> => {
  const [stdoutContent, stderrContent] = await Promise.all([
    createStreamReader(process.stdout.getReader(), onOutput)(),
    createStreamReader(process.stderr.getReader(), onOutput)(),
  ]);
  return stdoutContent + stderrContent;
};

/**
 * Cleanup after process completion
 */
const cleanupProcess = (processId: string, outcome: Omit<FinishedJob, "finishedAt">): void => {
  state.processes.delete(processId);
  state.abortRequested.delete(processId);
  state.lastJob = { ...outcome, finishedAt: new Date().toISOString() };
  if (state.currentJob?.processId === processId) {
    state.currentJob = null;
    state.currentOutput = "";
  }
};

/**
 * Execute a SnapRAID command and stream output
 */
export const executeCommand = async (
  command: SnapRaidCommand,
  configPath: string,
  onOutput: (chunk: string) => void,
  additionalArgs: string[] = [],
  afterRun?: (result: CommandOutput) => Promise<void>
): Promise<CommandOutput> => {
  const processId = `${command}-${Date.now()}`;
  const timestamp = new Date().toISOString();

  // Also a failure before the process runs ends up as the last job, so clients learn about it
  try {
    const logPath = state.logManager ? await prepareLogPath(command) : undefined;
    const args = buildCommandArgs(command, configPath, additionalArgs, logPath);

    state.currentJob = {
      command,
      configPath,
      startTime: timestamp,
      processId,
      logFile: logPath ? basename(logPath) : undefined,
    };
    state.currentOutput = "";

    const cmd = snapraidCommand(args);

    const process = cmd.spawn();
    state.processes.set(processId, process);

    const fullOutput = await readProcessStreams(process, (chunk) => {
      bufferOutput(chunk);
      onOutput(chunk);
    });
    const status = await process.status;
    const aborted = state.abortRequested.has(processId);
    const result = {
      command: `snapraid ${args.join(" ")}`,
      output: fullOutput,
      timestamp,
      exitCode: status.code,
      logPath,
      aborted,
    };
    // Still counts as the current job, so nothing else starts before the follow-up is done
    await afterRun?.(result);
    cleanupProcess(processId, { command, processId, exitCode: status.code, aborted });

    return result;
  } catch (error) {
    cleanupProcess(processId, { command, processId, exitCode: null, aborted: false, error: String(error) });
    throw error;
  }
};

/**
 * Abort a running command.
 * SnapRAID handles SIGINT like Ctrl+C: it stops at the next block and saves its state,
 * so the job stays current until the process has actually exited.
 */
export const abortCommand = (processId: string): boolean => {
  const process = state.processes.get(processId);
  if (!process) return false;

  process.kill("SIGINT");
  state.abortRequested.add(processId);
  if (state.currentJob?.processId === processId) {
    state.currentJob = { ...state.currentJob, aborting: true };
  }
  return true;
};

/**
 * Get current running job
 */
export const getCurrentJob = (): RunningJob | null => {
  return state.currentJob;
};

/**
 * Output of the running job so far (its tail)
 */
export const getCurrentOutput = (): string => {
  return state.currentOutput;
};

/**
 * Outcome of the last finished job
 */
export const getLastJob = (): FinishedJob | null => {
  return state.lastJob;
};

/**
 * Execute snapraid command with given args (non-streaming)
 */
export const executeSnapraidCommand = async (args: string[]): Promise<{ stdout: string, stderr: string }> => {
  const cmd = snapraidCommand(args);

  const { stdout, stderr } = await cmd.output();
  const decoder = new TextDecoder();
  
  return {
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  };
};

/**
 * Set log manager
 */
export const setLogManager = (logManager_: LogManager): void => {
  state.logManager = logManager_;
};



