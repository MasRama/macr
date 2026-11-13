# Macr

**The complete macOS experience for your Linux desktop.**

Macr is one GNOME Shell extension that turns GNOME into macOS, instead of a
stack of tweak extensions that each fix one corner. It ships module by module.

## Modules

| Module | Replaces | Status |
|---|---|---|
| **Menu bar**: logo menu, the focused app's name and menu, the app's own File, Edit and View menus when it shares them (GTK apps with a menu bar, LibreOffice), a Window menu, Wi-Fi, Bluetooth and battery menus of their own, a macOS clock, a translucent bar, on every monitor | Just Perfection, Blur my Shell (top bar) | done |
| **Dock**: frosted glass, magnification, running dots, red badges and progress bars from apps such as Telegram and Thunderbird, a Downloads stack that fans or shows your newest downloads in a grid, stacks for any folder you add, the apps you quit last, minimized windows as thumbnails before the Trash, Trash, hides when a window covers it, genie minimize, along the bottom or down the left or right side, on every monitor | Dash to Dock, Magic Lamp | done |
| **Launchpad**: every app in a full-screen grid with pages and search, on Super and the dock's Apps icon | the distribution's app menu | done |
| **Spotlight**: Ctrl+Space search over apps, files, settings and the calculator, using GNOME's search providers, plus unit and currency conversions ("10 km to mi", "$20 in rupiah"), word definitions and web search with suggestions (the online lookups can be turned off); Super+Y previews the selected file | Ulauncher | done |
| **Quick Look**: Space on a file in the Downloads stack, or Super+Y on a file in Spotlight, previews it in GNOME's previewer; the arrow keys go to the next file | nothing in GNOME | done |
| **Control Center**: GNOME's quick settings as macOS tiles, toggles first, titled Display and Sound sliders, a Focus (Do Not Disturb) toggle with a moon in the bar and a Stage Manager toggle | GNOME quick settings styling | done |
| **Accent colour**: the macOS accent colours, or one picked from your wallpaper, for Macr's menus, buttons and toggles | GNOME 46's fixed blue | done |
| **Dynamic desktop** (opt in): your wallpaper follows the time of day, warm at sunrise and golden hour, dimmer and cooler at night | nothing in GNOME | done |
| **Auto appearance** (opt in): light during the day and dark at night, switching your GTK and shell theme to their light or dark variant too | Zorin's auto theme, Night Theme Switcher | done |
| **Desktop widgets** (opt in): clock, calendar, weather, batteries, photo and Now Playing widgets on the desktop, under your windows, small, medium or large (world clocks, upcoming events, a five-day forecast, play and skip buttons); add them from a macOS widget gallery, drag them anywhere and click one to open its app | nothing in GNOME | done |
| **App icon tiles**: apps your icon theme does not cover get their icon on a macOS squircle tile, in the dock, Launchpad, Spotlight and the app switcher | mixed icon styles | done |
| **Volume and brightness**: a small frosted pill under the menu bar at the top right, like macOS, on every monitor | GNOME's on-screen display at the bottom | done |
| **App switcher**: Alt+Tab as a frosted macOS panel with big icons, a soft highlight and only the chosen app's name; Alt+\` and the other switchers match | GNOME's switcher styling | done |
| **Notifications**: banners as frosted cards at the top right, and the clock opens a macOS Notification Center with notification cards stacked per app and calendar, world clock and weather widgets | GNOME's centred banners and calendar popover | done |
| **Mission Control**: the overview's windows spread over the dimmed wallpaper with the Spaces bar always at the top | GNOME's overview look | done |
| **Stage Manager** (opt in): the app you use stays in the middle and your other apps wait as tilted thumbnails on the left; click one to swap it in, or reach it from the dock, Alt+Tab or Mission Control. Turn it on in the Control Center | nothing in GNOME | done |
| **App Exposé**: all of one app's windows on the current workspace spread over the blurred screen, minimized ones in a row at the bottom; Super+Down or Show All Windows in the dock icon's menu | nothing in GNOME | done |
| **Full-screen Spaces**: an app that goes full screen gets a workspace of its own next to the one it left, and goes back when it leaves full screen | nothing in GNOME | done |
| **Keyboard**: Super stands in for Command: Super+Q quits the app, Super+M minimizes, Super+H hides the app and Super+Alt+H the others, as on a Mac (Super+Tab and Super+\` already switch apps and windows) | GNOME's Super+H and Super+M | done |
| **Clipboard history**: Ctrl+Super+V lists what you copied in the last eight hours, text and pictures, kept in memory only; search it and press Enter to paste one again | clipboard manager extensions | done |
| **Shake to find**: shake the pointer and it grows big for a moment so you can spot it | GNOME's Ctrl locate-pointer ring | done |
| **Emoji & Symbols**: Ctrl+Super+Space opens a macOS emoji picker under the text cursor, with search, categories and your frequently used emoji, and types the one you pick | GNOME's Ctrl+. in GTK apps only | done |
| **Hot corners**: each screen corner can open Mission Control, Launchpad, the desktop (your windows slide to the screen edges, as on macOS) or the Notification Center, or lock the screen | GNOME's top-left hot corner | done |
| **Trackpad gestures**: pinch four fingers for Launchpad, spread them to show the desktop, swipe down for App Exposé; each follows your fingers | GNOME's three-finger gestures only | done |
| **Click wallpaper to reveal desktop** (opt in): click the wallpaper and your windows slide aside; click again to bring them back | nothing in GNOME | done |
| **Window corners**: rounded macOS corners on windows that do not round their own, such as frameless (Electron) and older X11 apps, with a soft shadow on frameless ones; square when maximized | Rounded Window Corners | done |
| **Traffic lights**: red, yellow and green window buttons first on the left of app windows, grey in windows in the background, with their symbols on hover and the macOS Move & Resize, Fill & Arrange and Full Screen menu when the pointer rests on the green one; in GTK and libadwaita apps, Chrome and X11 apps (Qt 6 apps on Wayland and Electron apps with their own title bar draw their own buttons) | a macOS GTK theme's window buttons | done |
| **Window tiling**: drag a window to the left or right edge of the screen for a half, to a corner for a quarter or to the top to fill it, with a frosted preview of where it goes; drag it away to get its size back. Super+Ctrl with the arrow keys, F, C and R, Super+Ctrl+Shift with the arrows to arrange two windows, and Move & Resize in the Window menu, with margins between tiles | Tiling Shell / Zorin Tiling Shell, Tiling Assistant | done |
| **Screenshots**: Super+Shift+3 takes the whole screen, Super+Shift+4 a dragged area with a crosshair (Space for a window), and Super+Shift+5 or Print shows the macOS toolbar; a floating thumbnail at the bottom right opens, copies, shows or deletes the picture, or swipes away | GNOME's screenshot panel and banner | done |
| **Lock screen**: the date and a big time at the top over the unblurred wallpaper, your picture and name low in the middle, and the password field fading in under them on a key press or click | GNOME's centred clock and blurred lock screen | done |
| **Login screen** (opt in): the lock screen's look on GDM's login screen, with your users side by side low in the middle, installed with `scripts/login-screen.sh` | GDM's centred user list | done |

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

Log out and back in, then turn Macr on in Extensions. Turn off the extensions
Macr replaces, or the two will fight over the same UI: Just Perfection and
Blur my Shell's top bar blur for the menu bar, Dash to Dock and Magic Lamp for
the dock, any launcher bound to Ctrl+Space (Ulauncher) for Spotlight, and
Tiling Shell (Zorin Tiling Shell) or Tiling Assistant for window tiling. Dash
to Dock and Zorin Taskbar can bind Super+Shift with the number keys to open
dock apps, which takes Super+Shift+3, 4 and 5 from screenshots: turn those app
hotkeys off in their settings. Launchpad takes the Super key from Zorin Menu
while it runs and gives it back when turned off. Each module can be turned off
in Macr's settings, laid out like macOS System Settings, and its About Macr
page lists the enabled extensions that clash with Macr, with a button to turn
them off.

### Login screen

GDM's login screen runs its own GNOME Shell as the `gdm` user, which never
loads your extensions, so it needs Macr installed for it. From a clone of this
repository, with Macr installed for you first:

```sh
sudo scripts/login-screen.sh install     # or: install path/to/macr.zip
sudo scripts/login-screen.sh uninstall
```

`install` copies Macr into the `gdm` user's extension folder, turns it on in a
settings file of its own next to GDM's defaults, and passes on your clock
format, your wallpaper and the SF Pro fonts from your home folder. Run it again
after updating Macr or changing the wallpaper. The login screen changes the
next time it shows, after you log out. If it ever breaks, switch to a text
console (Ctrl+Alt+F3), log in and run `sudo scripts/login-screen.sh uninstall`.
It is tested on Ubuntu 24.04 based systems.

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
