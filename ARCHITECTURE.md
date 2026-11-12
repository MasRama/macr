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
  features/<module>/    one folder per module (menubar, later dock, ...)
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
