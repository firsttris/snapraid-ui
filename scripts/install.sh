#!/bin/sh
# Installs SnapRAID UI on a Linux host without Docker: the standalone binary from the GitHub
# release, SnapRAID 14+ and smartctl when missing, a systemd service. Running it again updates.
#
#   curl -fsSL https://github.com/firsttris/snapraid-ui/releases/latest/download/install.sh | sudo sh
#   ... | sudo sh -s -- --uninstall      stops and removes the service and the binary, keeps the data
#
# Settings, as environment variables (sudo env NAME=value sh, or after `sh -s --`):
#   SNAPRAID_UI_VERSION         release to install, e.g. 1.3.0 (default: the latest)
#   SNAPRAID_UI_PORT            port of the UI on the first install (default 3000)
#   SNAPRAID_UI_SKIP_SNAPRAID   1: don't check, install or build SnapRAID
#   SNAPRAID_UI_DOWNLOAD_URL    where the binaries and SHA256SUMS are (default: the GitHub release)
set -eu

REPO="firsttris/snapraid-ui"
BIN=/usr/local/bin/snapraid-ui
CONF_DIR=/etc/snapraid-ui
ENV_FILE=$CONF_DIR/snapraid-ui.env
DATA_DIR=/var/lib/snapraid-ui
UNIT=/etc/systemd/system/snapraid-ui.service
# Built from source when the host has no SnapRAID 14+; the version the image ships (docker/Dockerfile)
SNAPRAID_VERSION=15.0
SNAPRAID_MIN_MAJOR=14

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mWarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

has_systemd() { [ -d /run/systemd/system ] && has systemctl; }

usage() {
  cat <<EOF
Installs or updates SnapRAID UI with a systemd service; --uninstall removes it, keeping the data.
Settings: SNAPRAID_UI_VERSION, SNAPRAID_UI_PORT, SNAPRAID_UI_SKIP_SNAPRAID, SNAPRAID_UI_DOWNLOAD_URL
See https://firsttris.github.io/snapraid-ui/installation.html#without-docker
EOF
}

# --- Packages ---------------------------------------------------------------

PKG=""
if has apt-get; then PKG=apt
elif has dnf; then PKG=dnf
elif has yum; then PKG=yum
elif has zypper; then PKG=zypper
elif has pacman; then PKG=pacman
elif has apk; then PKG=apk
fi

APT_UPDATED=""
pkg_install() {
  case "$PKG" in
    apt)
      [ -n "$APT_UPDATED" ] || { apt-get update -qq; APT_UPDATED=1; }
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" ;;
    dnf) dnf install -y -q "$@" ;;
    yum) yum install -y -q "$@" ;;
    zypper) zypper --non-interactive --quiet install "$@" ;;
    pacman) pacman -S --noconfirm --needed "$@" ;;
    apk) apk add --quiet "$@" ;;
    *) return 1 ;;
  esac
}

# --- Download ---------------------------------------------------------------

fetch() { # url file
  if has curl; then curl -fsSL --retry 3 -o "$2" "$1" || die "Download failed: $1"
  elif has wget; then wget -q -O "$2" "$1" || die "Download failed: $1"
  else die "curl or wget is needed"
  fi
}

download_url() {
  if [ -n "${SNAPRAID_UI_DOWNLOAD_URL:-}" ]; then echo "${SNAPRAID_UI_DOWNLOAD_URL%/}"
  elif [ -n "${SNAPRAID_UI_VERSION:-}" ]; then echo "https://github.com/$REPO/releases/download/v${SNAPRAID_UI_VERSION#v}"
  else echo "https://github.com/$REPO/releases/latest/download"
  fi
}

# --- SnapRAID ---------------------------------------------------------------

# Major version of a SnapRAID binary, empty when it does not run: "SnapRAID CLI v15.0 by ..."
# since 15, "snapraid v12.2 by ..." before
snapraid_major() {
  "$1" --version 2>/dev/null | head -n 1 | sed -n 's/.* v\([0-9][0-9]*\)\..*/\1/p'
}

