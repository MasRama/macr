# Architecture

Macr is a single GNOME Shell extension written in TypeScript and compiled with
plain `tsc` (no bundler, no minification, as extensions.gnome.org requires).
There is no daemon: everything a module needs is reachable from the shell.

## Layout

```
src/
  extension.ts          turns modules on and off from GSettings
  prefs.ts              settings window (separate GTK 4 process)
  prefs/                its pages, rows and styles
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
- Status menus (`status-menus.ts`, `menubar-status-menus`): Wi-Fi, Bluetooth
  and the battery get buttons of their own left of the Control Center, as on
  macOS. GNOME's own indicators are moved out of `quickSettings._indicators`
  into them (and put back before the sibling they had, in reverse order, on
  disable), and each button shows only while its indicator does.
  - Wi-Fi and Bluetooth borrow the Control Center (`BorrowedMenu`) and open
    the menu of its first visible toggle of that kind straight away (the
    network list, the device list); closing that list closes the Control
    Center.
  - The battery has its own menu (`logic/battery.ts`), read from the power
    toggle's UPower proxy: the percentage, Power Source, the time remaining
    or until full, and Battery Settings. Not done: the apps using significant
    energy (Linux has no source for it).
  - `macr-status-*` buttons are mirrored on the other monitors' bars.

## Dock

- GNOME's own `Dash` (favourites, running apps, drag to reorder, app menus),
  subclassed to take its icon size from the `dock-icon-size` setting and
  placed in a chrome actor along an edge of a monitor: one dock per monitor,
  or only the primary with `dock-all-monitors` off. Show Apps
  moves to the start; a divider and the Trash follow the apps.
- Position (`dock-position`: `left`, `bottom` or `right`): the docks are
  built again when it changes. `logic/edge.ts` places the shelf, the hit
  area out to the screen edge, the reveal strip and the hidden slide for
  each edge, and places labels and stack grids next to an icon. Down a side
  the dash's container and icon box turn vertical, the separators and the
  divider lie across, icons grow away from the edge (`growAway()`), the
  running dot moves between the icon and the edge, menus open beside the
  dock (`menuSide()`: `AppIcon.popupMenu` is called directly because
  `DashIcon` always opens upwards) and stacks always open as a grid. The
  dash module keeps the edge the docks were built with (`dockEdge()`) for
  the items it does not build itself.
- `Dash` never disconnects what it connects on `AppSystem`, `AppFavorites`
  and `Main.overview`, and GNOME 46 never destroys an app icon's menu. The
  dock records those handlers while the dash is built and destroys the menus
  with their icons, so turning Macr off leaves nothing behind.
- The overview's own dash is hidden (not destroyed) and restored on disable.
  Each time the overview shows, its height is set to the bottom the primary
  dock takes (`overviewSpace` in `logic/edge.ts`, 0 for a side dock), so the
  overview lays Mission Control's windows out above the dock.
- Magnification moves and scales the icons along the dock with
  `translation_x` (`translation_y` down a side) and `set_scale`; the
  background grows with them. The maths is in `logic/magnify.ts`.
- GNOME draws an icon at its monitor's scale rounded up, so on a 100%
  screen a magnified icon would be a stretched 1x bitmap. `MacrDash` wraps
  each item's `BaseIcon.createIcon`: the icon is drawn `iconDetail` times
  its size (1.6 on a 100% screen, 1 at 125%) inside a `DetailedIcon` that
  scales it back down and takes its normal room. The docks are rebuilt when
  monitors change, so each picks the detail of its own monitor.
- Autohide: the dock hides when the focused window overlaps it or is
  fullscreen, and a 1 px strip along its screen edge brings it back.
- Clicking the focused app minimizes its window, or cycles its windows on the
  workspace (`logic/rules.ts`). Everything else is GNOME's default.
- Bounce (`dock-bounce`, on by default; `logic/bounce.ts`): an icon bounces
  away from its edge while its app is `Shell.AppState.STARTING` (opened from
  the shell: dock, Launchpad, Spotlight), finishing the bounce in flight and
  giving up after 12 s, and three times when one of its windows emits
  `window-demands-attention` or `window-marked-urgent` while the app is not in
  front. Each bounce is one `Clutter.Timeline` moving the icon, its badge and
  progress bar; the running dot stays on the shelf.
- Downloads stack (`stack.ts`, `dock-downloads`): a `DashItemContainer`
  between the divider and the Trash for the XDG Downloads folder (none when
  it is not set up). A click reads the folder (`enumerate_children_async`,
  with gvfs's `thumbnail::path` for pictures) and `logic/stack.ts` drops
  hidden files and unfinished downloads (`.part`, `.crdownload`, ...), sorts
  by `time::created`, else `time::modified`, and picks the view: a fan of at
  most ten items rising along a curve, or a frosted grid that scrolls. It is
  a modal popup (`Main.pushModal`) placed from where the icon rests, with
  the dock's slide and magnification taken off, and the dock stays shown
  while it is open (`open-changed`). Its menu opens the folder and sets
  `dock-downloads-view`. Space opens Quick Look on the item under the
  pointer (see Quick Look). Not done: dragging items out (a shell actor
  cannot start a Wayland drag on 46).
- Folder stacks (`dock-stacks`): any folder added in the settings window
  becomes a stack like Downloads, placed before it. `stackSources()` lists
  them, each with its own icon (`logic/stack.ts` gives the XDG folders
  theirs), and Remove from Dock in the stack's menu takes it out again.
  A folder that no longer exists shows no stack.
- Recent apps (`recent.ts`, `dock-recent-apps`, on by default as on macOS):
  an app that quits and is not a favourite goes first in
  `dock-recent-apps-list` (`logic/recent.ts`, three at most). `MacrDash`
  overrides `_redisplay` and, for that one pass, hands GNOME's code an app
  system whose running apps are followed by the recent ones that are not
  running, so they get the same icons, separator and drag handling. A
  recent app's menu ends with Remove from Dock and Clear Recent Apps, which
  take it, or all of them, out of the list (`withoutRecent`).
- Badges (`launcher.ts`): apps send a count and a progress over the Unity
  launcher API (`com.canonical.Unity.LauncherEntry` `Update` signals on the
  session bus). Telegram and others send them only while a dock owns
  `com.canonical.Unity`, so the module owns that name (replaceable, as Dash
  to Dock does) and apps send their state again. `logic/launcher.ts` merges
  each update per app id and drops a sender's entries when it leaves the
  bus. Each `MacrDash` icon has a red `macr-dock-badge` label at its top
  right and a progress bar under it.
- Show All Windows in an app icon's menu (after GNOME's window list) opens
  App Exposé through `src/shared/expose-link.ts`, while that module runs.
- Minimized windows (`minimized.ts`, unless `dock-minimize-to-app` is on):
  `MinimizedWindows` follows `notify::minimized` on every window, in the
  order they were minimized, and each dock shows its monitor's (the
  primary's when that monitor has no dock, `logic/minimized.ts`) as
  `MinimizedItem`s before the Trash: a `Shell.WindowPreviewLayout` of the
  window fitted into the icon square, which paints minimized windows, with
  the app's icon in its corner. A click activates the window; its item
  animates out and stays the genie's target until it is destroyed. Windows
  Stage Manager minimized into its strip are left out: the dock asks
  `src/shared/stage-link.ts` (`holds`) and syncs again on `onStagesChanged`.
- Genie: GNOME's minimize and unminimize handlers on `global.window_manager`
  are blocked, and a `Clutter.DeformEffect` bends the window into its
  thumbnail, else its app's icon in the dock on its monitor
  (`logic/genie.ts`; sideways into a side dock, worked out as the bottom
  case on the turned window). It follows the icon every frame, waits up to
  200 ms for a thumbnail the dock just added to get its place, and keeps
  the last place when the icon is destroyed. A window with no icon in the
  dock gets GNOME's animation. The headless devshell does not paint deform
  effects, so the genie can only be seen in a real session.

## Launchpad

- A modal overlay (`Main.pushModal`, POPUP mode) in `uiGroup` covering the
  monitor under the pointer: the desktop blurred and dimmed behind
  (`Shell.BlurEffect`), a search entry, pages of app cells and page dots.
- Apps are `Shell.AppSystem.get_installed()` that `should_show()`, sorted by
  name. Filtering (`logic/filter.ts`) and the grid size, paging and arrow-key
  moves (`logic/grid.ts`) are pure.
- Folders are GNOME's own app folders (`org.gnome.desktop.app-folders`), so
  GNOME's app grid shows the same ones. `folders.ts` reads and writes them the
  way `appDisplay.js` does; `logic/folders.ts` decides what a folder holds (its
  `apps`, plus apps of its `categories`, minus `excluded-apps`), what the grid
  shows (non-empty folders and the apps no folder holds, by name) and how an
  app goes in or out (out of a category folder means excluded). A new folder
  is named after a category its apps share whose `.directory` file has a
  name, else "Untitled Folder", and opens with its name ready to edit.
  Searching shows matching apps flat, inside folders too.
- Cells are reactive `St.Bin`s, not buttons: a button's grab on press would
  hide the drag from the root, whose `captured-event` handles press, drag
  (past 8 px) and release. Dropping an app on an app makes a folder, on a
  folder adds it, and out of an open folder's panel takes it out (an emptied
  folder is removed from `folder-children` and its keys reset). Holding a
  dragged app at the screen's side turns the page. An open folder is a panel
  over the blurred grid; Esc or a click beside it closes it first.
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
- Super+Y or Ctrl+Y (Cmd+Y on a Mac) opens Quick Look on the selected result
  when it is a file (a `file://` id, as the Files provider gives); the
  previewer's arrow keys go through the other files listed.
