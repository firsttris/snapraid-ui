// Pauses Docker containers while SnapRAID reads the array, so their files do not change under
// a sync or scrub. A schedule holds them across its steps (touch, sync, scrub); the executor
// holds them per job, the count makes sure they are paused once and resumed once.
import { existsSync } from "@std/fs";
import type { SnapRaidCommand } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";
import { resolveFromBase } from "./config.ts";
import {
  dockerSocket,
  type DockerRequest,
  inspectContainer,
  ownContainerId,
  pauseContainer,
  unpauseContainer,
} from "./docker.ts";
import { loadMaintenanceSettings } from "./maintenance-settings.ts";

// Containers paused here, to resume them after a crash or restart of the backend
const STATE_FILE = "paused-containers.json";

interface PausedState {
  socketPath: string;
  containers: string[];
}

export type Report = (line: string) => void;
export type Release = () => Promise<void>;

const state = {
  holders: 0,
  paused: null as PausedState | null,
  // Pausing and resuming one after the other, a release must not overtake a pause
  queue: Promise.resolve() as Promise<unknown>,
  request: dockerSocket as (socketPath: string) => DockerRequest,
};

const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = state.queue.then(fn, fn);
  state.queue = run.catch(() => {});
  return run;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const statePath = () => resolveFromBase(STATE_FILE);

const savePaused = async (paused: PausedState | null): Promise<void> => {
  if (paused && paused.containers.length > 0) {
    await Deno.writeTextFile(statePath(), JSON.stringify(paused, null, 2));
  } else if (existsSync(statePath())) {
    await Deno.remove(statePath());
  }
};

/**
 * Pause the running containers among the names; returns the ones paused here.
 * Already paused or stopped containers are left alone, someone else manages them,
 * and so is the container of SnapRAID UI: paused, it could never resume the others.
 */
export const pauseContainers = async (
  request: DockerRequest,
  names: string[],
  report: Report,
  ownId: string | null = null,
): Promise<string[]> => {
  const paused: string[] = [];
  for (const name of names) {
    try {
      const { id, state } = await inspectContainer(request, name);
      if (state !== "running" || id === ownId) continue;
      await pauseContainer(request, name);
      paused.push(name);
    } catch (error) {
      report(msg("server_docker_pause_failed", { name, error: errorText(error) }));
    }
  }
  return paused;
};

export const resumeContainers = async (
  request: DockerRequest,
  names: string[],
  report: Report,
): Promise<void> => {
  // In reverse, a container that depends on another one comes back after it
  for (const name of [...names].reverse()) {
    try {
      await unpauseContainer(request, name);
    } catch (error) {
      report(msg("server_docker_resume_failed", { name, error: errorText(error) }));
    }
  }
};

const noRelease: Release = () => Promise.resolve();

/**
 * Keep the configured containers paused until the returned function is called, if one of the
 * commands is one the settings pause them for. Never throws, problems go to `report`.
 */
export const holdContainers = async (commands: SnapRaidCommand[], report: Report): Promise<Release> => {
  const { dockerPause } = await loadMaintenanceSettings();
  if (
    !dockerPause.enabled ||
    dockerPause.containers.length === 0 ||
    !commands.some((command) => dockerPause.commands.includes(command))
  ) {
    return noRelease;
  }

  await serialize(async () => {
    state.holders++;
    if (state.holders > 1) return;
    const request = state.request(dockerPause.socketPath);
    const containers = await pauseContainers(request, dockerPause.containers, report, await ownContainerId());
    state.paused = { socketPath: dockerPause.socketPath, containers };
    await savePaused(state.paused).catch((error) => console.error("Failed to save paused containers:", error));
    if (containers.length > 0) report(msg("server_docker_paused", { names: containers.join(", ") }));
  });

  let released = false;
  return () =>
    serialize(async () => {
      if (released) return;
      released = true;
      state.holders--;
      if (state.holders > 0 || !state.paused) return;
      const { socketPath, containers } = state.paused;
      state.paused = null;
      await resumeContainers(state.request(socketPath), containers, report);
      await savePaused(null).catch((error) => console.error("Failed to clear paused containers:", error));
      if (containers.length > 0) report(msg("server_docker_resumed", { names: containers.join(", ") }));
    });
};

/**
 * Resume containers a previous run of the backend paused and did not get to resume
 */
export const resumeLeftoverContainers = async (): Promise<void> => {
  if (!existsSync(statePath())) return;
  try {
    const leftover = JSON.parse(await Deno.readTextFile(statePath())) as PausedState;
    console.warn(`Resuming containers paused before the restart: ${leftover.containers.join(", ")}`);
    await resumeContainers(state.request(leftover.socketPath), leftover.containers, (line) => console.error(line));
    await savePaused(null);
  } catch (error) {
    console.error("Failed to resume containers paused before the restart:", error);
  }
};

/**
 * Replace the Docker connection, for tests
 */
export const setDockerRequest = (request: (socketPath: string) => DockerRequest): void => {
  state.request = request;
};
