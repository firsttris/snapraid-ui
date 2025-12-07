import { join } from "@std/path";

export const BASE_PATH = Deno.env.get("SNAPRAID_BASE_PATH") || join(Deno.cwd(), "..", "snapraid");