- The Top Hit stays selected as slower providers fill in, until the user
  picks another result with the arrows or the pointer.
- Macr's own answers (`answers.ts`) are providers with the same interface,
  around GNOME's: conversions first, so they become the Top Hit, then a
  definition and the web last.
  - Conversions (`logic/convert.ts`): "10 km to mi", "100 f in c", units of
    length, weight, temperature, volume, speed, data, time and area, worked
    out offline. Currencies ("$20 in rupiah", ISO codes, signs and names)
    use the European Central Bank's rates from Frankfurter, kept for 12 hours.
    Enter copies the result.
  - Definitions: a single English word is looked up in the Free Dictionary
    API (Wiktionary's definitions); Enter opens the word's Wiktionary page.
  - The web: "Search the web for …" (always there, offline too) and up to
    three Google suggestions; Enter opens a Google search.
  - HTTP is one Soup 3 session (`online.ts`, local typings in
    `soup-typings.d.ts`) with a 3 s timeout, a generic user agent and no
    cookies; each query's `Gio.Cancellable` cancels its requests.
    `spotlight-online` off keeps everything offline: no exchange rates,
    definitions or suggestions.

## Quick Look

- `src/shared/quick-look.ts`: GNOME's file previewer, Sushi (the one Files
  opens with Space), over D-Bus: `org.gnome.NautilusPreviewer2.ShowFile`
  with no parent window. No previewer of Macr's own; without Sushi it logs
  and does nothing.