# The SnapRAID to use: one on the host when it is new enough, otherwise built from source
ensure_snapraid() {
  checked=""
  for candidate in /usr/local/bin/snapraid "$(command -v snapraid 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && [ "$candidate" != "$checked" ] || continue
    checked=$candidate
    major=$(snapraid_major "$candidate")
    if [ -n "$major" ] && [ "$major" -ge "$SNAPRAID_MIN_MAJOR" ]; then
      SNAPRAID_BIN=$candidate
      say "Using SnapRAID $major.x at $candidate"
      return
    fi
    [ -n "$major" ] && say "$candidate is SnapRAID $major.x, SnapRAID UI needs $SNAPRAID_MIN_MAJOR.0 or newer"
  done

  say "Building SnapRAID $SNAPRAID_VERSION from source into /usr/local/bin"
  if ! has gcc || ! has make; then
    case "$PKG" in
      apt) pkg_install gcc make libc6-dev ;;
      dnf | yum) pkg_install gcc make glibc-devel ;;
      zypper) pkg_install gcc make glibc-devel ;;
      pacman) pkg_install gcc make ;;
      apk) pkg_install gcc make musl-dev ;;
      *) die "gcc and make are needed to build SnapRAID; install them, or SnapRAID $SNAPRAID_MIN_MAJOR+ yourself" ;;
    esac
  fi
  src=$(mktemp -d)
  fetch "https://github.com/amadvance/snapraid/releases/download/v$SNAPRAID_VERSION/snapraid-$SNAPRAID_VERSION.tar.gz" "$src/snapraid.tar.gz"
  tar -xzf "$src/snapraid.tar.gz" -C "$src"
  (cd "$src/snapraid-$SNAPRAID_VERSION" && ./configure >/dev/null && make -j"$(nproc 2>/dev/null || echo 2)" >/dev/null)
  if [ -e /usr/local/bin/snapraid ]; then
    mv -f /usr/local/bin/snapraid /usr/local/bin/snapraid.old
    say "Kept the old /usr/local/bin/snapraid as /usr/local/bin/snapraid.old"
  fi
  install -m 0755 "$src/snapraid-$SNAPRAID_VERSION/snapraid" /usr/local/bin/snapraid
  rm -rf "$src"
  SNAPRAID_BIN=/usr/local/bin/snapraid
}

# SnapRAID calls smartctl for smart, probe and down
ensure_smartctl() {
  has smartctl && return
  say "Installing smartmontools (smartctl, for SMART data and the disk power state)"
  pkg_install smartmontools || warn "Could not install smartmontools; SMART data and spin down need smartctl"
}

# --- Install ----------------------------------------------------------------

install_binary() {
  case "$(uname -m)" in
    x86_64 | amd64) arch=x86_64 ;;
    aarch64 | arm64) arch=aarch64 ;;
    *) die "No binary for $(uname -m); use the Docker image (amd64, arm64)" ;;
  esac
  url=$(download_url)
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  say "Downloading snapraid-ui-linux-$arch from $url"
  fetch "$url/snapraid-ui-linux-$arch" "$tmp/snapraid-ui-linux-$arch"
  fetch "$url/SHA256SUMS" "$tmp/SHA256SUMS"
  if has sha256sum; then
    (cd "$tmp" && grep " snapraid-ui-linux-$arch\$" SHA256SUMS | sha256sum -c - >/dev/null) ||
      die "Checksum mismatch for snapraid-ui-linux-$arch"
  else
    warn "sha256sum not found, the download is not verified"
  fi
  chmod 0755 "$tmp/snapraid-ui-linux-$arch"
  "$tmp/snapraid-ui-linux-$arch" --version >/dev/null || die "The downloaded binary does not run on this host"
  # Replaced by a rename, so a running service keeps its old file until the restart
  mv -f "$tmp/snapraid-ui-linux-$arch" "$BIN.new"
  mv -f "$BIN.new" "$BIN"
  say "Installed SnapRAID UI $("$BIN" --version) at $BIN"
}

random_password() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20
}

# Settings of the service, written once; later runs keep your changes
write_env_file() {
  mkdir -p "$CONF_DIR" "$DATA_DIR"
  if [ -f "$ENV_FILE" ]; then
    # A SnapRAID built by an earlier run or found now stays the one the service runs
    if [ -n "${SNAPRAID_BIN:-}" ] && ! grep -q '^SNAPRAID_BIN=' "$ENV_FILE"; then
      echo "SNAPRAID_BIN=$SNAPRAID_BIN" >>"$ENV_FILE"
    fi
    return
  fi
  PASSWORD=$(random_password)
  umask 077
  cat >"$ENV_FILE" <<EOF
# Settings of SnapRAID UI, see https://firsttris.github.io/snapraid-ui/configuration.html
# Apply changes with: systemctl restart snapraid-ui
PORT=${SNAPRAID_UI_PORT:-3000}
SNAPRAID_BASE_PATH=$DATA_DIR
${SNAPRAID_BIN:+SNAPRAID_BIN=$SNAPRAID_BIN}
# Login; remove both lines to leave the UI open (e.g. behind your own auth proxy)
SNAPRAID_UI_USERNAME=admin
SNAPRAID_UI_PASSWORD=$PASSWORD
# SNAPRAID_UI_SESSION_HOURS=168
EOF
  umask 022
  CREATED_PASSWORD=$PASSWORD
}

