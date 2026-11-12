#!/bin/sh
# Saves a screenshot of the devshell to build/shots/NAME.png and the top-left
# and top-right corners (where the menus open) to NAME-left.png and NAME-right.png.
# Usage: tools/devshell/shot.sh NAME
set -eu
. "$(dirname "$0")/env.sh"
[ $# -eq 1 ] || { echo "usage: $0 NAME" >&2; exit 2; }
OUT="$ROOT/build/shots/$1.png"
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot \
    --method org.gnome.Shell.Screenshot.Screenshot false false "$OUT" > /dev/null
python3 -I - "$OUT" "$ROOT/build/shots/$1" <<'PY'
import sys
from PIL import Image
image = Image.open(sys.argv[1])
w, h = image.size
image.crop((0, 0, 760, 520)).save(sys.argv[2] + '-left.png')
image.crop((w - 760, 0, w, 520)).save(sys.argv[2] + '-right.png')
PY
echo "$OUT"