- The previewer is a normal window, which a Macr overlay would cover, so
  the stack or Spotlight closes first and Macr focuses the previewer's
  window when it maps (no parent window to hand focus over).
- Sushi reports its arrow keys as `SelectionEvent` (a `Gtk.DirectionType`);
  `logic/quick-look.ts` turns that into a step through the list Macr
  opened, clamped at both ends. Its `Visible` property going false ends it.
  `resetQuickLook()` runs in `Macr.disable()`.
- The devshell starts Sushi on its own display. Keys do not always reach
  Sushi's GTK 3 window there, even when Sushi is called directly, so check
  them in a real session.

## Accent colour

- `accent-color`: one of the macOS accents (blue, the look Macr ships,
  purple, pink, red, orange, yellow, green, graphite) or `wallpaper`. The
  module (`accent-enabled`, no switch in the window) colours Macr's own
  surfaces only: GTK apps on GNOME 46 have no accent to set.
- `logic/accent.ts` lists every accent rule of `stylesheet.css` (a test
  fails when one is missing) and writes them again in the accent's colour to
  `~/.cache/macr/accent-<name>.css`, loaded with `St.Theme.load_stylesheet`.
  St lets the stylesheet loaded first win a tie, so each selector repeats
  its first class to be one class stronger. Text on yellow turns dark.
- Wallpaper: the picture GNOME draws (`picture-uri-dark` under the dark
  style), read at 48 px with GdkPixbuf off the main loop; vivid pixels vote
  for the accent nearest their hue, pale reds count as pink, and a grey
  picture gives graphite. A slideshow (XML) or a missing file gives blue.

## Dynamic desktop

- `dynamic-desktop-enabled`: the user's own wallpaper
  follows the time of day, since Apple's dynamic pictures cannot ship.
  A `Shell.GLSLEffect` (`grade-effect.ts`) grades every `Meta.BackgroundActor`:
  brightness, a warm or cool shift and saturation.
- `BackgroundManager.prototype._createBackgroundActor` is wrapped while the
  module runs, so pictures made later (wallpaper change, overview, Mission
  Control, the lock screen) get the effect; the stage is walked once for the
  ones already there.
- `logic/grade.ts`: keyframes around sunrise and sunset (night, dawn, day,
  golden hour, dusk), eased in between and wrapping past midnight. Sunrise
  and sunset come from gsd's Night Light (`org.gnome.SettingsDaemon.Color`),
  -1 without a location, then 6:00 and 18:00. Updated every minute.
  `shared/sun.ts` (`SunWatcher`) reads them for this module and Auto
  appearance.

## Auto appearance

- `appearance-auto` (the Auto button next to Light and Dark): light from
  sunrise to sunset, dark at night, as macOS does. Runs on the lock screen
  too. Sunrise and sunset come from `SunWatcher` (see Dynamic desktop).
- `logic/appearance.ts` names the phase (`<day>:light|dark`, the early
  morning belonging to the evening before) and it is stored in
  `appearance-auto-phase`. The module switches only when the phase changes,
  so a Light or Dark picked by hand holds until the next sunrise or sunset.
- `shared/appearance.ts` (also used by the settings window) sets
  `color-scheme` and swaps `gtk-theme` and the User Themes shell theme for
  their other variant when it is installed: `themeCandidates()` turns
  MacTahoe-Dark into MacTahoe-Light or MacTahoe, Yaru into Yaru-Dark or
  Yaru-dark. The icon theme is left alone.
- Zorin's own auto theme (`com.zorin.desktop.auto-theme`) would fight it;
  the settings window warns while that is on.

## Desktop widgets

- `desktop-widgets-enabled`: clock, calendar, weather,
  batteries, photos and Now Playing widgets (`desktop-widgets`, in that
  order) in one actor in
  `global.window_group`, above the wallpaper and the desktop icons' window
  (type DESKTOP on X11; on Wayland DING's window is a normal one kept low
  and found by its title, `logic/widgets.ts`) and under every other window.
  Mutter restacks window actors on `restacked`, so the layer is put back
  before the next redraw. The overview hides `window_group`, and the
  widgets with it.
- Without a saved place, `defaultSlots()` puts them in a column at the top
  right of the primary monitor's work area. A drag (a stage grab after 6 px)
  snaps to an 8 px grid inside the work area and is saved in
  `desktop-widget-positions` as fractions, so it survives a new resolution.
- Sizes (`logic/widgets.ts` `sizesOf()`, `WIDGET_UNIT`): small (164
  logical px square), medium (two smalls and the gap wide) and, for
  calendar, weather and photos, large (two by two), saved per widget in
  `desktop-widget-sizes`. The column right-aligns
  mixed sizes; a size change rebuilds the widgets. `registry.ts` maps ids
  to classes.
