# Dock stacks show their newest files

## Intent

On macOS the Downloads stack in the Dock shows the newest downloads piled on
top of each other ("Display as: Stack", the default), so you can see what just
arrived without clicking. Macr draws every stack as a plain folder icon and only
reads the folder when the stack is clicked. Ren noticed the Downloads tile is
just a blue folder and wants the macOS pile.

## Goals

- A stack's Dock tile shows up to the 3 newest visible items piled up: the
  newest on top, the ones under it shifted and slightly turned. Images and
  videos use their thumbnail when one exists, other files their file-type icon.
- An empty folder (or one with only hidden or unfinished files) shows the
  folder icon.
- Right-click menu gains a **Display as** section, **Stack** / **Folder**,
  above **View as**. One setting for every stack, like View as.
- The tile follows the folder live: a file monitor re-reads the folder
  (debounced) and redraws the pile. When a new item lands, the Downloads
  stack bounces once, like the Dock's app bounce.
- Macr's settings Dock page gets the same choice.

## Non-goals

- Sort by (Date Added, Name, Kind) and View content as List.
- Per-stack display settings.
- Generating thumbnails Nautilus has not made yet.

## Anti-goals

- No layout jump or blur at magnified sizes: the pile is redrawn at the
  icon size the Dock asks for, like the app icons.
- No new busy work: one monitor per stack, re-read at most a few times per
  second, removed in `disable()` (stack destroy).

## Approaches

1. **Pile drawn in the tile's `createIcon`** (picked): the BaseIcon's icon
   factory returns a widget with up to three layered `St.Icon`s, rebuilt on
   size changes and when the folder changes. Fits the existing `setIconSize`
   path the Dock already uses for magnification.
2. Render the pile to one texture/canvas: sharper control of shadows, but
   needs Cairo drawing of icons and thumbnails, much more code.
3. Show only the newest file's icon: simplest, but not the macOS pile Ren
   asked for.

## Decided

- Setting `dock-stacks-display`, choices `stack` / `folder`, default `stack`.
- Up to 3 items in the pile.
- Layout (offsets, rotations, scale of each layer relative to the icon size)
  lives in `src/features/dock/logic/stack.ts` with `node --test` tests.
- Bounce once on a new item only for the stack (not on start-up or after
  removals), reusing the Dock's bounce animation.

## Left to the builder

- Exact offsets and angles, tuned against devshell screenshots.
- Debounce interval for the monitor.
