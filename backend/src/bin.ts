// Entry point of the standalone binary (scripts/build-binary.sh): the backend with the built
// frontend and the documentation inside, configured by the same environment variables as the image
import { join } from "@std/path";
import { APP_VERSION } from "./version.ts";

const HELP = `SnapRAID UI ${APP_VERSION}, web interface for SnapRAID

Usage: snapraid-ui [--version] [--help]

Configured by environment variables, see https://firsttris.github.io/snapraid-ui/configuration.html:
  PORT                    port of the UI, API and WebSocket (default 8080)
  SNAPRAID_UI_HOST        address to listen on (default 0.0.0.0, all interfaces)
  SNAPRAID_BASE_PATH      data directory: config.json, schedules, logs (default ./snapraid)
  SNAPRAID_BIN            SnapRAID binary (default snapraid from the PATH)
  SNAPRAID_UI_USERNAME    login, together with SNAPRAID_UI_PASSWORD
  SNAPRAID_UI_PASSWORD
`;

const [arg] = Deno.args;
if (arg === "--version" || arg === "-v") {
  console.log(APP_VERSION);
  Deno.exit(0);
}
if (arg === "--help" || arg === "-h") {
  console.log(HELP);
  Deno.exit(0);
}
if (arg !== undefined) {
  console.error(`Unknown argument: ${arg}\n\n${HELP}`);
  Deno.exit(2);
}

// The repository's default (../snapraid next to backend/) means nothing for a binary
if (!Deno.env.get("SNAPRAID_BASE_PATH")) Deno.env.set("SNAPRAID_BASE_PATH", join(Deno.cwd(), "snapraid"));

await import("./main.ts");
