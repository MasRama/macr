#!/bin/sh
# Starts an app inside the devshell, in the background. Example:
#   tools/devshell/app.sh gnome-text-editor
set -eu
. "$(dirname "$0")/env.sh"
env -u DISPLAY WAYLAND_DISPLAY=macr-devshell XDG_RUNTIME_DIR="$STATE/runtime" \
    XDG_CONFIG_HOME="$STATE/config" XDG_DATA_HOME="$STATE/data" XDG_CACHE_HOME="$STATE/cache" \
    GSETTINGS_BACKEND=keyfile GDK_BACKEND=wayland HOME="$STATE/home" \
    "$@" > "$STATE/app.log" 2>&1 &
echo "started $1"
