import type { SnapRaidCommand, CommandOutput, RunningJob } from "@shared/types.ts";
import type { LogManager } from "../log-manager.ts";

/**
 * State for command executor
 */
interface ExecutorState {
  processes: Map<string, Deno.ChildProcess>;
  currentJob: RunningJob | null;
  logManager: LogManager | null;
}

/**
 * Create a new executor state
 */
const createExecutorState = (): ExecutorState => ({
  processes: new Map(),
  currentJob: null,
  logManager: null,
});

/**
 * Prepare log path and ensure directory exists
 */
const prepareLogPath = async (state: ExecutorState, command: SnapRaidCommand): Promise<string> => {
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
const cleanupProcess = (state: ExecutorState, processId: string): void => {
  state.processes.delete(processId);
  state.currentJob = null;
};

/**
 * Execute a SnapRAID command and stream output
 */
const executeCommand = (state: ExecutorState) => async (
  command: SnapRaidCommand,
  configPath: string,
  onOutput: (chunk: string) => void,
  additionalArgs: string[] = []
): Promise<CommandOutput> => {
  const processId = `${command}-${Date.now()}`;
  const logPath = state.logManager ? await prepareLogPath(state, command) : undefined;
  const args = buildCommandArgs(command, configPath, additionalArgs, logPath);
  const timestamp = new Date().toISOString();
  
  console.log(`Executing: snapraid ${args.join(" ")}`);

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
    cleanupProcess(state, processId);

    return {
      command: `snapraid ${args.join(" ")}`,
      output: fullOutput,
      timestamp,
      exitCode: status.code,
    };
  } catch (error) {
    cleanupProcess(state, processId);
    throw error;
  }
};

/**
 * Abort a running command
 */
const abortCommand = (state: ExecutorState) => (processId: string): boolean => {
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
const getCurrentJob = (state: ExecutorState) => (): RunningJob | null => {
  return state.currentJob;
};

/**
 * Execute snapraid command with given args (non-streaming)
 */
const executeSnapraidCommand = () => async (args: string[]): Promise<{ stdout: string, stderr: string }> => {
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
 * Log stderr if present
 */
const logStderr = (commandName: string, stderr: string): void => {
  if (stderr) {
    console.log(`${commandName} command stderr:`, stderr);
  }
};

/**
 * Set log manager
 */
const setLogManager = (state: ExecutorState) => (logManager: LogManager): void => {
  state.logManager = logManager;
};

/**
 * Create a command executor with closures
 */
export const createCommandExecutor = () => {
  const state = createExecutorState();
  
  return {
    executeCommand: executeCommand(state),
    abortCommand: abortCommand(state),
    getCurrentJob: getCurrentJob(state),
    executeSnapraidCommand: executeSnapraidCommand(),
    logStderr,
    setLogManager: setLogManager(state),
  };
};

export type CommandExecutor = ReturnType<typeof createCommandExecutor>;

