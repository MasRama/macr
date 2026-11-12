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
- The extension also runs in the `unlock-dialog` and `gdm` session modes.
  Each module lists the screens it runs on (`screens`, the desktop when left
  out; `shared/logic/screen.ts`), and `extension.ts` turns the others off, in
  reverse order, while the lock or login screen shows.

## Menu bar

- Left box: logo menu, app menu (focused app, bold), Window menu.
- Centre box: untouched.
- Right box: existing indicators restyled, Macr's clock last. Clicking the
  clock opens the dateMenu's own menu, re-anchored on the clock.
- Hidden while on: Activities, the GNOME clock, and optionally the
  distribution's menu button (`zorin-menu`).
- The logo is the Apple glyph from an installed SF Pro font (Macr ships no
  Apple artwork); without that font it falls back to a generic symbol.
- Logo, app and Window menus only offer items that work for every app.
- App menus (`menubar-app-menus`): an app that shares its menu bar over
  D-Bus gets its own menus between the app name and Window, with its Help
  after Window. That covers GtkApplication apps with a menu bar (GTK 3 and
  4) and LibreOffice. Mutter gives each window's bus name and object paths
  (`get_gtk_menubar_object_path` and friends). The menus are read as a
  `Gio.DBusMenuModel` and run through `Gio.DBusActionGroup`s for the `app`
  and `win` prefixes.
  - `logic/app-menus.ts` turns the model into a tree and drops the app's own
    Window menu (Macr's lists the app's windows). It also flattens nested
    sections into separator groups and writes accelerators in macOS symbols.
  - The buttons are rebuilt only when the list of menus changes. A menu's
    items are read when it opens and again while it is open when the app
    changes them.
  - `submenu-action` is set while a menu or submenu is shown, as GTK does,
    because LibreOffice fills its submenus only then. Before a refill, the
    open submenu is closed and reopened.
  - Qt, Electron and other apps that do not share their menus keep only
    Macr's menus.
- Other monitors (`menubar-all-monitors`, on by default) get a
  `SecondaryBar`: a chrome actor named `panel` (so the bar style applies)
  that reserves its height and hides over full-screen windows. It has its own
  logo, app and Window menus and clock. `StatusMirror` copies the main bar's
  right-side buttons (status icons, app tray icons, quick settings) as
  `Clutter.Clone`s and follows them as they come, go, show or hide. The bars
  are rebuilt on `monitors-changed`.
- `BorrowedMenu` makes a button act as another one: clicks, touches and
  scrolls are emitted on the real button, so AppIndicator double-click,
  quick settings and the hidden dateMenu behave as usual. The menu is
  anchored on the clicked button and handed back to its owner on close.
- A clone scales its source to its own size, measured only when the clone is
  laid out, so each clone is laid out again when its source resizes.

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

## Launchpad

- A modal overlay (`Main.pushModal`, POPUP mode) in `uiGroup` covering the
  monitor under the pointer: the desktop blurred and dimmed behind
  (`Shell.BlurEffect`), a search entry, pages of app cells and page dots.
- Apps are `Shell.AppSystem.get_installed()` that `should_show()`, sorted by
  name. Filtering (`logic/filter.ts`) and the grid size, paging and arrow-key
  moves (`logic/grid.ts`) are pure.
- `SuperKey` takes the Super key while `launchpad-super-key` is on: it blocks
  the shell's own `overlay-key` handler on `global.display` (the overview),
  connects Macr's, and allows `overlay-key` in POPUP mode so Super closes it
  again. Zorin Menu's own `super-hotkey` is switched off meanwhile and back on
  in `disable()`.
- The dock's Apps icon reaches Launchpad through `src/shared/launchpad-link.ts`
  (a registry the module fills while it runs), and falls back to GNOME's app
  grid when Launchpad is off.

## Spotlight