- A click opens Clocks, Calendar, Weather, the Power settings, the photo
  or the playing app; the right-click menu has the sizes, Edit Widgets… and
  Remove Widget. While an app window has the focus they are desaturated
  and faded, full colour on the desktop.
- Weather reuses the shell's own `WeatherClient` from the date menu (a new
  one never disconnects its signals), so it shows the place picked in GNOME
  Weather; medium adds the next six forecast hours (`hourlyForecast()`),
  large also the next five days, each day's low to high as a bar on the
  week's range (`dailyForecast()`, `rangeBar()`).
- The clock is drawn with Cairo and ticks only while it shows. Medium adds
  up to three world clocks from GNOME Clocks: the date menu's
  `_clocksItem._locations` (GWeather locations), followed through
  `org.gnome.shell.world-clocks` `changed::locations`, each with its day
  and hours from here (`relativeDay()`, `offsetLabel()`).
- Batteries reads UPower with `UPowerGlib.Client` (`get_devices()`: in GJS
  `get_devices2()` hands back devices that are already freed).
  `logic/batteries.ts` keeps the computer's battery first and up to three
  other devices; one device gets a big ring and its charge, more get a 2x2
  grid of Cairo rings, red at 20% or less, with a bolt while plugged in.
  Medium shows four smaller rings in a row.
  The devshell's system bus has no UPower: check it with a fake service.
- Photos walks the XDG Pictures folder off the main loop (three folders
  deep, 2000 photos at most) and shows one per three hours
  (`logic/photos.ts`). GdkPixbuf loads it at the size that covers the
  widget, turned upright and cropped to it, into a PNG in
  `~/.cache/macr` with a new name each time (St keeps images by name),
  shown as the widget's `background-image` so St rounds its corners. The
  module clears old PNGs once as it starts, not each widget, so gallery
  previews leave the desktop's picture alone.
- The medium calendar lists the next 7 days' events, large the month,
  today's date and five events (`upcomingEvents()`: by day, all-day
  first) from the date menu's `_eventSource`. The calendar
  server keeps one time range for all its clients, and a new range clears
  its events, so the widget asks for one only when the last request does
  not already cover it.
- Now Playing (`media.ts`) reuses the date menu's media section: its
  `MprisPlayer`s (`_players`) and the ones it shows (`_messages`, followed
  through `_list` child-added/removed; the section has no signal of its
  own). `pickPlayer()` takes the one playing, else the one changed last.
- Edit Widgets… opens `WidgetGallery` (`gallery.ts`): a modal scrim in
  `Main.uiGroup`, a `Clutter.Clone` of the widgets layer on it, and a panel
  of live previews (real widgets made non-reactive and scaled, at most half
  size, `fitScale()`), wrapped into rows that fit the screen
  (`wrapRows()`); a reactive overlay keeps clicks off their buttons. A
  click adds the widget in its column; a drag dropped outside the panel
  (`droppedOnDesktop()`) adds it at that point.
  Esc, Done or a click on the scrim closes it; `disable()` destroys it.

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
- Stage Manager is a `QuickToggle` after Focus, bound to
  `stage-manager-enabled` with `Gio.Settings.bind`; its icon ships in
  `icons/`. It shows while the Control Center module is on.

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
- Stacks (`stacks.ts`): an app's notifications move up under its newest one
  in the message list (`_notificationSection._list`), and only that card
  shows until the stack is opened (`logic/stacks.ts`). The top card of a
  closed stack (`macr-nc-stack`) draws the cards peeking out under it with
  its list item's background, since the item is an `St.Bin` with room for one
  child. A click opens the stack, Show Less in its header closes it, and its
  close button clears the whole stack. Stacks close again with the
  Notification Center. Messages are only moved, hidden and styled; on
  destroy GNOME's order (critical first, then newest first) is put back.

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

## App Exposé

- `ExposeOverlay` (`features/expose/overlay.ts`): a modal widget in
  `uiGroup` over the monitor under the pointer, a blurred and dimmed backdrop,
  and one `St.Button` per window of the app on the active workspace holding
  a `Shell.WindowPreviewLayout` (so minimized windows paint too). Cards ease
  from the window's frame to their slot and back on close; minimized ones
  fade in a row at the bottom. A ring and the window title follow the
  pointer. Clicking a card activates the window; Escape, a click on the
  backdrop, the shortcut again or the overview showing close it.
- `logic/layout.ts` puts the windows in rows, in order, all at one scale
  (never above 1), trying every row count and keeping the biggest.
- `app-expose-shortcut` (Super+Down, for the focused app) borrows stock
  GNOME's `unmaximize` accelerator (`app-expose-saved-wm`).

## Full-screen Spaces

- `fullscreen-spaces-enabled`: a window's `notify::fullscreen` is handled
  in a `BEFORE_REDRAW` later. Going full screen, `logic/spaces.ts` lets a
  NORMAL window that is not on all workspaces and has other windows showing
  on its workspace move, only with `dynamic-workspaces`: a workspace is
  appended, reordered to just after the window's own, and activated with the
  window. Leaving full screen moves it back (to the first workspace left if
  its own is gone) and switches there; closing it while its Space shows
  switches back. GNOME's dynamic workspaces remove the empty one.
