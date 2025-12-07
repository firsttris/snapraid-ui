import type { SnapRaidCommand, CommandOutput, RunningJob } from "@shared/types.ts";
import type { LogManager } from "../log-manager.ts";

/**
 * Global state for command executor
 */
const state = {
  processes: new Map<string, Deno.ChildProcess>(),
  currentJob: null as RunningJob | null,
  logManager: null as LogManager | null,
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
  decoder: TextDecoder,
  onOutput: (chunk: string) => void
) => async (): Promise<string> => {
  const chunks: string[] = [];
  for await (const value of readStream(reader)) {
    const chunk = decoder.decode(value);
    chunks.push(chunk);
    onOutput(chunk);
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
  const decoder = new TextDecoder();
  const [stdoutContent, stderrContent] = await Promise.all([
    createStreamReader(process.stdout.getReader(), decoder, onOutput)(),
    createStreamReader(process.stderr.getReader(), decoder, onOutput)(),
  ]);
  return stdoutContent + stderrContent;
};

/**
 * Cleanup after process completion
 */
const cleanupProcess = (processId: string): void => {
  state.processes.delete(processId);
  state.currentJob = null;
};

/**
 * Execute a SnapRAID command and stream output
 */
export const executeCommand = async (
  command: SnapRaidCommand,
  configPath: string,
  onOutput: (chunk: string) => void,
  additionalArgs: string[] = []
): Promise<CommandOutput> => {
  const processId = `${command}-${Date.now()}`;
  const logPath = state.logManager ? await prepareLogPath(command) : undefined;
  const args = buildCommandArgs(command, configPath, additionalArgs, logPath);
  const timestamp = new Date().toISOString();

  state.currentJob = {
    command,
    configPath,
    startTime: timestamp,
    processId,
  };

  const cmd = new Deno.Command("snapraid", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();
  state.processes.set(processId, process);

  try {
    const fullOutput = await readProcessStreams(process, onOutput);
    const status = await process.status;
    cleanupProcess(processId);

    return {
      command: `snapraid ${args.join(" ")}`,
      output: fullOutput,
      timestamp,
      exitCode: status.code,
    };
  } catch (error) {
    cleanupProcess(processId);
    throw error;
  }
};

/**
 * Abort a running command
 */
export const abortCommand = (processId: string): boolean => {
  const process = state.processes.get(processId);
  if (process) {
    process.kill("SIGTERM");
    state.processes.delete(processId);
    state.currentJob = null;
    return true;
  }
  return false;
};

/**
 * Get current running job
 */
export const getCurrentJob = (): RunningJob | null => {
  return state.currentJob;
};

/**
 * Execute snapraid command with given args (non-streaming)
 */
export const executeSnapraidCommand = async (args: string[]): Promise<{ stdout: string, stderr: string }> => {
  const cmd = new Deno.Command("snapraid", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

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



