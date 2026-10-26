// Passkeys (WebAuthn) as a second way into the login, next to the password:
// - A passkey is bound to the host name it was made on (the relying party ID). WebAuthn needs
//   HTTPS (or localhost) and a name, not an IP address, so passkeys only work there.
// - A passkey login needs user verification (fingerprint, face, device PIN) and counts against the
//   same lockout as a password login.
// - Adding one asks for the password again, so a stolen session cannot plant its own.
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { PasskeyInfo } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";
import { type CredentialStore, fromBase64Url, type StoredPasskey, toBase64Url } from "./credentials.ts";

const RP_NAME = "SnapRAID UI";
const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGES = 1000;
// Open challenges per session (registration) or client address (login): asking for more drops
// the oldest of the same one, so a client flooding the login cannot push out anyone else's
const MAX_CHALLENGES_PER_OWNER = 20;
export const MAX_NAME_LENGTH = 64;

/** A refusal with the HTTP status and a message for the UI */
export class AuthError extends Error {
  constructor(public status: 400 | 401 | 403 | 404, message: string) {
    super(message);
  }
}

const isIpAddress = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");

/**
 * The page's origin and host name, from the Origin header the browser sets on every POST.
 * Throws when WebAuthn cannot work there: plain HTTP other than localhost, or an IP address.
 */
export const relyingParty = (originHeader: string | undefined): { origin: string; rpId: string } => {
  let url: URL;
  try {
    url = new URL(originHeader ?? "");
  } catch {
    throw new AuthError(400, msg("server_error_passkey_unsupported_origin"));
  }
  const rpId = url.hostname;
  const secure = url.protocol === "https:" || rpId === "localhost";
  if (!secure || isIpAddress(rpId)) throw new AuthError(400, msg("server_error_passkey_unsupported_origin"));
  return { origin: url.origin, rpId };
};

export const cleanName = (name: unknown): string => {
  const cleaned = typeof name === "string" ? name.trim() : "";
  if (!cleaned) throw new AuthError(400, msg("server_error_passkey_name_required"));
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new AuthError(400, msg("server_error_passkey_name_too_long", { max: MAX_NAME_LENGTH }));
  }
  return cleaned;
};

const info = ({ id, name, rpId, createdAt, lastUsedAt }: StoredPasskey): PasskeyInfo => ({
  id,
  name,
  rpId,
  createdAt,
  lastUsedAt,
});

/** Reads the challenge a response signed, from its clientDataJSON */
const signedChallenge = (clientDataJSON: unknown): string => {
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(String(clientDataJSON)))) as { challenge?: unknown };
    return typeof data.challenge === "string" ? data.challenge : "";
  } catch {
    return "";
  }
};

type Purpose = "login" | "register";