- A window moved to another workspace by hand meanwhile stays there. The
  module runs on the lock screen too, so locking does not move windows;
  `disable()` moves every window it moved back.

## Keyboard

- Super stands in for Command: `keyboard-quit` (`Shell.App.request_quit`),
  `keyboard-minimize`, `keyboard-hide` and `keyboard-hide-others`, bound with
  `Main.wm.addKeybinding` in NORMAL mode on the focused window (not the
  desktop or a skip-taskbar window). Super+Tab and Super+` are already
  GNOME's app and window switchers. No Super+W: a Mac's Command+W closes a
  tab, which apps already do with Ctrl+W, and the shell could only close
  the whole window.
- GNOME binds Super+H to `minimize` and Super+M to `toggle-message-tray`;
  `BorrowedKeys` takes only Macr's accelerators out of those lists
  (`keyboard-saved-wm`, `keyboard-saved-shell`) and puts them back on
  disable unless the user changed them since.
- Hide (`src/shared/hider.ts`, also behind the menu bar's Hide, Hide Others
  and Show All) minimizes the app's normal windows that can be, skipping
  the animation with `Main.wm.skipNextEffect` only when one would play. It
  remembers them per app (`logic/hide.ts`); when that app gets focus again
  (`notify::focus-app`: dock, Alt+Tab, launching it) the rest come back
  too. Show All and `Macr.disable()` forget them.

## Clipboard history

- `clipboard-history-enabled`: `ClipboardHistory` reads every new clipboard
  owner (`Meta.Selection` `owner-changed`) through `St.Clipboard`: its text,
  else its image (PNG when offered, at most 24 MB). What a password manager
  marks with `x-kde-passwordManagerHint` is skipped. As on macOS Tahoe it
  keeps the last eight hours in memory only: never written to disk, at
  most 60 clips and 8 images (`logic/history.ts`). It survives the lock
  screen; turning it off or disabling Macr clears it.
- Ctrl+Super+V (`clipboard-history-shortcut`) opens a modal frosted panel
  (`panel.ts`) with a search field over the clips, newest first. Enter or a
  click puts the clip back on the clipboard and, once the app's window has
  the focus back, `Paster` presses its paste keys on a virtual keyboard
  (Ctrl+Shift+V in terminals). With no window to paste into it shows a
  Copied OSD. Delete takes a clip out.

## Emoji & Symbols

- `emoji-picker-shortcut` (Ctrl+Super+Space, as Ctrl+Cmd+Space on a Mac)
  opens a modal frosted picker under the text cursor
  (`Main.inputMethod`'s cursor rectangle while a text field has focus), else
  at the top of the monitor: a search field, a grid of emoji and the macOS
  categories along the bottom, with Frequently Used first.
- The emoji are generated from Unicode's `emoji-test.txt` by
  `scripts/emoji-data.mjs` into `logic/data.ts` (fully qualified, no skin
  tone variants). `logic/emoji.ts` searches names by word prefix, exact and
  shorter names first, and keeps the recent picks (`emoji-recent`).
- A pick is typed into the focused field with `Main.inputMethod.commit()`
  once the field has focus back; with no text field it is copied and an OSD
  says so.

## Stage Manager

- On by default (`stage-manager-enabled`); also a toggle after Focus in the
  Control Center and a switch on the Mission Control settings page. It
  declares `screens: ['desktop', 'lock']`: turning off on every lock would
  bring every window back and stage them again on unlock, so the lock screen
  pauses it instead (`Main.sessionMode` `updated`) and hides the strip.
- Every monitor has its own stages: one `StageState` and one strip per
  monitor index, and each window's events go to its monitor's state (focus,
  workspace, pause and the like to all of them). When the monitors change,
  every window comes back and each monitor starts over, since indexes now
  mean other monitors. A window dragged to another monitor becomes the
  middle there.
- Eligible windows: NORMAL, not `skip_taskbar`, on the active workspace,
  not pinned to all workspaces (with `workspaces-only-on-primary`, GNOME's
  default, the other monitors' windows are on every workspace without being
  pinned, so they count), not always on top, not
  transient (Mutter hides dialogs with their parent; a focused dialog stands
  for its root window) and not from a portal app (`xdg-desktop-portal-*`).
  A parentless modal dialog, such as an extension's settings window, is
  left alone and never swaps the middle.
- Stages are other apps' windows minimized by Stage Manager, grouped by app
  (`Shell.WindowTracker`), most recent first. Minimizing is Mutter's own
  state, so the dock, Alt+Tab and Mission Control already show and restore
  them, and the window keeps its frame and stacking slot. Each minimize and
  unminimize first calls `Main.wm.skipNextEffect` (untyped, public), only
  when the actor's visibility will really change, so neither the genie nor
  GNOME's animation plays. A skip whose effect never played (a window
  minimized and brought back within one frame) is taken back from
  `Main.wm._skippedActors` (private), and turning off drops any skip still
  pending, so no stale skip eats the user's next animation.
- `logic/stages.ts` decides everything from the eligible windows (in
  `get_tab_list` MRU order), the focus and an event: focus, a stage
  clicked, a minimize or unminimize Stage Manager did not do, close, first
  `shown`, workspace or monitor changes, pause, resume, enable and disable.
  The plan is carried out as unminimize, activate, then minimize, so the
  window Mutter would focus next is always one meant to show. Events are
  queued and handled in one `BEFORE_REDRAW` later (after Mutter's own
  `CALC_SHOWING` focus changes), not while Mission Control is open; the
  module's own minimizes are ignored by a flag while the plan runs.
- One path for every way in: a focus change to another app's window, or
  someone else unminimizing a stage window (dock, Alt+Tab,
  `Main.activateWindow`, Mission Control), brings that app's whole stage in
  and sends the old middle to the strip. A user minimize (yellow light, the
  dock's click-to-minimize) takes the window out of Stage Manager into the
  dock; a middle left empty by that or by a close brings in the latest stage.
  A focused new window becomes the middle; an unfocused one of another app
  goes to the strip. A middle left with nothing showing is kept until the
  close or minimize that emptied it is handled, as the focus change often
  arrives first.
- Show Desktop (see Show Desktop) pauses Stage Manager while the windows
  are slid aside, through `src/shared/stage-link.ts`, so the sliding does not
  read as windows leaving the middle. Whenever the windows it holds change,
  it calls `stagesChanged()` there so the dock leaves them out of its
  minimized thumbnails.
- Turning off unminimizes every window it minimized, oldest first and on any
  workspace, and activates the focused window: nothing was moved, so every
  window is back where it was.
- The strip (`strip.ts`): stages in slots down the left of its monitor's
  work area (`logic/slots.ts`: as many as fit, at most six, centred). Each is
  an `St.Button` holding a `Shell.WindowPreviewLayout` of up to three of the
  app's windows (clones, which paint minimized windows), turned 22° on the
  Y axis with its pivot on the left edge, a CSS shadow and the app icon over
  its bottom left corner; hovering turns it towards the viewer. The strip is
  rebuilt only when the stages change.
- It floats over windows (no struts) and slides away when a showing window
  overlaps it (`src/shared/covered.ts`, shared with the dock); a 1 px edge
  actor at the left of the work area brings it back. Chrome is not hidden in
  the overview and `trackFullscreen` would set `visible` behind the strip's
  back, so it hides itself in Mission Control and on `in-fullscreen-changed`.
- Thumbnails freeze about 3 s after a window is minimized for clients that
  honour Wayland's suspended state (GTK 4, Firefox, Chromium): Mutter
  suspends hidden windows, mapped clones or not.
- Not done: swap animations, dragging windows between stages, showing all of
  an app's windows at once, per-workspace stages (a
  workspace switch settles the new one; stages minimized on another
  workspace stay minimized until turned off), struts so new windows avoid
  the strip, and macOS's click-the-desktop behaviour.

## Hot corners

- One 1 px reactive chrome actor per configured corner, on the corners the
  pointer can be pushed into (`logic/corners.ts`: a corner where another
  monitor continues is skipped). `trackFullscreen` hides them over
  full-screen windows. Each corner fires at most once per 600 ms.
- Actions: Mission Control, Launchpad (through `launchpad-link`, else GNOME's
  app grid), Desktop (toggles Show Desktop, below), Notification Center (the
  dateMenu, anchored on Macr's clock) and Lock Screen.
- GNOME's own hot corner is destroyed while this runs: the layout manager's
  `_updateHotCorners` is wrapped on the instance, and a handler on
  `enable-hot-corners` destroys the one GNOME rebuilds from its own bound
  handler. Disable deletes the wrapper and lets GNOME rebuild.

## Show Desktop

- `src/shared/desktop-reveal.ts`, one `DesktopReveal` shared by the hot
  corners, the gestures and the wallpaper click (`useDesktopReveal()`, and
  `releaseDesktopReveal()` in each module's `disable()`: the windows come
  back once the last one lets go).
- As on macOS, the window actors (not the windows) slide to the side edges
  of their monitor with `translation_x`/`translation_y`, leaving a 32 px
  sliver of each on screen (`src/shared/logic/reveal.ts`: the nearer side by
  the window's centre, never a side another monitor continues on, else
  down). A reactive sliver actor over each one brings every window back
  and focuses the clicked one. The focus is unset meanwhile and given back
  after.
- It is undone when a window takes the focus, on a workspace switch, when
  the overview shows and when the monitors change. A generation counter
  drops ease callbacks of an older reveal. `track(progress)` and
  `settle(reveal)` let a gesture move the windows part of the way.

## Trackpad gestures

- `gestures-enabled`: four-finger touchpad gestures, read with
  `Clutter.Event.add_filter` on the stage, which sees events even while
  Launchpad or App Exposé hold a modal grab (a stage `captured-event`
  handler does not). Three-finger gestures stay GNOME's.
- Pinch in opens Launchpad, spread shows the desktop, swipe down opens App
  Exposé of the focused app; the opposite gesture closes each. What they
  open follows the fingers (`track()`/`settle()` on `launchpad-link`,
  `expose-link` and the shared Show Desktop) and finishes open past a
  quarter of the way (`logic/gestures.ts`: dead zones, ranges and which
  action a direction means given what is showing).
- Gestures run in the normal and overview action modes, and while
  Launchpad or App Exposé are open. The devshell has no touchpad, so the
  gestures were tried there with fake events; the feel needs a real one.

## Shake to find

- `shake-to-find-enabled`: an event filter feeds pointer motion to
  `logic/shake.ts` (four turns of at least 60 px within 700 ms, on x or y;
  never while a button is held, so drags do not count).
- The real pointer is hidden (`Meta.CursorTracker.set_pointer_visible`) and
  an actor on `global.stage` draws the cursor theme's arrow three times as
  big at the pointer's hotspot. The arrow is read from the theme's Xcursor
  file (`default` or `left_ptr`, following `Inherits` to Adwaita,
  `logic/xcursor.ts`) at its biggest size, so it stays sharp. It shrinks
  back 900 ms after the last shake.

## Wallpaper click

- `wallpaper-click-enabled`: a left click (no drag, under
  600 ms, `logic/click.ts`) on a `Meta.BackgroundActor`, or on a desktop
  icons window (type DESKTOP, or out of the taskbar on the bottom layer as
  DING's is), toggles Show Desktop, in the normal action mode only.
- A click on the desktop icons' window cannot be told from a click on one
  of its icons, so clicking an icon reveals the desktop too.

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
  GTK 3 cannot draw an SVG from a `data:` URL. Each light is drawn at 12px
  and, as `@2`, at 24px, picked by `-gtk-scaled()` so it stays sharp on
  scaled screens. The size matters: Chrome sizes its buttons from a 16px
  icon and stretches any background image bigger than the button to fill it
  (`background-size: contain`), so a large SVG makes huge lights in Chrome.
  Every rule carries `:not(#macr)`, whose id
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
- The green light's menu (`zoom-menu.ts`): the app draws the light, so the
  shell follows the pointer (`Meta.CursorTracker` `position-invalidated`)
  and finds the light from the focused window's frame (`logic/zoom.ts`,
  measured for libadwaita and GTK 3 apps and X11 frames). After resting
  there 600 ms, with no shell actor or other window over it, a menu takes no
  focus and offers Move & Resize, Fill & Arrange (through the tiler), Enter
  Full Screen and Return to Previous Size. It closes when the pointer leaves
  it or the focus moves.

