# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it
privately through
[GitHub's private vulnerability reporting](https://github.com/MasRama/macr/security/advisories/new).

Include what you found, how to reproduce it and which version you used. You
will get an answer within 7 days. Once a fix is released, the advisory is
published with credit to you unless you prefer otherwise.

## What Macr touches

Useful context when you look for problems:

- Macr runs inside GNOME Shell as your user. It makes no network requests.
- It reads `/proc/cpuinfo`, `/proc/meminfo`, `/etc/os-release` and
  `/sys/class/dmi/id/` for About This Computer, runs `lspci` for the
  graphics name, and reads `~/.local/share/recently-used.xbel` for Recent
  Items.
- It starts `gnome-control-center` when you choose System Settings or More
  Info, and ends an app's windows when you choose Force Quit.
