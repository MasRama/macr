# Macr

**The complete macOS experience for your Linux desktop.**

Macr is one GNOME Shell extension that turns GNOME into macOS, instead of a
stack of tweak extensions that each fix one corner. It ships module by module.

## Modules

| Module | Replaces | Status |
|---|---|---|
| **Menu bar**: logo menu, the focused app's name and menu, the app's own File, Edit and View menus when it shares them (GTK apps with a menu bar, LibreOffice), a Window menu, a macOS clock, a translucent bar, on every monitor | Just Perfection, Blur my Shell (top bar) | done |
| **Dock**: frosted glass, magnification, running dots, Trash, hides when a window covers it, genie minimize, on every monitor | Dash to Dock, Magic Lamp | done |
| **Launchpad**: every app in a full-screen grid with pages and search, on Super and the dock's Apps icon | the distribution's app menu | done |
| **Spotlight**: Ctrl+Space search over apps, files, settings and the calculator, using GNOME's search providers | Ulauncher | done |
| **Control Center**: GNOME's quick settings as macOS tiles, toggles first, titled Display and Sound sliders, a Focus (Do Not Disturb) toggle with a moon in the bar | GNOME quick settings styling | done |
| **App icon tiles**: apps your icon theme does not cover get their icon on a macOS squircle tile, in the dock, Launchpad, Spotlight and the app switcher | mixed icon styles | done |
| **Volume and brightness**: a small frosted pill under the menu bar at the top right, like macOS, on every monitor | GNOME's on-screen display at the bottom | done |
| **App switcher**: Alt+Tab as a frosted macOS panel with big icons, a soft highlight and only the chosen app's name; Alt+\` and the other switchers match | GNOME's switcher styling | done |
| **Notifications**: banners as frosted cards at the top right, and the clock opens a macOS Notification Center with notification cards and calendar, world clock and weather widgets | GNOME's centred banners and calendar popover | done |
| **Mission Control**: the overview's windows spread over the dimmed wallpaper with the Spaces bar always at the top | GNOME's overview look | done |
| **Hot corners**: each screen corner can open Mission Control, Launchpad, the desktop or the Notification Center, or lock the screen | GNOME's top-left hot corner | done |
| **Window corners**: rounded macOS corners on windows that do not round their own, such as frameless (Electron) and older X11 apps, with a soft shadow on frameless ones; square when maximized | Rounded Window Corners | done |
| **Traffic lights**: red, yellow and green window buttons first on the left of app windows, grey in windows in the background, with their symbols on hover; in GTK and libadwaita apps, Chrome and X11 apps (Qt 6 apps on Wayland and Electron apps with their own title bar draw their own buttons) | a macOS GTK theme's window buttons | done |
| **Lock screen**: the date and a big time at the top over the unblurred wallpaper, your picture and name low in the middle, and the password field fading in under them on a key press or click | GNOME's centred clock and blurred lock screen | done |

Macr leaves your GTK theme alone, apart from the window buttons it draws as
traffic lights (a stylesheet it adds to `~/.config/gtk-3.0` and `gtk-4.0` and
takes out again when turned off). It pairs well with a macOS-style theme such
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
Magic Lamp for the dock, and any launcher bound to Ctrl+Space (Ulauncher) for
Spotlight. Launchpad takes the Super key from Zorin Menu while it runs and
gives it back when turned off. Each module can be turned off in Macr's settings.

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
