# Security

SnapRAID UI controls your array and runs with wide access to the host, so anyone who can use it can do a lot of damage. This page explains the built-in login, how to run behind a reverse or authentication proxy, and what you should and shouldn't expose.

## What access to the UI means

Treat access to SnapRAID UI like root access to your server:

- It runs SnapRAID commands that write to your disks, including `fix` to recover files or a whole disk, and sets the owner and permissions of the files it recovered.
- Its API reads and writes files by path inside the container, which runs as root. The config editor and file browser rely on this.
- In the recommended setup the container is privileged, which gives processes in it broad access to the host's devices.

So: **never expose SnapRAID UI directly to the internet.** Keep it on your home network, or reach it through a VPN (WireGuard, Tailscale) or a reverse proxy with HTTPS and authentication.

## Built-in login

The login is turned on by setting both environment variables:

```yaml
    environment:
      - SNAPRAID_UI_USERNAME=admin
      - SNAPRAID_UI_PASSWORD=a-long-random-password
```

If either one is missing, the login is off and the UI is open to anyone who can reach it. The backend logs `Login disabled` at startup in that case, and `Login enabled for user "<name>"` when it is on.

With the login on, every API request and the WebSocket need a valid session; without one the backend answers `401 Unauthorized` and the browser shows the login page. There is one user, with the credentials from the environment. Passwords are compared in constant time, and a wrong username takes as long to reject as a wrong password.

For Podman, the Quadlet unit reads the password from a Podman secret instead of plain text, see [Installation](installation.md#podman-quadlet).

### Sessions

After signing in, the browser gets a session cookie:

| Property | Value |
|---|---|
| Name | `snapraid_session` |
| Contents | A signed token (JWT, HS256) with the username and expiry |
| Lifetime | `SNAPRAID_UI_SESSION_HOURS`, default 168 hours (7 days) |
| Flags | `HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` when the request arrived over HTTPS (see [below](#behind-a-reverse-proxy)) |

Sessions are not stored on the server. The token is signed with a key made of the random `.session-secret` in the data directory and a hash of the username and password. That means:

- Sessions survive restarts and updates.
- **Changing the username or password ends all sessions.**
- Deleting `.session-secret` and restarting the container also ends all sessions.
- *Log out* (at the bottom of the sidebar) deletes the cookie in that browser. A copy of the token stays valid until it expires, so if you suspect a session was stolen, change the password.

When a session expires, the next request sends you back to the login page.

### Failed logins and lockout

To slow down password guessing:

- Every failed login waits half a second before it answers.
- After **5 failed attempts**, further logins from the same client address are refused for the rest of a **15-minute** window that starts with the first failure. The login page shows a countdown (*Too many failed attempts. Try again in …*).
- A successful login resets the counter for that address.

The counters are kept in memory, so restarting the container clears them.

The client address comes from the `X-Real-IP` header that the container's own Nginx sets to the address of whoever connected to it. Behind a reverse proxy, that is the proxy, so **all users share one counter**: five wrong passwords from anyone lock everyone out for up to 15 minutes. Restart the container if that locks you out.

## Behind a reverse proxy

A reverse proxy is the usual way to add HTTPS. Set it up as described in [Installation](installation.md#reverse-proxy-and-https), and keep these points in mind:

- **Only the proxy should reach the container.** Bind the port to localhost (`127.0.0.1:3000:80`) or use a shared Docker network without publishing a port.
- **Publish only port 80 of the container.** The backend also listens on port 8080 inside the container. Don't publish it: requests to it bypass the container's Nginx, so a client could set its own `X-Real-IP` header and escape the lockout.
- **The `Secure` cookie flag is not set behind a proxy.** The container's Nginx passes on the protocol of its own connection, which is plain HTTP from your proxy, so the backend can't tell that the browser used HTTPS. The cookie is still `HttpOnly` and `SameSite=Strict`. Configure your proxy to redirect HTTP to HTTPS, so the browser never sends the cookie unencrypted.

## Using an authentication proxy instead

If you already run an authentication proxy such as Authelia, Authentik or oauth2-proxy, you can leave the built-in login off and let the proxy handle sign-in:

1. Remove `SNAPRAID_UI_USERNAME` and `SNAPRAID_UI_PASSWORD`.
2. Make sure the container is reachable **only** through the proxy (see above). With the login off, anyone who reaches the container port directly has full access.
3. Protect the whole host name, including `/api` and `/ws`.

Without the built-in login, the sidebar shows no user and no *Log out* button.

## Cross-origin requests

The browser sends the session cookie only with requests from SnapRAID UI itself (`SameSite=Strict`), and the backend allows cross-origin requests with credentials only from pages on the same host name (such as the development frontend on another port). Together, this keeps other websites you visit from acting with your session.

## What is stored

Everything lives in the data directory, see [Configuration](configuration.md#data-directory). Security-relevant files:

| File | Contents | Protection |
|---|---|---|
| `.session-secret` | Key that signs sessions | Created with file mode `600` |
| `notifications.json` | Notification settings, including the SMTP password and ntfy token | Plain text. The API never sends them back to the browser; the form shows a placeholder instead. |
| `engine.json` | snapraid-daemon addresses and passwords | Plain text, file mode `600`. The API never sends the passwords back to the browser. |
| `config.json`, `schedules.json`, histories | Settings and disk data | Plain text |
| `logs/` | SnapRAID output, including file names from your disks | Plain text |

The login password itself is never written to disk; it only exists in the environment of the container.

A backup from *Download backup* contains the notification passwords and tokens in plain text. Keep backup files private.

## Checklist

- [ ] Login enabled with a long, random password, or an authentication proxy in front
- [ ] Not reachable from the internet, or only through a VPN or an HTTPS proxy
- [ ] Only container port 80 published, and only to the proxy if you use one
- [ ] Data directory and backup files readable only by you
- [ ] `--privileged` only if you need SMART data (see [Installation](installation.md#privileged-mode-and-smart))