## Window tiling

- Drag to tile: `global.display` `grab-op-begin`/`grab-op-end` follow pointer
  moves only (`(op & ~0x400) === MOVING`; keyboard moves and resizes do not
  snap). During the grab the pointer is polled every 16 ms, because a window
  stops at the top of the work area while the pointer goes on into the menu
  bar, where Fill is. `logic/zones.ts` maps the pointer to a placement: the
  left and right edges a half, the corners a quarter, the top edge Fill; an
  edge where another monitor continues does not snap.
- The preview (`macr-tile-preview`, + `macr-light`) is an `St.Widget` with a
  background blur in `global.window_group`, just below the dragged window. It
  grows out of the window's frame and eases to the target.
- Escape gives no sign of its own: a drop counts as cancelled when the window
  moved during the drag and is back at its start position.
- Dragging a tiled window away gives it back its size from before it was
  tiled, mid-drag, with `move_resize_frame`. Mutter 46 keeps the grab's
  relative anchor across the resize, so `logic/restore.ts` places the window
  the same way (the grab point keeps its share of the width and height) and
  the drag carries on without a jump.
- Placing is `src/shared/tiler.ts`, shared with the Window menu: unfullscreen,
  unmaximize (GNOME's own Super+Left tiles are vertically maximized), move to
  the target monitor, `move_resize_frame` (`Meta.Window.tile()` is not
  introspected in 46). The maths is `src/shared/logic/geometry.ts`: halves,
  quarters, Fill and Center, with `tiling-margins` an 8 px gap from the work
  area's edges and between tiles. Wayland clients resize in their own time,
  and one with a minimum size bigger than its tile is moved back against the
  tile's outer edges once it settles, so it does not spill off the screen.
- Arrange (Left & Right and the others) tiles the focused window and the most
  recently used other window that shows, one on the same monitor first
  (`src/shared/logic/arrange.ts`).
- What Macr did to each window (its size before tiling, the tile it got) is in
  `src/shared/tiling-store.ts`, keyed by window id and dropped on
  `unmanaged`. It lives outside the module, so locking the screen does not
  lose it, and `Macr.disable()` clears it. A window counts as tiled only while
  its frame still equals its tile; Return to Previous Size goes back to the
  size it had before it was first tiled. A maximized window has no size of
  its own to go back to (Mutter's saved rect is not introspected).
- The Window menu reaches the module's tiler (with margins) through
  `src/shared/tiling-link.ts`, and places windows without margins when the
  module is off.
- Keyboard: one `as` setting per shortcut, bound with `Main.wm.addKeybinding`;
  Super+Ctrl stands in for the Mac's Fn+Control. Quarters have no default.
- GNOME's own edge tiling (`org.gnome.mutter edge-tiling`, on in Zorin) would
  show its preview and tile on drop too, so it is off while the module runs.
  Zorin also binds Super+Ctrl+Left/Right to `toggle-tiled-left/right`: those
  lists lose only the accelerators Macr's shortcuts use (`src/shared/borrowed-keys.ts`
  with `src/shared/logic/keys.ts`, also used by the keyboard and App Exposé
  modules), so
  Super+Left/Right keep GNOME's half tiling. Both are saved in Macr's
  settings (`tiling-saved-edge-tiling`, `tiling-saved-toggle-tiled`) and put
  back on disable unless the user changed them since.
- Not done: size animations and tile targets in the middle of the screen.

## Screenshots

- Built on GNOME's own screenshot UI (`Main.screenshotUI`, built once and
  never destroyed) and its exported `captureScreenshot`, which saves, copies
  and notifies. `ui/screenshot.js` has no typings, so
  `src/features/screenshot/screenshot-typings.d.ts` declares the parts the
  module uses; `capture.ts` checks every private part is there before the
  module touches the UI (GNOME 46 only), else only Super+Shift+3 is bound.
