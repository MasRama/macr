# Contributing to Macr

Thanks for helping. This file covers how to set up, what a good change looks
like and how releases work.

## Before you start

- For a bug, open an issue with the steps to reproduce it, unless the fix is
  small and obvious.
- For a new feature or module, open an issue first and describe what macOS
  does that you want to bring. Each one gets agreed on in the issue before
  code.
- Read [ARCHITECTURE.md](ARCHITECTURE.md).
- Macr supports GNOME Shell 46 only for now. Support for other versions is a
  separate discussion.

## Setup

You need Node.js 22.13 or newer, and GNOME Shell 46 to try the extension.

```sh
npm ci
npm run check   # type-check
npm run lint
npm test        # unit tests for the logic/ folders
npm run pack    # build/macr@masrama.github.io.shell-extension.zip
```

`tools/devshell/run.sh` starts the packed extension in a headless GNOME Shell
on its own D-Bus and config directories, so it cannot touch your session.
`tools/devshell/shot.sh NAME` saves a screenshot to `build/shots/NAME.png`,
`tools/devshell/eval.sh "<js>"` runs JavaScript inside that shell and
`tools/devshell/stop.sh` ends it.
`run.sh --gdm` starts it as the login screen instead (GDM's greeter mode).

## Making a change

- Write a test that fails without your change, then make it pass. Decisions
  belong in a `logic/` module so they can be tested with Node.
- Everything a module adds, hides or connects in `enable()` is removed or
  restored in `disable()`.
- Run what CI runs before you push: `npm run check`, `npm run lint`,
  `npm test`, `shellcheck scripts/*.sh tools/devshell/*.sh` and
  `npm run pack`.
- For changes to what Macr draws, add a devshell screenshot to the pull
  request.

## Commit messages

Macr uses [Conventional Commits](https://www.conventionalcommits.org/). The
changelog and version numbers are generated from them, so write the message
for someone reading the changelog:

```
feat(dock): magnify icons under the pointer
fix(menubar): keep the clock last when an indicator is added
docs: explain how to turn off Dash to Dock
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`,
`chore`. Scopes: `menubar`, `dock`, `prefs`, `devshell`. A breaking change
gets a `!` after the scope and a `BREAKING CHANGE:` footer.

## Releases

Releases are automated with
[release-please](https://github.com/googleapis/release-please). It keeps a
release pull request open that collects the changes on `main`. When a
maintainer merges it, it tags the version, writes `CHANGELOG.md`, and CI
attaches the extension zip and its `SHA256SUMS` to the GitHub release.
Version numbers follow [SemVer](https://semver.org/).

## Code of conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