write_unit() {
  cat >"$UNIT" <<EOF
[Unit]
Description=SnapRAID UI
Documentation=https://firsttris.github.io/snapraid-ui/
Wants=network-online.target
After=network-online.target local-fs.target

[Service]
EnvironmentFile=$ENV_FILE
ExecStart=$BIN
WorkingDirectory=$DATA_DIR
# SnapRAID reads and writes the disks, smartctl and spin down need the devices
User=root
Restart=on-failure
RestartSec=5
# A running sync or scrub gets time to stop cleanly
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

# Until the health check answers, at most 30 seconds
wait_healthy() {
  i=0
  while [ "$i" -lt 30 ]; do
    if has curl; then curl -fsS -o /dev/null "http://127.0.0.1:$1/api/health" 2>/dev/null && return 0
    else wget -q -O /dev/null "http://127.0.0.1:$1/api/health" 2>/dev/null && return 0
    fi
    systemctl is-failed --quiet snapraid-ui && return 1
    i=$((i + 1))
    sleep 1
  done
  return 1
}

do_install() {
  [ "$(uname -s)" = Linux ] || die "SnapRAID UI runs on Linux"
  [ "$(id -u)" -eq 0 ] || die "Run as root, e.g.: curl -fsSL https://github.com/$REPO/releases/latest/download/install.sh | sudo sh"

  UPDATE=""
  [ -x "$BIN" ] && UPDATE=1

  install_binary
  if [ "${SNAPRAID_UI_SKIP_SNAPRAID:-}" != 1 ]; then
    ensure_snapraid
    ensure_smartctl
  fi
  CREATED_PASSWORD=""
  write_env_file
  port=$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1)

  if ! has_systemd; then
    echo
    warn "No systemd, so no service was set up. Start it with:"
    echo "  set -a; . $ENV_FILE; set +a; cd $DATA_DIR; $BIN"
    [ -z "$CREATED_PASSWORD" ] || echo "  Login:     admin / $CREATED_PASSWORD"
    return
  fi
  write_unit
  if [ -n "$UPDATE" ]; then
    systemctl restart snapraid-ui
  else
    systemctl enable --now snapraid-ui >/dev/null 2>&1
  fi
  wait_healthy "${port:-3000}" || die "The service did not start, see: journalctl -u snapraid-ui"

  echo
  if [ -n "$UPDATE" ]; then
    say "SnapRAID UI updated and restarted"
  else
    say "SnapRAID UI is running at http://$(hostname 2>/dev/null || echo localhost):${port:-3000}"
  fi
  if [ -n "$CREATED_PASSWORD" ]; then
    echo "  Login:     admin / $CREATED_PASSWORD"
  fi
  echo "  Settings:  $ENV_FILE (then: systemctl restart snapraid-ui)"
  echo "  Data:      $DATA_DIR (config.json, schedules, logs; put your snapraid.conf here or set up an array in the UI)"
  echo "  Logs:      journalctl -u snapraid-ui -f"
  echo "  Update:    run this installer again"
}

do_uninstall() {
  [ "$(id -u)" -eq 0 ] || die "Run as root"
  if has_systemd && [ -f "$UNIT" ]; then
    systemctl disable --now snapraid-ui >/dev/null 2>&1 || true
    rm -f "$UNIT"
    systemctl daemon-reload
  fi
  rm -f "$BIN"
  say "SnapRAID UI removed. Kept: $DATA_DIR (your data), $ENV_FILE and SnapRAID; delete them yourself if you no longer need them"
}

case "${1:-}" in
  "") do_install ;;
  --uninstall) do_uninstall ;;
  -h | --help) usage ;;
  *) die "Unknown option: $1 (use --uninstall or --help)" ;;
esac
