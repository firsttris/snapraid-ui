// The version of SnapRAID UI, the one in apps/web/package.json that the release raises. The image
// and the binary carry that file next to the frontend's build; SNAPRAID_UI_VERSION overrides it
import { readFile } from "node:fs/promises";
import { appFile } from "./app-files.ts";

export const PACKAGE_JSON = appFile("apps/web/package.json");

export const readVersion = async (packageJson: URL = PACKAGE_JSON): Promise<string> => {
  const override = process.env.SNAPRAID_UI_VERSION;
  if (override) return override;
  try {
    const { version } = JSON.parse(await readFile(packageJson, "utf8"));
    return typeof version === "string" ? version : "";
  } catch {
    return "";
  }
};

export const APP_VERSION = await readVersion();
