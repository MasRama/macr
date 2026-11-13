# Dock Stack Pile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dock stacks show their newest files piled on the tile (macOS "Display as: Stack"), follow the folder live, and the Downloads stack bounces once when a new item lands.

**Architecture:** Pure decisions (which entries, layer geometry, "is this a new arrival") go in `src/features/dock/logic/stack.ts`. `StackItem` in `src/features/dock/stack.ts` keeps a `Gio.FileMonitor` on its folder, re-reads it debounced, and fills a pile widget that its `BaseIcon`'s `createIcon` returns.

**Tech Stack:** TypeScript, GJS, GNOME Shell 46 (St, Clutter, Gio), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-dock-stack-pile-design.md`

## Global Constraints

- Setting `dock-stacks-display`, choices `stack` / `folder`, default `stack`.
- At most 3 items in the pile; newest on top.
- Every user-visible string through `_('…')`.
- Everything created by a stack (monitor, timeout, timeline) is removed when the stack is destroyed (the dock is destroyed in `disable()`).
- Conventional Commits, scope `dock`, signed, no AI attribution.

## Review Focus

- A Chrome/Firefox download in progress (`.crdownload`, `.part`) must not show or bounce until it is a finished file: covered by `visibleEntries` plus a `isNewArrival` test with partial files.
- Deleting the newest file shows the next one and does not bounce: `isNewArrival` test.
- First read after login or enabling must not bounce: `isNewArrival(null, …)` test.
- Rotated layers must stay inside the tile at any icon size (magnification): `pileLayers` bounds test.
- A folder that empties or disappears falls back to the folder icon without errors: `pileEntries([])` test, plus a devshell check.

---

### Task 1: Pile logic

**Files:**
- Modify: `src/features/dock/logic/stack.ts`
- Test: `tests/dock/stack.test.ts`

**Interfaces:**
- Produces:
  - `export const PILE_MAX = 3`
  - `export type StackDisplay = 'stack' | 'folder'`
  - `export function pileEntries<T extends StackEntry>(entries: readonly T[]): T[]` — `visibleEntries(entries).slice(0, PILE_MAX)`, newest first.
  - `export interface PileLayer { x: number; y: number; rotation: number; size: number }` — `x`, `y` offsets of the layer's centre from the tile centre and `size`, all as shares of the tile size; `rotation` in degrees.
  - `export function pileLayers(count: number): PileLayer[]` — bottom to top, `count` clamped to `0..PILE_MAX`; the top layer has `x = y = rotation = 0`.
  - `export function isNewArrival(before: StackEntry | null | undefined, after: StackEntry | null): boolean` — `before === undefined` means "not read yet" and gives false; true only when `after` is not null and was added later than `before` (or `before` is null, an empty folder getting its first item).

- [ ] **Step 1: Write the failing tests** in `tests/dock/stack.test.ts`:
  - `pileEntries` keeps the 3 newest visible entries, drops `.part`/hidden, returns `[]` for `[]`.
  - `pileLayers(0)` is `[]`, `pileLayers(5).length === 3`, `pileLayers(n).at(-1)` is `{x:0,y:0,rotation:0}` with `size` < 1.
  - Bounds: for every layer of `pileLayers(3)`, half the rotated square's extent `size/2 * (|cos θ| + |sin θ|)` plus `|x|` and `|y|` is ≤ 0.5.
  - `isNewArrival(undefined, e)` false; `(null, e)` true; `(e, e)` false; `(old, newer)` true; `(newer, old)` false (newest deleted); `(e, null)` false.
- [ ] **Step 2:** `npm test` — the new tests fail (exports missing).
- [ ] **Step 3:** Implement the exports. Layers bottom→top: `{x:-0.05, y:0.03, rotation:-9, size:0.74}`, `{x:0.05, y:0.01, rotation:7, size:0.74}`, `{x:0, y:0, rotation:0, size:0.78}`; `pileLayers(n)` returns the last `n`.
- [ ] **Step 4:** `npm test` — all pass.

### Task 2: Pile on the tile, Display as, live folder

**Files:**
- Modify: `schemas/org.gnome.shell.extensions.macr.gschema.xml` (key `dock-stacks-display` after `dock-downloads-view`)
- Modify: `src/features/dock/stack.ts`
- Modify: `src/prefs/pages.ts` (`stacksGroup`: a `comboRow` "Display stacks as", Stack / Folder, before "Show stacks as")
- Modify: `stylesheet.css` (`.macr-stack-pile StIcon` shadow)
- Modify: `ARCHITECTURE.md` (Downloads stack paragraph), `README.md` (Dock bullet)

**Interfaces:**
- Consumes: Task 1 exports, existing `readItems(folder, done)`.

- [ ] **Step 1:** Schema key with summary "How stacks show in the dock", description "Stack piles the newest items on the icon; Folder shows the folder's icon."
- [ ] **Step 2:** `StackItem`: `createIcon` returns `this.pile = new St.Widget({ width: size, height: size })` filled by `fillPile(size)`; `fillPile` puts the folder `St.Icon` when the display is `folder` or `pileEntries` is empty, else one `St.Icon` per `pileLayers` layer (gicon from the item, `icon_size = round(size * layer.size)`, positioned at the centre plus offsets, pivot 0.5/0.5, `rotation_angle_z`).
- [ ] **Step 3:** `StackItem` keeps `latest: Item[]` from `refresh()` (reads via `readItems`, then `fillPile(this.icon.iconSize)`); a `Gio.FileMonitor` from `folder.monitor_directory(WATCH_MOVES)` calls `refresh()` after a 400 ms debounce; `changed::dock-stacks-display` calls `fillPile`. On destroy: cancel monitor, remove the timeout.
- [ ] **Step 4:** Right-click menu: separator "Display as" with Stack / Folder (check ornament) before "View as".
- [ ] **Step 5:** `npm run check`, `npm run lint`, `npm test` (one at a time) — clean.
- [ ] **Step 6:** `npm run pack`, devshell with a Downloads folder holding a picture, a PDF and a `.part`; screenshot the tile in Stack and Folder; check magnification.
- [ ] **Step 7:** Commit `feat(dock): pile a stack's newest files on its Dock icon, as macOS does` with the spec and plan.

### Task 3: Bounce when a download lands

**Files:**
- Modify: `src/features/dock/dash.ts` (export `bounceEnabled(): boolean`)
- Modify: `src/features/dock/stack.ts`

- [ ] **Step 1:** In `refresh()`, for the Downloads stack (`source.path === null`), `isNewArrival(previousNewest, newest)` starts one bounce: a `Clutter.Timeline` of `BOUNCE_TIME` moving `this.icon` by `bounceShift(dockEdge(), bounceOffset(p, iconSize * BOUNCE_HEIGHT * scale))`, skipped when `!bounceEnabled()`; stopped on destroy.
- [ ] **Step 2:** check, lint, test, pack; devshell: copy a file into Downloads, watch the tile bounce (screenshot mid-bounce or log).
- [ ] **Step 3:** Commit `feat(dock): bounce the Downloads stack when a download finishes`.
- [ ] **Step 4:** Push `main`.
