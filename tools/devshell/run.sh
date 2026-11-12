#!/bin/sh
# Runs Macr in an isolated, headless GNOME Shell: a private session bus,
# temporary XDG directories and GSettings in a keyfile, so nothing touches the
# real session or its settings. Your fonts are linked in so SF Pro renders.
# Stays in the foreground; stop it with stop.sh or Ctrl-C.
#
# Usage: tools/devshell/run.sh [--light]
# Needs the packed extension (npm run pack). Then use app.sh, eval.sh,
# shot.sh and stop.sh.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE="$ROOT/tools/devshell"
STATE="$ROOT/build/devshell"
UUID=macr@masrama.github.io
ZIP="$ROOT/build/$UUID.shell-extension.zip"

if [ -z "${MACR_DEVSHELL_INNER:-}" ]; then
    SCHEME=prefer-dark
    for arg in "$@"; do
        case "$arg" in
            --light) SCHEME=default ;;
            *) echo "unknown option: $arg" >&2; exit 2 ;;
        esac
    done
    [ -f "$ZIP" ] || { echo "missing $ZIP: run 'npm run pack'" >&2; exit 1; }

    rm -rf "$STATE"
    mkdir -p "$STATE/config/glib-2.0/settings" "$STATE/data/gnome-shell/extensions" \
        "$STATE/cache" "$STATE/runtime" "$ROOT/build/shots"
    chmod 700 "$STATE/runtime"

    EXT="$STATE/data/gnome-shell/extensions"
    unzip -q "$ZIP" -d "$EXT/$UUID"
    glib-compile-schemas "$EXT/$UUID/schemas"
    cp -r "$HERE/devtools@macr" "$EXT/"
    [ -d "$HOME/.local/share/fonts" ] && ln -s "$HOME/.local/share/fonts" "$STATE/data/fonts"
    # Your icon theme too, so the dock looks like it does in your session.
    [ -d "$HOME/.local/share/icons" ] && ln -s "$HOME/.local/share/icons" "$STATE/data/icons"
    ICON_THEME=$(gsettings get org.gnome.desktop.interface icon-theme 2>/dev/null || echo "'Adwaita'")
    # Dock favourites: the stock GNOME apps that are installed.
    FAVORITES=""
    for app in org.gnome.Nautilus org.gnome.TextEditor org.gnome.Calculator org.gnome.Terminal org.gnome.Software org.gnome.Settings; do
        [ -f "/usr/share/applications/$app.desktop" ] && FAVORITES="$FAVORITES${FAVORITES:+, }'$app.desktop'"
    done
    # A few recent files so Recent Items has something to show.
    mkdir -p "$STATE/home"
    for name in "Budget 2026.ods" "Trip notes.md" "Logo draft.svg"; do
        printf 'demo\n' > "$STATE/home/$name"
    done
    python3 -I - "$STATE" <<'PY'
import sys, urllib.parse, pathlib
state = pathlib.Path(sys.argv[1])
rows = []
for i, path in enumerate(sorted((state / 'home').iterdir())):
    uri = 'file://' + urllib.parse.quote(str(path))
    stamp = f'2026-11-12T0{i}:00:00Z'
    rows.append(f'  <bookmark href="{uri}" added="{stamp}" modified="{stamp}" visited="{stamp}"></bookmark>')
(state / 'data' / 'recently-used.xbel').write_text('<?xml version="1.0"?>\n<xbel version="1.0">\n' + '\n'.join(rows) + '\n</xbel>\n')
PY

    cat > "$STATE/config/glib-2.0/settings/keyfile" <<KEYFILE
[org/gnome/shell]
enabled-extensions=['devtools@macr', '$UUID']
disable-user-extensions=false
welcome-dialog-last-shown-version='999'
favorite-apps=[$FAVORITES]

[org/gnome/desktop/interface]
color-scheme='$SCHEME'
icon-theme=$ICON_THEME
clock-format='24h'
clock-show-weekday=true
KEYFILE

    # A bare session bus: no system service directories, so the shell does
    # not start gvfs, portals or evolution in here.
    mkdir -p "$STATE/services"
    cat > "$STATE/bus.conf" <<BUSCONF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:dir=$STATE/runtime</listen>
  <auth>EXTERNAL</auth>
  <servicedir>$STATE/services</servicedir>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
BUSCONF

    exec env -u DISPLAY -u WAYLAND_DISPLAY -u GNOME_SETUP_DISPLAY \
        MACR_DEVSHELL_INNER=1 \
        XDG_CONFIG_HOME="$STATE/config" XDG_DATA_HOME="$STATE/data" \
        XDG_CACHE_HOME="$STATE/cache" XDG_RUNTIME_DIR="$STATE/runtime" \
        GSETTINGS_BACKEND=keyfile \
        dbus-run-session --config-file="$STATE/bus.conf" -- "$0"
fi

# Inside the private bus from here on.
SHELL_PID=""
cleanup() {
    if [ -n "$SHELL_PID" ]; then kill "$SHELL_PID" 2>/dev/null || true; fi
    rm -f "$STATE/bus" "$STATE/run.pid"
}
trap cleanup EXIT
trap 'exit 0' INT TERM
echo "$$" > "$STATE/run.pid"

# The shell's system bus is this bus too: it never talks to the real logind.
DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" gnome-shell --headless --wayland --no-x11 \
    --virtual-monitor 1920x1080 --wayland-display macr-devshell > "$STATE/shell.log" 2>&1 &
SHELL_PID=$!

i=0
until gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
    --method org.freedesktop.DBus.NameHasOwner org.gnome.Shell.Screenshot 2>/dev/null | grep -q true; do
    i=$((i + 1))
    [ "$i" -le 150 ] || { echo "timed out waiting for the shell (see $STATE/shell.log)" >&2; exit 1; }
    sleep 0.2
done
echo "$DBUS_SESSION_BUS_ADDRESS" > "$STATE/bus"
echo "devshell ready"
wait "$SHELL_PID"
