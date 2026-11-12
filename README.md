# Macr

**The complete macOS experience for your Linux desktop.**

Macr is one GNOME Shell extension that turns GNOME into macOS, instead of a
stack of tweak extensions that each fix one corner. It ships module by module.

## Modules

| Module | Replaces | Status |
|---|---|---|
| **Menu bar**: logo menu, the focused app's name and menu, a Window menu, a macOS clock, a translucent bar, on every monitor | Just Perfection, Blur my Shell (top bar) | done |
| **Dock**: frosted glass, magnification, running dots, Trash, hides when a window covers it, genie minimize, on every monitor | Dash to Dock, Magic Lamp | done |
| Control Center | GNOME quick settings | planned |
| Launchpad and Spotlight | the distribution's app menu, Ulauncher | planned |

Macr leaves your GTK theme alone. It pairs well with a macOS-style theme such
as [MacTahoe](https://github.com/vinceliuice/MacTahoe-gtk-theme), and with
[Nokta](https://github.com/MasRama/nokta) for a dynamic island in the middle
of the bar.

## Requirements

GNOME Shell 46 on Wayland. Macr is built and tested on Zorin OS 18; other
GNOME 46 systems should work but are not tested yet. The menu bar uses the
SF Pro font when it is installed and the system font otherwise.

## Install

Download `macr@masrama.github.io.shell-extension.zip` from the
[latest release](https://github.com/MasRama/macr/releases/latest), then:

```sh
gnome-extensions install --force macr@masrama.github.io.shell-extension.zip
```

Or build it from source:

```sh
npm ci
npm run pack
gnome-extensions install --force build/macr@masrama.github.io.shell-extension.zip
```

Log out and back in, then turn Macr on in Extensions. Turn off the
extensions Macr replaces, or the two will fight over the same UI: Just
Perfection and Blur my Shell's top bar blur for the menu bar, Dash to Dock and
Magic Lamp for the dock. Each module can be turned off in Macr's settings.

## Development

```sh
npm run check   # type-check
npm run lint
npm test        # unit tests for the pure logic
```

`tools/devshell/` runs Macr in an isolated, headless GNOME Shell and takes
screenshots of it, without touching your session. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## License

GPL-3.0-or-later. macOS is a trademark of Apple Inc. Macr is not affiliated
with or endorsed by Apple.
