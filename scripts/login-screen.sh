#!/bin/sh
# Gives the GDM login screen Macr's macOS look, or takes it away again.
#
#   sudo scripts/login-screen.sh install [macr.zip | extension folder]
#   sudo scripts/login-screen.sh uninstall
#   scripts/login-screen.sh status
#
# GDM runs its own GNOME Shell as the gdm user, which never loads your
# extensions. install copies Macr into the gdm user's extension folder and
# turns it on in GDM's settings (a file of its own next to GDM's defaults),
# with your clock format, your wallpaper and the SF Pro fonts from your home
# folder, which the gdm user cannot read. Without an argument it copies the
# Macr you have installed. Run it again after updating Macr or changing your
# wallpaper. The login screen changes the next time it shows, after you log
# out. uninstall removes all of it.
#
# If the login screen ever breaks, switch to a text console (Ctrl+Alt+F3),
# log in and run: sudo scripts/login-screen.sh uninstall
# (or remove the folder printed by status by hand).
#
# Tested on Ubuntu 24.04 based systems (GDM 46). For testing the script
# itself, MACR_GDM_HOME, MACR_GDM_USER and MACR_GDM_DCONF point it at other
# places and let it run without root.
set -eu

UUID=macr@masrama.github.io
GDM_USER=${MACR_GDM_USER:-gdm}

die() { echo "login-screen.sh: $*" >&2; exit 1; }

GDM_HOME=${MACR_GDM_HOME:-$(getent passwd "$GDM_USER" | cut -d: -f6)}
case "$GDM_HOME" in
    /?*) ;;
    *) die "no home folder for the '$GDM_USER' user: is GDM installed?" ;;
esac
EXT_DIR="$GDM_HOME/.local/share/gnome-shell/extensions"
DEST="$EXT_DIR/$UUID"
FILES="$GDM_HOME/.local/share/macr"
FONTS="$GDM_HOME/.local/share/fonts/macr"

# GDM's settings: Debian and Ubuntu compile /usr/share/gdm/dconf, Fedora and
# others /etc/dconf/db/gdm.d.
if [ -n "${MACR_GDM_DCONF:-}" ]; then
    DCONF_DIR=$MACR_GDM_DCONF
    REBUILD=true
elif [ -x /usr/share/gdm/generate-config ]; then
    DCONF_DIR=/usr/share/gdm/dconf
    REBUILD=/usr/share/gdm/generate-config
elif [ -d /etc/dconf/db/gdm.d ]; then
    DCONF_DIR=/etc/dconf/db/gdm.d
    REBUILD="dconf update"
else
    die "cannot find GDM's settings folder"
fi
SETTINGS="$DCONF_DIR/95-macr-settings"

need_root() {
    [ -n "${MACR_GDM_HOME:-}" ] && return
    [ "$(id -u)" = 0 ] || die "run it with sudo"
}

# The user whose Macr, clock format, wallpaper and fonts are used.
if [ "$(id -u)" = 0 ] && [ -z "${MACR_GDM_HOME:-}" ]; then
    USER_NAME=${SUDO_USER:-}
else
    USER_NAME=$(id -un)
fi
USER_HOME=""
[ -n "$USER_NAME" ] && USER_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)

as_user() {
    if [ "$(id -u)" = 0 ] && [ "$USER_NAME" != root ]; then
        runuser -u "$USER_NAME" -- env HOME="$USER_HOME" "$@"
    else
        "$@"
    fi
}

# A folder owned by the gdm user, with each missing parent too.
gdm_dir() {
    missing=""
    dir=$1
    while [ ! -d "$dir" ]; do
        missing="$dir $missing"
        dir=$(dirname "$dir")
    done
    for dir in $missing; do
        mkdir "$dir"
        chown "$GDM_USER:$GDM_USER" "$dir"
    done
}

