# Instructions for coding agents

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing code. It is the
authority on structure.

## Commands

| Task | Command |
|---|---|
| Install dependencies | `npm ci` |
| Type check | `npm run check` |
| Lint | `npm run lint` |
| Test the logic | `npm test` |
| Pack the extension | `npm run pack` |
| Lint shell scripts | `shellcheck scripts/*.sh tools/devshell/*.sh` |
| Try the UI | `npm run pack`, then `tools/devshell/run.sh` (`--light` for the light scheme), `tools/devshell/shot.sh NAME`, `tools/devshell/stop.sh` |

Run heavy commands (anything that compiles, bundles or tests) one at a time,
never in parallel.

## Rules

- **Augment, never replace.** A module adds to GNOME's own UI and restores
  whatever it hid or moved in `disable()`. Every signal, source and actor
  created in `enable()` is removed in `disable()`.
- **Tests first.** Decisions go in a `logic/` module (no `gi://` or
  `resource://` imports) with a `node --test` test in `tests/`.
- **Every string the user reads** goes through `_('…')`.
- **Never touch the user's session while testing.** Use `tools/devshell/`.
- **Conventional Commits** with a real scope (`menubar`, `dock`, `prefs`,
  `devshell`). The changelog is generated from them, so describe the change
  the user sees.
- Do not edit `CHANGELOG.md` or version numbers by hand. release-please owns
  them.
