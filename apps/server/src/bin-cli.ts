// The command line of the standalone binary (bin.ts): --version and --help, and the data directory
// when none is set, before main.ts's modules read the environment
import { join } from "node:path";
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

const [arg] = process.argv.slice(2);
if (arg === "--version" || arg === "-v") {
  console.log(APP_VERSION);
  process.exit(0);
}
if (arg === "--help" || arg === "-h") {
  console.log(HELP);
  process.exit(0);
}
if (arg !== undefined) {
  console.error(`Unknown argument: ${arg}\n\n${HELP}`);
  process.exit(2);
}

// The repository's default (snapraid/ in the repository's root) means nothing for a binary
if (!process.env.SNAPRAID_BASE_PATH) process.env.SNAPRAID_BASE_PATH = join(process.cwd(), "snapraid");
