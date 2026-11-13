# Spaces bar (+ and ×) and two more hot corner actions

Ren asked for both on 2026-11-13 ("2,3 dulu", then "gas B sesuai
rekomendasi kamu"). Ren approved the direction (fixed Spaces, as on macOS); the
other calls below are mine, listed at the end.

## Why

Mission Control's Spaces bar shows the desktops but cannot add or close
one. On macOS a **+** at the right of the bar adds a Space that stays
until it is closed with the **×** on its thumbnail. Hot corners lack two
macOS actions that Macr can already do.

## Approaches (Spaces)

- **A. Keep GNOME's dynamic workspaces.** The trailing empty workspace
  shows as a + tile; × moves the windows away and GNOME drops the empty
  workspace. No setting changes, but an empty Space never stays, so + is
  only "go to an empty desktop".
- **B. Fixed Spaces while Mission Control runs (picked).** Macr turns
  `org.gnome.mutter dynamic-workspaces` off, keeping the desktops in use,
  and puts it back on disable. + adds a Space that stays; × closes one.

## Design

- **Fixed Spaces** (`missioncontrol/fixed-spaces.ts`): on enable, when
  dynamic workspaces are on, `num-workspaces` is set to the desktops in use
  (the trailing empty one dropped, `logic/spaces.ts keptCount`), then dynamic
  is turned off. The original count goes to `mission-control-saved-workspaces` (0 when
  nothing is saved), so a crash still gets it back. Disable
  turns dynamic on first, then puts the count back. If the user had fixed
  workspaces already, nothing is saved or put back.
- **+**: a frosted tile at the right edge of each Spaces bar's monitor,
  level with the bar. A click appends a Space (not switched to). A window
  dropped on it goes to a new Space.
- **×**: on the top-left of a thumbnail under the pointer, when there is
  more than one Space. Closing moves its windows to the Space on the left
  (the right one for the first, `closeTarget`), switches there if it was
  showing, and removes the workspace. `num-workspaces` follows every change.
- **Full-screen Spaces** works with Macr's fixed Spaces too (shared flag,
  `shared/fixed-spaces.ts`), and removes the Space it made once its window
  leaves, since GNOME no longer does.
- The Mission Control module now runs on the lock screen too: turning it
  off there would bring dynamic workspaces back and drop empty Spaces.

## Hot corner actions

- **Application Windows**: App Exposé for the focused app (`expose-link`),
  again to close it.
- **Put Display to Sleep**: Mutter's `PowerSaveMode` set to off over D-Bus.
  Macr wakes the displays itself on the first input after a second of
  stillness (an idle watch, then a user-active watch), so the push into the
  corner does not wake them at once.
- Quick Note is left out: Linux has no such thing to open.

## Calls made without asking

- Closing a Space sends its windows left, as the nearest place.
- + adds at the end and does not switch.
- The second-long wait before input wakes a sleeping display.
