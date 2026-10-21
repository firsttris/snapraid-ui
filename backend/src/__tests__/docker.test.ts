import { assertEquals, assertRejects } from "@std/assert";
import { containerIdFromMountinfo, type DockerRequest, listContainers, parseHttpResponse } from "../docker.ts";
import { pauseContainers, resumeContainers } from "../container-pause.ts";

const response = (status: number, body = "") => ({ status, body });

// A fake Docker API: running app and db, a stopped worker, an already paused cache
const fakeDocker = (calls: string[]): DockerRequest => (method, path) => {
  calls.push(`${method} ${path}`);
  const states: Record<string, string> = {
    app: "running",
    db: "running",
    worker: "exited",
    cache: "paused",
    "snapraid-ui": "running",
  };
  const inspect = path.match(/^\/containers\/([^/]+)\/json$/);
  if (inspect) {
    const state = states[inspect[1]];
    return Promise.resolve(
      state
        ? response(200, JSON.stringify({ Id: `id-${inspect[1]}`, State: { Status: state } }))
        : response(404, '{"message":"No such container"}'),
    );
  }
  if (path === "/containers/db/pause") return Promise.resolve(response(500, '{"message":"cgroup frozen"}'));
  return Promise.resolve(response(204));
};

Deno.test("parseHttpResponse - status and body", () => {
  assertEquals(parseHttpResponse("HTTP/1.0 204 No Content\r\nApi-Version: 1.47\r\n\r\n"), response(204));
  assertEquals(parseHttpResponse('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n[{"a":1}]'), response(200, '[{"a":1}]'));
});

Deno.test("listContainers - names without the slash, sorted", async () => {
  const request: DockerRequest = () =>
    Promise.resolve(response(200, JSON.stringify([
      { Id: "b".repeat(64), Names: ["/nextcloud"], Image: "nextcloud:29", State: "running" },
      { Id: "a".repeat(64), Names: ["/immich"], Image: "immich:1", State: "paused" },
    ])));
  assertEquals((await listContainers(request, "b".repeat(64))).map((c) => [c.name, c.state, c.self]), [
    ["immich", "paused", undefined],
    ["nextcloud", "running", true],
  ]);
  await assertRejects(() => listContainers(() => Promise.resolve(response(500, '{"message":"down"}'))), Error, "down");
});

Deno.test("pauseContainers - only running containers, failures are reported and skipped", async () => {
  const calls: string[] = [];
  const reported: string[] = [];
  const paused = await pauseContainers(
    fakeDocker(calls),
    ["app", "db", "worker", "cache", "gone", "snapraid-ui"],
    (line) => reported.push(line),
    "id-snapraid-ui",
  );

  assertEquals(paused, ["app"]);
  assertEquals(calls.filter((call) => call.endsWith("/pause")), ["POST /containers/app/pause", "POST /containers/db/pause"]);
  assertEquals(reported.length, 2); // db could not be paused, gone does not exist
});

Deno.test("resumeContainers - in reverse order", async () => {
  const calls: string[] = [];
  await resumeContainers(fakeDocker(calls), ["app", "web"], () => {});
  assertEquals(calls, ["POST /containers/web/unpause", "POST /containers/app/unpause"]);
});

const ID = "a".repeat(64);
const OTHER = "b".repeat(64);

Deno.test("containerIdFromMountinfo - Docker mounts the hostname file at /etc/hostname", () => {
  const mountinfo = [
    "613 612 0:56 / / rw,relatime master:310 - overlay overlay rw",
    `626 613 259:2 /var/lib/docker/containers/${ID}/hostname /etc/hostname rw,relatime - ext4 /dev/nvme0n1p2 rw`,
  ].join("\n");
  assertEquals(containerIdFromMountinfo(mountinfo), ID);
});

Deno.test("containerIdFromMountinfo - Podman", () => {
  const line =
    `1040 1031 0:45 /containers/storage/overlay-containers/${ID}/userdata/hostname /etc/hostname rw - btrfs /dev/sda2 rw`;
  assertEquals(containerIdFromMountinfo(line), ID);
});

Deno.test("containerIdFromMountinfo - a host running containers is not one of them", () => {
  const mountinfo = [
    "29 1 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw",
    `612 29 0:52 / /var/lib/docker/containers/${OTHER}/mounts/shm rw,nosuid shared:310 - tmpfs shm rw,size=65536k`,
    "700 29 0:60 / /run/docker/netns/1a2b3c rw shared:320 - nsfs nsfs rw",
  ].join("\n");
  assertEquals(containerIdFromMountinfo(mountinfo), null);
});
