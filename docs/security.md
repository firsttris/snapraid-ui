# Security

SnapRAID UI controls your array and runs with wide access to the host, so anyone who can use it can do a lot of damage. This page explains the built-in login, how to run behind a reverse or authentication proxy, and what you should and shouldn't expose.

## What access to the UI means

Treat access to SnapRAID UI like root access to your server:

- It runs SnapRAID commands that write to your disks, including `fix` to recover files or a whole disk, and sets the owner and permissions of the files it recovered.
- Its API reads and writes files by path inside the container, which runs as root, or on the host with the [installer](installation.md#without-docker), whose service runs as root too. The config editor and file browser rely on this.
- In the recommended setup the container is privileged, which gives processes in it broad access to the host's devices. Without Docker there is no container around it at all.

So: **never expose SnapRAID UI directly to the internet.** Keep it on your home network, or reach it through a VPN (WireGuard, Tailscale) or a reverse proxy with HTTPS and authentication.

## Built-in login

The login is turned on by setting both environment variables:

```yaml
    environment:
      - SNAPRAID_UI_USERNAME=admin
      - SNAPRAID_UI_PASSWORD=a-long-random-password
```

If either one is missing, the login is off and the UI is open to anyone who can reach it. The backend logs `Login disabled` at startup in that case, and `Login enabled for user "<name>"` when it is on.

With the login on, every API request and the WebSocket need a valid session; without one the backend answers `401 Unauthorized` and the browser shows the login page. There is one user, with the username from the environment. Passwords are compared in constant time, and a wrong username takes as long to reject as a wrong password.

For Podman, the Quadlet unit reads the password from a Podman secret instead of plain text, see [Installation](installation.md#podman-quadlet).

### Changing the password

The key button next to *Log out* (at the bottom of the sidebar) opens *Sign-in*. Under *Password*, enter the current password and a new one with at least 12 characters. The new password:

- replaces the one from `SNAPRAID_UI_PASSWORD` until you change that variable,
- is stored as a PBKDF2-SHA256 hash (600,000 rounds) in `auth.json` in the data directory, never in plain text,
- ends every other session; the browser you changed it in stays signed in.

**Forgot the password?** Set a new `SNAPRAID_UI_PASSWORD` (or a new `SNAPRAID_UI_USERNAME`) and restart the container or the service. At startup the backend sees that `auth.json` belongs to other credentials, removes it and logs `SNAPRAID_UI_USERNAME or SNAPRAID_UI_PASSWORD changed`: the password from the environment applies again, and all passkeys are gone.

### Passkeys

A passkey signs you in with your fingerprint, face or device PIN instead of the password. Add one under *Sign-in* → *Passkeys* → *Add passkey*: give it a name, confirm with the password, and your browser or phone creates it. The login page then shows *Sign in with a passkey*. The password keeps working next to it.

- **WebAuthn needs HTTPS with a host name**, such as `https://nas.example.org` behind a [reverse proxy](#behind-a-reverse-proxy), or `http://localhost`. Over `http://` or an IP address (`http://192.168.1.10:3000`) the browser refuses passkeys, and *Sign-in* says so.
- A passkey belongs to the host name it was made on and only works there. Opening the UI under another name needs a passkey of its own.
- Adding one asks for the password again, so someone with a stolen session cannot add their own.
- A passkey login needs user verification (fingerprint, face or PIN) and counts against the same [lockout](#failed-logins-and-lockout) as a password login.
- Rename or delete passkeys in *Sign-in*. Setting a new `SNAPRAID_UI_PASSWORD` removes all of them (see above).

### Sessions

After signing in, the browser gets a session cookie:

| Property | Value |
|---|---|
| Name | `snapraid_session` |
| Contents | A signed token (JWT, HS256) with the username and expiry |
| Lifetime | `SNAPRAID_UI_SESSION_HOURS`, default 168 hours (7 days) |
| Flags | `HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` when the request arrived over HTTPS (see [below](#behind-a-reverse-proxy)) |

Sessions are not stored on the server. The token is signed with a key made of the random `.session-secret` in the data directory and a hash of the username and the password. That means:

- Sessions survive restarts and updates.
- **Changing the username or password ends all sessions**, in the environment or in *Sign-in* (there, the browser you changed it in stays signed in).
- Deleting `.session-secret` and restarting the container (or `systemctl restart snapraid-ui`) also ends all sessions.
- *Log out* (at the bottom of the sidebar) deletes the cookie in that browser. A copy of the token stays valid until it expires, so if you suspect a session was stolen, change the password.

When a session expires, the next request sends you back to the login page.

### Failed logins and lockout

To slow down password guessing:

- Every failed login waits half a second before it answers.
- Wrong passwords, unknown passkeys and a wrong password in *Sign-in* (to change it or add a passkey) all count.
- After **5 failed attempts**, further logins from the same client address are refused for the rest of a **15-minute** window that starts with the first failure. The login page shows a countdown (*Too many failed attempts. Try again in …*).
- A successful login resets the counter for that address.

The counters are kept in memory, so restarting the container or the service clears them.

The client address is the address of the connection, not a header a client could set. Behind a reverse proxy, that is the proxy, so **all users share one counter**: five wrong passwords from anyone lock everyone out for up to 15 minutes. Restart the container if that locks you out.

## Behind a reverse proxy

A reverse proxy is the usual way to add HTTPS. Set it up as described in [Installation](installation.md#reverse-proxy-and-https), and keep these points in mind:

- **Only the proxy should reach the container.** Bind the port to localhost (`127.0.0.1:3000:80`) or use a shared Docker network without publishing a port. Without Docker, set `SNAPRAID_UI_HOST=127.0.0.1` when the proxy runs on the same host, otherwise limit the port with a firewall.
- **Let the proxy send `X-Forwarded-Proto`.** The connection from your proxy is plain HTTP, so the backend only sets the `Secure` cookie flag when the proxy says the browser used HTTPS with `X-Forwarded-Proto: https`. Caddy and Traefik send it on their own, for Nginx add `proxy_set_header X-Forwarded-Proto $scheme;`. Without it the cookie is still `HttpOnly` and `SameSite=Strict`; configure your proxy to redirect HTTP to HTTPS either way, so the browser never sends the cookie unencrypted.

## Using an authentication proxy instead

If you already run an authentication proxy such as Authelia, Authentik or oauth2-proxy, you can leave the built-in login off and let the proxy handle sign-in:

1. Remove `SNAPRAID_UI_USERNAME` and `SNAPRAID_UI_PASSWORD`.
2. Make sure the container or service is reachable **only** through the proxy (see above). With the login off, anyone who reaches its port directly has full access.
3. Protect the whole host name, including `/api` and `/ws`.

Without the built-in login, the sidebar shows no user and no *Log out* button.

## Cross-origin requests

The browser sends the session cookie only with requests from SnapRAID UI itself (`SameSite=Strict`), and the backend allows cross-origin requests with credentials only from pages on the same host name (such as the development frontend on another port). Together, this keeps other websites you visit from acting with your session.

## What is stored

Everything lives in the data directory, see [Configuration](configuration.md#data-directory). Security-relevant files:

| File | Contents | Protection |
|---|---|---|
| `.session-secret` | Key that signs sessions | Created with file mode `600` |
| `auth.json` | The password set in *Sign-in* (PBKDF2 hash), the passkeys' public keys, and a hash of the environment credentials it belongs to | File mode `600`. Not part of a backup. |
| `notifications.json` | Notification settings, including the SMTP password and ntfy token | Plain text. The API never sends them back to the browser; the form shows a placeholder instead. |
| `engine.json` | snapraid-daemon addresses and passwords | Plain text, file mode `600`. The API never sends the passwords back to the browser. |
| `config.json`, `schedules.json`, histories | Settings and disk data | Plain text |
| `logs/` | SnapRAID output, including file names from your disks | Plain text |

The password from the environment is never written to disk; it only exists in the environment of the container. A password changed in *Sign-in* is stored only as a hash. The [installer](installation.md#without-docker) keeps it in `/etc/snapraid-ui/snapraid-ui.env`, readable only by root (file mode `600`).

A backup from *Download backup* contains the notification passwords and tokens in plain text. Keep backup files private.

## Checklist

- [ ] Login enabled with a long, random password (or passkeys, behind HTTPS), or an authentication proxy in front
- [ ] Not reachable from the internet, or only through a VPN or an HTTPS proxy
- [ ] Only container port 80 published, and only to the proxy if you use one; without Docker, `SNAPRAID_UI_HOST=127.0.0.1` or a firewall
- [ ] Data directory and backup files readable only by you
- [ ] Metrics and the MCP endpoint off, or their tokens kept private; the MCP endpoint's actions only allowed if you need them
- [ ] `--privileged` only if you need SMART data (see [Installation](installation.md#privileged-mode-and-smart))
