#!/bin/sh
# Runs JavaScript in the devshell's shell. Example:
#   tools/devshell/eval.sh "Main.panel.statusArea['macr-logo'].menu.open()"
set -eu
# shellcheck source=tools/devshell/env.sh
. "$(dirname "$0")/env.sh"
shell_eval "$1"
