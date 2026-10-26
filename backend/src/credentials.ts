// What the login keeps next to the app data, in auth.json (file mode 600): the password set in
// the UI and the passkeys. SNAPRAID_UI_USERNAME and SNAPRAID_UI_PASSWORD stay the starting point:
// - Until the password is changed in the UI, the one from the environment is the password.
// - The file remembers which environment credentials it was made with (a PBKDF2 hash). When
//   SNAPRAID_UI_USERNAME or SNAPRAID_UI_PASSWORD change, the file is dropped at startup: the
//   password from the environment applies again and the passkeys are gone. That is the way back
//   in after a forgotten password, and it removes a passkey someone else added.
import { writeTextFileAtomic } from "./atomic-write.ts";

export interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  // The host name it was made on (WebAuthn relying party ID)
  rpId: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface CredentialFile {
  // PBKDF2 hash of the environment's username and password the file belongs to
  environment: string;
  // PBKDF2 hash of the password set in the UI, missing until it is changed there
  password?: string;
  // Random WebAuthn user handle of the one user
  userId: string;
  passkeys: StoredPasskey[];
}

export interface CredentialStore {
  /** The PBKDF2 hash of the password set in the UI, or null while the environment's applies */
  passwordHash: () => string | null;
  userId: () => string;
  passkeys: () => StoredPasskey[];
  setPassword: (hash: string) => Promise<void>;
  setPasskeys: (passkeys: StoredPasskey[]) => Promise<void>;
}

// OWASP's recommendation for PBKDF2-HMAC-SHA256; about a third of a second on a small NAS
const PBKDF2_ITERATIONS = 600_000;

const encoder = new TextEncoder();

export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

export const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

const derive = async (password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
};

/** "pbkdf2-sha256$<iterations>$<salt>$<hash>", salt and hash in base64url */
export const hashPassword = async (password: string, iterations = PBKDF2_ITERATIONS): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(await derive(password, salt, iterations))}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, rounds, salt, hash] = stored.split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  const expected = fromBase64Url(hash);
  const actual = await derive(password, fromBase64Url(salt), iterations);
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
};

const environmentSecret = (username: string, password: string) => `${username}\0${password}`;

const isCredentialFile = (value: unknown): value is CredentialFile => {
  const file = value as CredentialFile;
  return typeof file?.environment === "string" && typeof file.userId === "string" && Array.isArray(file.passkeys);
};

/**
 * The credentials in `path`, or kept in memory only without one (tests). Drops the file when it
 * belongs to other environment credentials, see the top of this file.
 */
export const loadCredentials = async (
  path: string | null,
  username: string,
  envPassword: string,
  options: { iterations?: number } = {},
): Promise<CredentialStore> => {
  let file: CredentialFile | null = null;
  if (path) {
    try {
      const parsed: unknown = JSON.parse(await Deno.readTextFile(path));
      if (isCredentialFile(parsed) && await verifyPassword(environmentSecret(username, envPassword), parsed.environment)) {
        file = parsed;
      } else {
        await Deno.remove(path);
        console.log(
          "🔑 SNAPRAID_UI_USERNAME or SNAPRAID_UI_PASSWORD changed: the password from the environment applies again, passkeys were removed",
        );
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }

  // Made once and kept with the passkeys; the same before the file exists, for a registration
  const userId = file?.userId ?? toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

  const current = async (): Promise<CredentialFile> =>
    file ?? {
      environment: await hashPassword(environmentSecret(username, envPassword), options.iterations),
      userId,
      passkeys: [],
    };

  const save = async (next: CredentialFile) => {
    if (path) await writeTextFileAtomic(path, JSON.stringify(next, null, 2), { mode: 0o600 });
    file = next;
  };

  return {
    passwordHash: () => file?.password ?? null,
    userId: () => userId,
    passkeys: () => file?.passkeys ?? [],
    setPassword: async (hash) => save({ ...(await current()), password: hash }),
    setPasskeys: async (passkeys) => save({ ...(await current()), passkeys }),
  };
};