- Super+Shift+3 (`screenshot-screen-shortcut`) is GNOME's Shift+Print path:
  `screenshot_stage_to_content`, then `captureScreenshot`. Not while the UI
  is open, which would be in the picture.
- Super+Shift+4 (`quick.ts`) opens GNOME's UI with the panel and close
  button hidden and `macr-screenshot-quick`, which drops the shade and the
  handles. The selection is parked off the stage, so any press draws a new
  one; `drag-ended` captures (`_onCaptureButtonClicked`) when the drag is at
  least 4 logical pixels each way (`logic/quick.ts`), else parks it again.
  Space (from `captured-event`) checks GNOME's Window button, and a click on
  a window in its picker captures it. The picker is GNOME's spread of
  windows, not macOS's camera over the window in place. GNOME's last capture
  type and selection come back on `closed`.
- Super+Shift+5 and Print (`toolbar.ts`): one frosted row inserted into
  GNOME's panel, its two rows and close button hidden. Each button sets
  GNOME's toggles (`logic/toolbar.ts`), screenshot or screencast first,
  since screencast unpicks Window, and follows them on `notify::checked`.
  The record buttons follow `_castButton` and hide when recording is not
  available. Options is a popup menu inside the UI, over the frozen screen.
  `open` is wrapped on the instance to match the light or dark style as it
  opens; `delete` puts the prototype's back.
