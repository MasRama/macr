# Macr

**The complete macOS experience for your Linux desktop.**

Macr is one GNOME Shell extension that turns GNOME into macOS, instead of a
stack of tweak extensions that each fix one corner. It ships module by module.

## Modules

| Module | Replaces | Status |
|---|---|---|
| **Menu bar**: logo menu, the focused app's name and menu, a Window menu, a macOS clock, a translucent bar | Just Perfection, Blur my Shell (top bar) | in progress |
| Control Center | GNOME quick settings | planned |
| Dock | Dash to Dock, Magic Lamp | planned |
| Launchpad and Spotlight | the distribution's app menu, Ulauncher | planned |

Macr leaves your GTK theme alone. It pairs well with a macOS-style theme such
as [MacTahoe](https://github.com/vinceliuice/MacTahoe-gtk-theme), and with
[Nokta](https://github.com/MasRama/nokta) for a dynamic island in the middle
of the bar.

## Requirements

GNOME Shell 46 on Wayland. Macr is built and tested on Zorin OS 18; other
GNOME 46 systems should work but are not tested yet. The menu bar uses the
SF Pro font when it is installed and the system font otherwise.

## Build and install

```sh
npm install
npm run pack
gnome-extensions install --force build/macr@masrama.github.io.shell-extension.zip
```

Log out and back in, then turn Macr on in Extensions. When the menu bar is
on, you can turn off Just Perfection and Blur my Shell's top bar blur.

## Development

```sh
npm run check   # type-check
npm test        # unit tests for the pure logic
```

`tools/devshell/` runs Macr in an isolated, headless GNOME Shell and takes
screenshots of it, without touching your session. See
[ARCHITECTURE.md](ARCHITECTURE.md).

## License

GPL-3.0-or-later. macOS is a trademark of Apple Inc. Macr is not affiliated
with or endorsed by Apple.
