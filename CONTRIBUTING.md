# Contributing to Key Scroll

Thanks for helping! Bug reports, ideas and pull requests are welcome.

## Before you start

- For a bug, open an issue with the browser and version, the page you were recording (if public), what you expected and what happened. With **Debug** turned on in the settings page, a `.log.json` file is saved next to each video: attaching it helps a lot with recording issues (dropped frames, stutters).
- For a new feature, open an issue first so we can agree on the behavior before you write code.

## Setup

```bash
npm install
```

Load the folder as an unpacked extension (see the README), then:

```bash
npm run check     # lint + tests, run this before opening a pull request
npm run format    # format with Prettier
```

## Conventions

- **No build step and no runtime dependencies.** The repository is loaded by the browser as it is. A new dependency needs a very good reason; if it is needed, vendor it in `vendor/` with its license.
- **English** for code, comments, commit messages and the UI.
- **Comments explain why**, not what. Browser workarounds (capture, cursor, Barba-like sites…) must say what problem they solve, so nobody removes them by accident.
- **Where code goes:**
  - shared helpers used by more than one part → `lib/` (plain scripts, `KS_*` constants and `ks*` functions, `var` and function declarations only);
  - code that runs in web pages → `content/` (each file is an IIFE that registers itself on `globalThis.__keyScroll` and guards against double injection);
  - popup → `popup/` (ES modules, one per tab);
  - new content scripts must be added to `manifest.json` in the right order.
- **Nothing visible in the page** unless it is meant to be recorded: feedback goes to the toolbar badge or the popup, never into the page.
- **Storage changes need a migration.** If you rename or change the shape of a stored value, add a one-time migration in `background.js` (see `freezeAnchorValues`) so existing users keep their anchors and settings.
- Pure functions in `lib/` should come with a test in `tests/`.

## License of contributions

Key Scroll is released under the GPL-3.0. By submitting a contribution (pull request, patch,
code in an issue), you agree that it is licensed under the GPL-3.0 **and** that the project
maintainer may also distribute it under other license terms, including commercial ones. This
keeps the project able to offer other licenses in the future; your contribution stays available
under the GPL-3.0 in this repository either way.

## Pull requests

1. Create a branch from `main`.
2. Keep the change focused; one topic per pull request.
3. Run `npm run check`.
4. Test it in a browser: the popup, the settings page, and a short recording if you touched the recording path.
5. Describe what changed and how you tested it.
