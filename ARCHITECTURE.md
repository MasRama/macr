# Architecture

Macr is a single GNOME Shell extension written in TypeScript and compiled with
plain `tsc` (no bundler, no minification, as extensions.gnome.org requires).
There is no daemon: everything a module needs is reachable from the shell.

## Layout

```
src/
  extension.ts          turns modules on and off from GSettings
  prefs.ts              settings window (separate GTK 4 process)
  shared/               code used by more than one module
  features/<module>/    one folder per module (menubar, dock, ...)
    index.ts            the Module: enable() / disable()
    logic/              pure functions, no gi:// imports, unit tested
tests/                  node --test tests for the logic folders
tools/devshell/         isolated headless GNOME Shell for screenshots
schemas/                GSettings schema
```

## Rules

- A module adds to GNOME's own UI (`Main.panel`, menus, dialogs) instead of
  replacing it, so other extensions that hook the same UI keep working.
  Whatever it hides or moves it restores in `disable()`.
- `Main.panel.statusArea.dateMenu` is hidden, never destroyed: other
  extensions (Nokta) read its calendar and notifications.
- Only `logic/` folders are unit tested; they must not import `gi://` or
  `resource://` modules.
- Supported: GNOME Shell 46 on Wayland.

## Menu bar

- Left box: logo menu, app menu (focused app, bold), Window menu.
- Centre box: untouched.
- Right box: existing indicators restyled, Macr's clock last. Clicking the
  clock opens the dateMenu's own menu, re-anchored on the clock.
- Hidden while on: Activities, the GNOME clock, and optionally the
  distribution's menu button (`zorin-menu`).
- The logo is the Apple glyph from an installed SF Pro font (Macr ships no
  Apple artwork); without that font it falls back to a generic symbol.
- Menus only offer items that work for every app. Real per-app menus are a
  later tier.
- Other monitors (`menubar-all-monitors`, on by default) get a
  `SecondaryBar`: a chrome actor named `panel` (so the bar style applies)
  that reserves its height and hides over full-screen windows. It has its own
  logo, app and Window menus and clock, and a `Clutter.Clone` of the quick
  settings indicators. App tray icons are not copied. The bars are rebuilt on
  `monitors-changed`.
- GNOME has one calendar and one quick settings menu. `BorrowedMenu` points
  such a menu at the button that opens it, and back at its owner when the
  button goes.

## Dock

- GNOME's own `Dash` (favourites, running apps, drag to reorder, app menus),
  subclassed to take its icon size from the `dock-icon-size` setting and
  placed in a chrome actor at the bottom of a monitor: one dock per monitor,
  or only the primary with `dock-all-monitors` off. Show Apps
  moves to the start; a divider and the Trash follow the apps.
- `Dash` never disconnects what it connects on `AppSystem`, `AppFavorites`
  and `Main.overview`, and GNOME 46 never destroys an app icon's menu. The
  dock records those handlers while the dash is built and destroys the menus
  with their icons, so turning Macr off leaves nothing behind.
- The overview's own dash is hidden (not destroyed) and restored on disable.
- Magnification moves and scales the icons with `translation_x` and
  `set_scale`; the background grows with them. The maths is in
  `logic/magnify.ts`.
- Autohide: the dock hides when the focused window overlaps it or is
  fullscreen, and a 1 px strip at the bottom edge brings it back.
- Clicking the focused app minimizes its window, or cycles its windows on the
  workspace (`logic/rules.ts`). Everything else is GNOME's default.
- Genie: GNOME's minimize and unminimize handlers on `global.window_manager`
  are blocked, and a `Clutter.DeformEffect` bends the window into its app's
  icon in the dock on its monitor (`logic/genie.ts`). A window with no icon
  in the dock gets GNOME's animation. The headless devshell does not paint
  deform effects, so the genie can only be seen in a real session.