export const createPasskeys = (store: CredentialStore, username: string) => {
  // Each options request hands out a fresh challenge that a response may use once, within five
  // minutes. A registration challenge is tied to the session that asked for it, a login challenge
  // to the client address. Kept apart, so login requests, which need no session, cannot push out
  // a registration.
  type Challenge = { owner: string; rpId: string; expiresAt: number };
  const challenges: Record<Purpose, Map<string, Challenge>> = { login: new Map(), register: new Map() };

  const rememberChallenge = (purpose: Purpose, challenge: string, entry: { owner: string; rpId: string }) => {
    const pending = challenges[purpose];
    const now = Date.now();
    for (const [key, value] of pending) if (value.expiresAt < now) pending.delete(key);
    const own = [...pending].filter(([, value]) => value.owner === entry.owner);
    if (own.length >= MAX_CHALLENGES_PER_OWNER) pending.delete(own[0][0]);
    if (pending.size >= MAX_CHALLENGES) pending.delete(pending.keys().next().value!);
    pending.set(challenge, { ...entry, expiresAt: now + CHALLENGE_TTL_MS });
  };

  /** Takes a challenge out of the store if it fits; a challenge never works twice */
  const takeChallenge = (purpose: Purpose, challenge: string, rpId: string, sessionId?: string): boolean => {
    const pending = challenges[purpose];
    const entry = pending.get(challenge);
    if (!entry) return false;
    pending.delete(challenge);
    return entry.rpId === rpId && (purpose === "login" || entry.owner === sessionId) && entry.expiresAt > Date.now();
  };

  const find = (id: string): StoredPasskey => {
    const passkey = store.passkeys().find((p) => p.id === id);
    if (!passkey) throw new AuthError(404, msg("server_error_passkey_not_found"));
    return passkey;
  };

  const list = (): PasskeyInfo[] => [...store.passkeys()].sort((a, b) => a.createdAt - b.createdAt).map(info);

  const rename = async (id: string, name: unknown): Promise<void> => {
    const cleaned = cleanName(name);
    find(id);
    await store.setPasskeys(store.passkeys().map((p) => (p.id === id ? { ...p, name: cleaned } : p)));
  };

  const remove = async (id: string): Promise<void> => {
    find(id);
    await store.setPasskeys(store.passkeys().filter((p) => p.id !== id));
  };

  const registrationOptions = async (
    origin: string | undefined,
    sessionId: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> => {
    const { rpId } = relyingParty(origin);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId,
      userID: fromBase64Url(store.userId()),
      userName: username,
      userDisplayName: `${username} (${rpId})`,
      attestationType: "none",
      // The same authenticator twice makes no sense: the browser says it already has one
      excludeCredentials: store.passkeys().filter((p) => p.rpId === rpId).map((p) => ({
        id: p.id,
        transports: p.transports,
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    rememberChallenge("register", options.challenge, { owner: sessionId, rpId });
    return options;
  };

  const register = async (
    origin: string | undefined,
    sessionId: string,
    response: RegistrationResponseJSON | undefined,
    name: unknown,
  ): Promise<PasskeyInfo> => {
    const cleanedName = cleanName(name);
    const rp = relyingParty(origin);
    const challenge = signedChallenge(response?.response?.clientDataJSON);
    if (!response || !takeChallenge("register", challenge, rp.rpId, sessionId)) {
      throw new AuthError(400, msg("server_error_passkey_expired"));
    }
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpId,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new AuthError(400, msg("server_error_passkey_invalid", { reason: (error as Error).message }));
    }
    if (!verification.verified) throw new AuthError(400, msg("server_error_passkey_invalid", { reason: "" }));
    const { credential } = verification.registrationInfo;
    const passkey: StoredPasskey = {
      id: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      ...(credential.transports ? { transports: credential.transports } : {}),
      rpId: rp.rpId,
      name: cleanedName,
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    await store.setPasskeys([...store.passkeys().filter((p) => p.id !== passkey.id), passkey]);
    return info(passkey);
  };

  const loginOptions = async (
    origin: string | undefined,
    client: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> => {
    const { rpId } = relyingParty(origin);
    // No allowCredentials: the browser offers the passkeys it holds for this host
    const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: "required" });
    rememberChallenge("login", options.challenge, { owner: client, rpId });
    return options;
  };

  /** Checks a login response; true when it is a valid assertion of a stored passkey */
  const verifyLogin = async (
    origin: string | undefined,
    response: AuthenticationResponseJSON | undefined,
  ): Promise<boolean> => {
    const rp = relyingParty(origin);
    const challenge = signedChallenge(response?.response?.clientDataJSON);
    if (!response || !takeChallenge("login", challenge, rp.rpId)) {
      throw new AuthError(400, msg("server_error_passkey_expired"));
    }
    const passkey = store.passkeys().find((p) => p.id === response.id);
    if (!passkey || passkey.rpId !== rp.rpId) return false;
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpId,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: fromBase64Url(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransport[] | undefined,
        },
      });
    } catch {
      return false;
    }
    if (!verification.verified) return false;
    await store.setPasskeys(
      store.passkeys().map((p) =>
        p.id === passkey.id ? { ...p, counter: verification.authenticationInfo.newCounter, lastUsedAt: Date.now() } : p
      ),
    );
    return true;
  };

  return {
    any: () => store.passkeys().length > 0,
    list,
    rename,
    remove,
    registrationOptions,
    register,
    loginOptions,
    verifyLogin,
  };
};
