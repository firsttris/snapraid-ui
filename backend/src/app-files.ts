// Files of SnapRAID UI outside backend/: the built frontend, its package.json (the version) and the
// documentation. In the repository and the image they sit next to backend/; the standalone binary
// (scripts/build-binary.sh) embeds them at the same paths in its own file system, /$bunfs/root/
const COMPILED = import.meta.url.startsWith("file:///$bunfs/");

const ROOT = COMPILED ? new URL("file:///$bunfs/root/") : new URL("../../", import.meta.url);

/**
 * A file of the app by its path from the repository's root, e.g. "frontend/package.json"
 */
export const appFile = (path: string): URL => new URL(path, ROOT);