install_macr() {
    need_root
    [ -n "$USER_HOME" ] || die "run it with sudo from your own account"
    source=${1:-$USER_HOME/.local/share/gnome-shell/extensions/$UUID}

    rm -rf "$DEST"
    gdm_dir "$EXT_DIR"
    mkdir "$DEST"
    if [ -d "$source" ]; then
        cp -r "$source/." "$DEST/"
    elif [ -f "$source" ]; then
        unzip -q "$source" -d "$DEST"
    else
        die "no Macr at $source: install Macr first or name its zip"
    fi
    [ -f "$DEST/metadata.json" ] || die "$source holds no extension"
    grep -q '"gdm"' "$DEST/metadata.json" || die "this Macr is too old for the login screen"
    glib-compile-schemas "$DEST/schemas"
    chown -R "$GDM_USER:$GDM_USER" "$DEST"

    # The wallpaper: one in your home folder is copied where GDM can read it.
    scheme=$(as_user gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null || echo "'default'")
    key=picture-uri
    [ "$scheme" = "'prefer-dark'" ] && key=picture-uri-dark
    uri=$(as_user gsettings get org.gnome.desktop.background "$key" 2>/dev/null | tr -d "'" || true)
    path=$(python3 -c 'import sys, urllib.parse; u = sys.argv[1]; print(urllib.parse.unquote(u[7:]) if u.startswith("file://") else "")' "$uri")
    rm -rf "$FILES"
    if [ -n "$path" ] && [ -f "$path" ]; then
        case "$path" in
            "$USER_HOME"/*)
                gdm_dir "$FILES"
                copy="$FILES/wallpaper.${path##*.}"
                cp "$path" "$copy"
                chown "$GDM_USER:$GDM_USER" "$copy"
                uri="file://$copy"
                ;;
        esac
    else
        uri=""
    fi

    # SF Pro from your home folder; system-wide fonts GDM sees already.
    rm -rf "$FONTS"
    list=$(mktemp)
    as_user fc-list ':family=SF Pro Display' file 2>/dev/null > "$list" || true
    as_user fc-list ':family=SF Pro Text' file 2>/dev/null >> "$list" || true
    while IFS= read -r line; do
        font=${line%: }
        case "$font" in
            "$USER_HOME"/*)
                gdm_dir "$FONTS"
                cp "$font" "$FONTS/"
                ;;
        esac
    done < "$list"
    rm -f "$list"
    [ -d "$FONTS" ] && chown -R "$GDM_USER:$GDM_USER" "$FONTS"

    clock=$(as_user gsettings get org.gnome.desktop.interface clock-format 2>/dev/null || echo "'24h'")
    {
        echo "# Written by Macr's scripts/login-screen.sh; its uninstall removes it."
        echo
        echo "[org/gnome/shell]"
        echo "enabled-extensions=['$UUID']"
        echo
        echo "[org/gnome/desktop/interface]"
        echo "clock-format=$clock"
        if [ -n "$uri" ]; then
            echo
            echo "# Ubuntu's GDM draws this behind the login screen."
            echo "[com/ubuntu/login-screen]"
            echo "background-picture-uri='$uri'"
            echo "background-size='cover'"
        fi
    } > "$SETTINGS"
    chmod 644 "$SETTINGS"
    $REBUILD

    echo "Macr is on for the login screen; you see it after you log out."
}

uninstall_macr() {
    need_root
    rm -rf "$DEST" "$FILES" "$FONTS"
    rm -f "$SETTINGS"
    $REBUILD
    echo "Macr is off for the login screen."
}

status() {
    if [ -f "$SETTINGS" ] && [ -d "$DEST" ]; then
        echo "on: $DEST"
        echo "settings: $SETTINGS"
    else
        echo "off"
    fi
}

case "${1:-}" in
    install) shift; install_macr "${1:-}" ;;
    uninstall) uninstall_macr ;;
    status) status ;;
    *) echo "usage: $0 install [macr.zip | folder] | uninstall | status" >&2; exit 2 ;;
esac
