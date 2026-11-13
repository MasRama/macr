#!/bin/sh
# Builds the extension and packs it as build/macr@masrama.github.io.shell-extension.zip.
set -eu
cd "$(dirname "$0")/.."

rm -rf dist
npm run build
cp -r metadata.json stylesheet.css icons sounds dist/

# gnome-extensions pack only takes the well-known files by itself.
set --
for entry in dist/*; do
  name="$(basename "$entry")"
  case "$name" in
    extension.js|metadata.json|stylesheet.css|prefs.js) ;;
    *) set -- "$@" "--extra-source=$name" ;;
  esac
done

mkdir -p build
gnome-extensions pack dist --force --out-dir build \
  --schema=../schemas/org.gnome.shell.extensions.macr.gschema.xml "$@"
echo "Packed build/macr@masrama.github.io.shell-extension.zip"