- A modal panel near the top of the monitor under the pointer, bound to
  `spotlight-shortcut` with `Main.wm.addKeybinding` (NORMAL, OVERVIEW and
  POPUP modes, so the shortcut also closes it).
- Results come from the overview's own search providers
  (`Main.overview.searchController._searchResults._providers`, private in
  GNOME 46): the app provider and every remote provider the user has turned
  on in Settings. Each query gets its own `Gio.Cancellable`; providers fill in
  as they answer, and stale answers are dropped.
- `logic/results.ts` picks the Top Hit (the first app, else the first result)
  and caps each provider's section. Activating a result calls the provider's
  own `activateResult`.

## Control Center

- Works on GNOME's own quick settings (`Main.panel.statusArea.quickSettings`),
  so network, Bluetooth, sound, brightness and the rest keep GNOME's
  backends, and the other monitors' bars, which borrow the same menu, get it
  too. Quick settings fills itself in asynchronously at startup; the module
  waits until `_backgroundApps` exists.
- Look: `macr-cc` on the menu (plus `macr-light`, synced on open) and a blur
  on its box. The rules use `!important` where shell themes such as MacTahoe
  do, so the look holds with any theme.
- Layout: the slider items move to just after GNOME's last own toggle, before
  other extensions' toggles; each slider's box is wrapped with a title
  (Display, Sound, Microphone). Both are undone on disable.
- Focus is a `QuickToggle` bound inverted to
  `org.gnome.desktop.notifications show-banners`, added with
  `addExternalIndicator` and moved after Bluetooth, with a moon indicator in
  the bar while it is on.

## App icon tiles

- `Shell.App.prototype.create_icon_texture` is replaced while the module
  runs, so every shell surface that asks an app for its icon (dock,
  Launchpad, Spotlight, app switcher, overview) gets the tile. Disabling puts
  the original back and emits `icon-theme-changed` on the texture cache so
  icons on screen are made again.
- An icon keeps its own look when its file comes from the icon theme or a
  variant of it that the theme inherits (`MacTahoe-dark` → `MacTahoe`);
  hicolor, pixmaps and unrelated inherited themes get a tile.
- The tile is an SVG in `~/.cache/macr/icons`, keyed by the source file and
  its modification time: the original icon as embedded PNG, cut to a
  squircle when it is already a square tile, else framed on a light one
  (`logic/tile.ts`). Bump `VERSION` in `tiles.ts` when the drawing changes.

## OSD