- The floating thumbnail (`thumbnail.ts`, `screenshot-thumbnail`): every
  capture goes through `_storeScreenshot`, which writes the file and then
  adds a notification to a new `screenshot-recorded-symbolic` source. Macr
  watches `source-added` (the source's `iconName` getter is null in 46, its
  `icon` names it) and, in `notification-added`, which runs before the
  banner request, sets `acknowledged` so no banner shows, and shows the
  notification's `St.ImageContent` at the bottom right of the primary work
  area (`logic/thumbnail.ts`), its corners cut by the shared
  `CornerEffect`. The file is the UI's `screenshot-taken` file,
  Super+Shift+3's result, or else the newest PNG GNOME just wrote
  (`logic/files.ts`; Shift+Print and Alt+Print hand nothing over). A click
  activates the notification, as GNOME's banner would; the menu copies the
  file (`St.Clipboard`), shows it in the folder app or trashes it. It goes
  after 5 s, not while hovered or its menu is open, and takes the
  notification with it: a transient notification without a banner is
  otherwise never removed.
- The thumbnail must not be in a screenshot, so `screenshot`,
  `screenshot_area` and `screenshot_stage_to_content` are wrapped on
  `Shell.Screenshot.prototype` (where ui/screenshot.js promisified them) to
  take it away first: Print, Shift+Print, Macr's keys and the D-Bus
  screenshot service (portal and `gnome-screenshot`) all shoot through them.
  Alt+Print paints only the window. `disable()` puts the methods back, or
  leaves a wrapper that does nothing if someone wrapped it again.
- Not done: dragging the thumbnail into an app (a shell actor cannot start
  a Wayland drag on 46), the timer and save-location options, and macOS's
  in-place window highlight.

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

## Settings window

- Laid out like macOS System Settings: `prefs.ts` puts an
  `Adw.NavigationSplitView` in the `Adw.PreferencesWindow` with
  `set_content()`, a sidebar of coloured tiles on the left and the chosen
  page on the right, collapsing to one column under 640sp. GNOME's prefs
  dialog fails unless a page was `add()`ed, so an empty one is added first
  and never shown. Adw's built-in search goes with it.
- Pages are listed in `prefs/pages.ts` (sidebar order, section, tile colour,
  builder) and built the first time they are shown. Tile styles come from a
  CSS provider on the display, removed when the window closes along with
  every signal the pages connect.
- About Macr lists clashing extensions: `shared/logic/clashes.ts` maps
  known extension UUIDs to the Macr settings they fight, and a clash shows
  only while that extension is in `org.gnome.shell enabled-extensions` and
  the Macr setting is on. Turn Off calls the shell's `DisableExtension`
  over D-Bus. Settings keys Macr does not have count as off.
- The shell tells about clashes too (`shared/clash-notice.ts`, run by
  `extension.ts` for every module, on the desktop only): a notification per
  running extension (ExtensionState ACTIVE, which also covers ones a session
  mode enables) that wholly clashes with a module that is on, with Turn Off
  (`extensionManager.disableExtension`) and Macr Settings. It checks after
  startup and on `extension-state-changed`, Macr's settings and session mode
  changes. `toTell` tells each clash once while it lasts; its notification
  goes when it ends. Partial clashes are left to the settings window: Macr
  cannot see when the user settles them inside the other extension.
