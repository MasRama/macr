# Changelog

## [0.3.0](https://github.com/MasRama/macr/compare/v0.2.0...v0.3.0) (2026-11-13)


### Features

* **control-center:** add a Stage Manager toggle ([4722f8a](https://github.com/MasRama/macr/commit/4722f8aee43430873ba101f20337f0fe3f4dd2a2))
* **menubar:** add Move & Resize to the Window menu ([3d75ba3](https://github.com/MasRama/macr/commit/3d75ba3829c109b028da5d432c9f312545886e5d))
* **prefs:** add a Screenshots page ([fa07722](https://github.com/MasRama/macr/commit/fa077223b2915a961dff357cadaef025bff05def))
* **prefs:** add a Stage Manager switch to the Mission Control page ([392b560](https://github.com/MasRama/macr/commit/392b560cf6dd50ff59dfe9818889e958084b1799))
* **prefs:** add tiling settings to the Windows page ([8df2cb8](https://github.com/MasRama/macr/commit/8df2cb8f3513d9ee992887eb33f76650d3c913c1))
* **prefs:** lay out the settings like macOS System Settings ([b6b0876](https://github.com/MasRama/macr/commit/b6b08768f95b39911e5c74a19a83ae6d652b81da))
* **screenshot:** show a floating thumbnail after each screenshot ([8373e86](https://github.com/MasRama/macr/commit/8373e86c9e30db8873fc4dcab309a7fd7f76e76c))
* **screenshot:** show the toolbar as the macOS bar on Super+Shift+5 ([b237ed6](https://github.com/MasRama/macr/commit/b237ed600d1ea83190eae51b4bb156f27e7e3684))
* **screenshot:** take a dragged area or a window with the crosshair on Super+Shift+4 ([4c9d6af](https://github.com/MasRama/macr/commit/4c9d6afd75a23201f882a16aec1cf2684cf3afb1))
* **screenshot:** take a screenshot of the whole screen with Super+Shift+3 ([35ccaa2](https://github.com/MasRama/macr/commit/35ccaa2e217c2f950c86a69f22eb452a2e554f32))
* **stage-manager:** keep the focused app in the middle and the others as stages on the left ([eed80e1](https://github.com/MasRama/macr/commit/eed80e1b9c9361966d0168c05d91be55b1e05eef))
* **tiling:** add keyboard shortcuts to tile, arrange and restore windows ([85c716f](https://github.com/MasRama/macr/commit/85c716f5609bc4c10929d03bf2f9cdebc7bebdc2))
* **tiling:** snap windows to halves, quarters and Fill by dragging them to the screen edges ([caf1e6f](https://github.com/MasRama/macr/commit/caf1e6f7f7c364a988feb829f7042f8625c0afd4))


### Bug Fixes

* **stage-manager:** keep your next minimize and restore animations after a quick swap or turning it off ([2b3b48c](https://github.com/MasRama/macr/commit/2b3b48c7be4fcd578e114eddf68f934ab49c031f))

## [0.2.0](https://github.com/MasRama/macr/compare/v0.1.0...v0.2.0) (2026-11-12)


### Features

* **devshell:** start as the login screen with --gdm ([6c05aa5](https://github.com/MasRama/macr/commit/6c05aa582d399847302524303921f16fedccf209))
* **hot-corners:** open Mission Control, Launchpad and more from screen corners ([6479173](https://github.com/MasRama/macr/commit/6479173beec764875c1a842c95943a9117b79e79))
* **lockscreen:** show a macOS lock screen ([3ff2fd5](https://github.com/MasRama/macr/commit/3ff2fd5640ab75a934aa7e24b2ddb9ba27a4f037))
* **loginscreen:** give GDM's login screen the macOS look ([0cacea4](https://github.com/MasRama/macr/commit/0cacea46edd18a52ca65bf6e974c608b1336ceba))
* **menubar:** show the focused app's own menus in the menu bar ([431aaf6](https://github.com/MasRama/macr/commit/431aaf60a240308802c395de225c063a48073b84))
* **mission-control:** show the overview as macOS Mission Control ([91bcd27](https://github.com/MasRama/macr/commit/91bcd27c71cabd68e86887bdbe58f3d1b319f411))
* **notifications:** show banners at the top right and a macOS Notification Center ([6ab945e](https://github.com/MasRama/macr/commit/6ab945efefa124d964f9d9dd8464dcac19458a4b))
* **osd:** show volume and brightness as a macOS pill at the top right ([fc7e4ca](https://github.com/MasRama/macr/commit/fc7e4ca0497488bf431bca9a6c1570c2047c19f5))
* **switcher:** show Alt+Tab as the macOS app switcher ([1ce29fc](https://github.com/MasRama/macr/commit/1ce29fcdca777c6eb680ef745bd038eddd66b7cf))
* **traffic-lights:** draw macOS traffic lights on app windows ([11ec65e](https://github.com/MasRama/macr/commit/11ec65ef124d4e6b14f5f245a13211f014164c10))
* **window-corners:** round the corners of windows that do not round their own ([80c0d71](https://github.com/MasRama/macr/commit/80c0d7192401fabb18aa3fb5d997d1fa3363b44b))


### Bug Fixes

* **devshell:** keep Eval working while the screen is locked ([a4e0179](https://github.com/MasRama/macr/commit/a4e0179ca13a2d181346643fea8a3af1c84d42df))
* **dock:** size the dock icons once the dock is on the stage ([a447309](https://github.com/MasRama/macr/commit/a4473093d13256ce76f041244e7dfa6bc68ef30a))
* **menubar:** keep mirrored tray icons at their real size on other bars ([1d8dbec](https://github.com/MasRama/macr/commit/1d8dbec45b999cf5e406177624d9c576ef93a882))

## 0.1.0 (2026-11-12)


### Features

* **app-icons:** give icons the icon theme lacks a macOS tile ([a9b85c6](https://github.com/MasRama/macr/commit/a9b85c63335b6c93e87f473d856bfd6dd2c10f79))
* **control-center:** show quick settings as the macOS Control Center ([5160090](https://github.com/MasRama/macr/commit/51600903d790f6f7fd6931b88e332760caca6fb8))
* **dock:** add the dock's magnification, click and genie math with tests ([227579a](https://github.com/MasRama/macr/commit/227579adf22055672d70cbc0d5351311c997e5bb))
* **dock:** add the macOS dock ([73fcd59](https://github.com/MasRama/macr/commit/73fcd5983b6bc90f69c204f94dbb2f6b17343380))
* **dock:** minimize windows into the dock with the genie effect ([70e971d](https://github.com/MasRama/macr/commit/70e971dd81ab212262942c4bf6d9465577e78e01))
* **dock:** show the dock on every monitor ([3c2a0c8](https://github.com/MasRama/macr/commit/3c2a0c838a014a5b510d1539b9d35a8c4f6a45cb))
* **launchpad:** add Launchpad on Super and the dock's Apps icon ([a6a429f](https://github.com/MasRama/macr/commit/a6a429f3ac48e445dc10214181a95de25770835f))
* **menubar:** add the logo, app and Window menus and the macOS clock ([5f4ca5c](https://github.com/MasRama/macr/commit/5f4ca5c1387ae1c5b3de5e983f95f026888f4690))
* **menubar:** add the menu bar's pure logic with tests ([95c9b71](https://github.com/MasRama/macr/commit/95c9b71f3b60ad0ad714fe47340939b55709c401))
* **menubar:** show app tray icons on every monitor's bar ([89be483](https://github.com/MasRama/macr/commit/89be483328a644cb15c2d7754a24fb038716d5de))
* **menubar:** show the menu bar on every monitor ([0cd9022](https://github.com/MasRama/macr/commit/0cd90226412b367381673d8a659d8f69c112929c))
* **prefs:** add dock settings ([c1d93e9](https://github.com/MasRama/macr/commit/c1d93e92a3bd9e6f46c198a006feb8bbe0ba5c11))
* **spotlight:** add Spotlight search on Ctrl+Space ([2f6c466](https://github.com/MasRama/macr/commit/2f6c466832fe0f4ae6249c07675dcce270682269))


### Bug Fixes

* **dock:** centre the grid in the Apps icon ([0c6b865](https://github.com/MasRama/macr/commit/0c6b8657e1a7ea4d0ed22aab24b893b46cfba4e4))
* **dock:** name the Apps icon Launchpad while Launchpad runs ([58f43ba](https://github.com/MasRama/macr/commit/58f43ba0565501ce833e0ea5a4615fc160b9cffc))
* **menubar:** forget panel buttons another extension destroys ([7f5b3ee](https://github.com/MasRama/macr/commit/7f5b3ee9d7953cb1c0c22bc93a576647d28fa98a))
* **prefs:** drop the note that Super keeps opening the distribution menu ([3492a3a](https://github.com/MasRama/macr/commit/3492a3a3411f42fe2a7917d27086c59fb014aef4))