- GNOME's own `OsdWindow`s stay in charge of volume, brightness and the
  other media-key popups. `Main.osdWindowManager._showOsdWindow` is wrapped
  on the instance (deleted on disable, so the prototype's shows again):
  before a window shows, Macr styles it once and places it.
- Placement: the window is aligned to the top right of its monitor, with
  margins from `logic/place.ts`: under whatever the work area leaves out at
  the top (the menu bar, or Macr's secondary bar), plus a gap. Windows GNOME
  makes later on `monitors-changed` are styled when first shown.
- Disable puts back each window's alignment, margins, style classes and blur.

## App switcher

- GNOME's switcher popups (Alt+Tab, Alt+`, Ctrl+Alt+Tab, input sources) are
  restyled, not replaced. Every popup with `switcher-popup` that joins
  `Main.uiGroup` gets `macr-switcher` (+ `macr-light`), and its
  `switcher-list` gets a background blur when GNOME adds it on show.
- Every item's text is transparent except the selected one, so only the
  chosen app's name shows, as on macOS. The input source symbol keeps its
  colour.
- Disable takes the classes and blur off any popup still open.

## Notifications

- Banners: `Main.messageTray.bannerAlignment` is set to END (restored on
  disable), so GNOME's own banners show at the top right under the bar. The
  tray gets `macr-notifications` (+ `macr-light`) and each banner a
  background blur as it joins `_bannerBin`.
- Notification Center: the hidden dateMenu's popover (the one Macr's clock
  opens) gets `macr-nc` and a blur on its box, like the Control Center. The
  layout stays GNOME's: notifications on the left, the date, calendar
  (today in red), world clocks and weather as widget cards on the right.
- GNOME's message list, Do Not Disturb and the Focus toggle keep working
  unchanged; only classes and effects are added and taken off on disable.

## Mission Control

- GNOME's overview, restyled: `macr-mission-control` on
  `Main.layoutManager.overviewGroup`, a dimmed, blurred copy of the wallpaper
  per monitor (`BackgroundManager` in a widget at the bottom of the group),
  and every `workspace-background` card at opacity 0 (looked up again on each
  `showing`, since GNOME builds workspaces lazily), so windows spread
  straight over the wallpaper.
- The Spaces bar always shows: `ThumbnailsBox.prototype._updateShouldShow` is
  swapped while the module runs (taken from the live instance, as 46 ships
  no typings for it) and its thumbnails are bigger (`_maxThumbnailScale`).
- The search box is hidden (opacity 0, height 0); typing still searches.

## Hot corners

- One 1 px reactive chrome actor per configured corner, on the corners the
  pointer can be pushed into (`logic/corners.ts`: a corner where another
  monitor continues is skipped). `trackFullscreen` hides them over
  full-screen windows. Each corner fires at most once per 600 ms.
- Actions: Mission Control, Launchpad (through `launchpad-link`, else GNOME's
  app grid), Desktop (minimizes the workspace's windows and brings the same
  ones back next time, `logic/desktop.ts`), Notification Center (the
  dateMenu, anchored on Macr's clock) and Lock Screen.
- GNOME's own hot corner is destroyed while this runs: the layout manager's
  `_updateHotCorners` is wrapped on the instance, and a handler on
  `enable-hot-corners` destroys the one GNOME rebuilds from its own bound
  handler. Disable deletes the wrapper and lets GNOME rebuild.

## Window corners

- Windows that do not shape their own corners are cut to a rounded rectangle
  by `CornerEffect`, a `Shell.GLSLEffect` on the window actor's first child
  (the surface container): pixels inside the frame get an antialiased
  rounded-rectangle coverage, the invisible borders around it are left as
  they are. The radius is the `window-corner-radius` setting.
- `logic/plan.ts` decides per window: normal windows and dialogs only, never
  maximized or full-screen ones, and never a client-decorated window that
  draws its own shadow (buffer larger than the frame: GTK and libadwaita
  already round themselves). That leaves frameless windows (Electron and the
  like) and server-decorated X11 windows.
- A frameless window also gets `macr-window-shadow`, a widget below it in
  `global.window_group` with the frame's size, restacked on `restacked`.
  It is bound to the window actor's visibility, opacity, scale and
  translation, with a matching pivot, so it follows GNOME's open, close and
  minimize animations.
- Plans are redone on allocation, size, maximize, full-screen and pivot
  changes; disable removes every effect and shadow.

## Traffic lights

- Window buttons are drawn by the apps, not the shell, so the module sets
  what apps read. It puts `close,minimize,maximize` first on the left of
  `org.gnome.desktop.wm.preferences button-layout` (`logic/layout.ts`; other
  buttons keep their side), saving the old layout in
  `traffic-lights-saved-layout` and putting it back on disable unless the
  user changed it since.
- It writes `macr-traffic-lights.css` and a `macr-traffic-lights/` folder of
  SVG lights (each light at rest, hovered, pressed and in the background)
  into `~/.config/gtk-3.0` and `gtk-4.0`, and imports the stylesheet from the
  first line of `gtk.css` (`logic/stylesheet.ts`). The SVGs are files because
  GTK 3 cannot draw an SVG from a `data:` URL, and are drawn large so they
  stay sharp at fractional scales. Every rule carries `:not(#macr)`, whose id
  specificity beats any theme's window-button rules.
- GTK 4 rules style `windowcontrols > button`, which covers libadwaita and
  the frames Mutter draws around X11 windows; the whole group shows its
  symbols on hover, as on macOS, and each button does too for Chrome, which
  renders GTK 4 buttons one by one. GTK 3 rules style `button.titlebutton`.
- A `gtk.css` that is a symbolic link (MacTahoe links it to its own
  stylesheet) is never written through: the link is replaced by a file that
  imports its target, and put back on disable. A `gtk.css` Macr created is
  removed again; one of the user's only loses Macr's line.
- GTK reads the user stylesheet once at start, so open apps change when they
  are reopened. Qt 6 apps on Wayland (the bradient decoration) and Electron
  apps with a custom title bar draw their own buttons and are left as they
  are.

## Lock screen

- GNOME builds a new `UnlockDialog` every time the screen locks, so the
  module wraps three methods of its prototype while on: `_init` hands every
  new dialog to a `MacLock`, `_setTransitionProgress` runs MacLock's own
  transition, and `_updateBackgroundEffects` turns the blur off and only
  darkens the wallpaper a little. A dialog already showing when the module
  turns on is taken over at once; disable puts the methods back and undoes
  every MacLock.
- MacLock moves GNOME's clock out of the stack it shares with the prompt,
  puts the date above the time and hides the "click or press a key" hint.
  The stack now shows a `UserWidget` (avatar and name) while the password
  field is hidden, and GNOME's prompt over it while it shows, so the avatar
  never moves; the clock never fades or shrinks.
- `MacLockLayout` replaces the dialog's layout manager (`logic/layout.ts`):
  the time near the top, the user at about 70% of the screen height (moved
  up when a tall prompt would not fit), notifications only in the room
  between them, and the login options button at the bottom right.
- The time has no AM/PM and follows the 12h/24h clock setting
  (`logic/clock.ts`); names follow `LC_TIME`. Styles are scoped to
  `.unlock-dialog.macr-lock` so they beat the shell theme's
  `.unlock-dialog` rules without `!important`.
- The devshell has no screen shield (`Main.screenShield` needs logind), so
  there a dialog is built by hand from `ui/unlockDialog.js`; the real lock,
  its blur and the session mode switch are checked in a real session.

## Login screen

- GDM runs a GNOME Shell of its own as the `gdm` user, in the `gdm` session
  mode, which loads only that user's extensions and settings.
  `scripts/login-screen.sh` copies Macr into the `gdm` user's extension
  folder and writes `95-macr-settings` next to GDM's own dconf defaults
  (`/usr/share/gdm/dconf` on Debian and Ubuntu, then `generate-config`):
  Macr in `enabled-extensions`, the user's clock format, and the wallpaper in
  Ubuntu's `com.ubuntu.login-screen` keys. A wallpaper or SF Pro fonts in the
  user's home folder are copied where the `gdm` user can read them.
  `uninstall` removes every one of these.
- In that shell only `LoginScreenModule` runs. GDM builds its LoginDialog at
  startup, maybe before the extension is on, so the module wraps the
  prototype's `_init` and also takes the dialog `Main.screenShield` already
  shows.
- MacLogin keeps GNOME's layout and only overrides the dialog's
  `_getCenterActorAllocation` on the instance: the user list and the auth
  prompt, the two boxes GNOME centres, are placed low as on the lock screen
  (`logic/layout.ts`, built on the lock screen's layout), both from the same
  top edge, so the avatar does not move when a user is picked. GNOME then
  grows the list's box evenly, but the list is centre-aligned in it and stays
  put.
- A big date and time sit on a monitor-sized actor below the dialog, using
  the lock screen's style classes; the bar's date is hidden. The user list
  runs left to right with each avatar over its name, as wide as its users
  (the theme fixes its width), and the distribution logo is hidden.
- The devshell starts as the login screen with `run.sh --gdm`; without
  AccountsService or GDM there, a dialog and stand-in users are built by
  hand from `gdm/loginDialog.js`.
