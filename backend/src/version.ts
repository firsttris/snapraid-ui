// The version of SnapRAID UI, the one in frontend/package.json that the release raises. The image
// and the binary carry that file next to the frontend's build; SNAPRAID_UI_VERSION overrides it
export const PACKAGE_JSON = new URL("../../frontend/package.json", import.meta.url);

export const readVersion = async (packageJson: URL = PACKAGE_JSON): Promise<string> => {
  const override = Deno.env.get("SNAPRAID_UI_VERSION");
  if (override) return override;
  try {
    const { version } = JSON.parse(await Deno.readTextFile(packageJson));
    return typeof version === "string" ? version : "";
  } catch {
    return "";
  }
};

export const APP_VERSION = await readVersion();
