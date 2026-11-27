# Key Scroll

A Chromium extension (Chrome, Opera, Edge, Brave…) to record smooth, repeatable scroll videos of a website for design case studies.

- **Scroll anchors**: save scroll positions on a page, then glide between them with a keyboard shortcut or play them all in sequence. Each anchor can have its own speed, pause and easing curve.
- **Exact viewport size**: resize the window so the page is exactly 1440 × 900, 1080 × 1350, etc.
- **Clean MP4 recording**: the tab is recorded at a constant frame rate (60 fps by default) with hardware H.264 encoding, straight to your Downloads folder.
- **Drawn cursor**: the real mouse pointer is replaced by a crisp cursor (custom, Mac or Windows style) that can show clicks and hide away from links.
- **Custom CSS per page**: hide cookie banners, chat bubbles… only while recording or when previewing.

Everything runs locally in the browser. Nothing is sent anywhere.

## Install (from source)

1. Download or clone this repository.
2. Open `chrome://extensions` (Opera: `opera://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the repository folder (the one that contains `manifest.json`).
4. Pin the Key Scroll icon to the toolbar.

> Chrome keeps your anchors and settings per extension folder: if you move the folder, load it again and your saved data starts empty.

## Use

1. Open the page to record and click the Key Scroll icon.
2. **Anchors** tab: scroll to a position and click **+ Add** (or <kbd>⌥ Alt</kbd> + <kbd>⇧ Shift</kbd> + <kbd>A</kbd>). Repeat. Use **Next / Prev.** or <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>↓ / ↑</kbd> to glide between anchors, **Play** (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>) to chain them.
3. **Record** tab: pick a size and click **Apply size**, then **Record** (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>). Press the same shortcut again to stop.
4. The video is saved to `Downloads/key-scroll-recordings/<tab title> <date> <time>.mp4`.

Shortcuts can be changed at `chrome://extensions/shortcuts`. The settings page (gear icon) has the download folder, frame rate, video quality, size presets, cursor options and custom cursor icons.

### Permissions

| Permission                                     | Why                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tabCapture`, `offscreen`                      | Record the tab and encode the video in a hidden document.                                                                    |
| `downloads`                                    | Save the video to the Downloads folder.                                                                                      |
| `scripting`, `activeTab`, `tabs`, `<all_urls>` | Scroll the page, add the drawn cursor and the custom CSS, measure and resize the viewport, on any site you choose to record. |
| `storage`                                      | Remember anchors, custom CSS and settings.                                                                                   |

## Project structure

No build step: the files in this folder are exactly what the browser loads.

```
manifest.json         Extension manifest (MV3)
background.js         Service worker: viewport, countdown, recording, downloads, shortcuts, message relay
lib/                  Plain scripts shared by every part (defaults, easing, page keys, file names, sizes, cursor icons)
content/              Content scripts injected in web pages
  shared.js           Namespace shared by the content scripts + diagnostic log
  scroll.js           Scroll engine, anchors, playback, ⌥⇧P shortcut
  page-style.js       Custom CSS of the page, hidden scrollbars
  cursor.js           Cursor drawn during a recording
  capture-assist.js   Workaround that keeps Chromium's tab capture from dropping frames
  picker.js           Element picker of the CSS tab
  main.js             Message routing
offscreen/            Hidden document that captures the tab and encodes the MP4 (WebCodecs + mp4-muxer)
popup/                Toolbar popup (ES modules, one per tab)
options/              Settings page
styles/theme.css      Dark theme shared by the popup and the settings page
assets/               Fonts (subset WOFF2) and icons (SVG)
vendor/mp4-muxer.js   Third-party MP4 muxer (MIT)
tests/                Unit tests of lib/ (Node's built-in test runner)
```

### How the pieces talk

- The **popup** sends messages to the **service worker** (`target: 'background'`), which relays page actions to the **content scripts** (`type: 'content'`).
- Recording: the service worker gets a tab capture stream id and hands it to the **offscreen document**, which resamples the frames onto a constant frame-rate grid, encodes H.264 and sends back the MP4 to download.
- Shared state lives in `chrome.storage.local` (anchors per page, CSS per page, settings) and `chrome.storage.session` (current recording state, which the popup listens to).

### Why `lib/` uses plain scripts

The content scripts and the service worker (through `importScripts`) can't import ES modules, so the shared helpers are plain scripts that define `KS_*` constants and `ks*` functions. They only use `var` and function declarations so they can be injected twice without errors. The popup itself is written as ES modules.

## Develop

Requirements: Node.js 20+ (only for linting and tests; the extension itself has no dependencies).

```bash
npm install
npm run lint      # ESLint
npm test          # unit tests of lib/
npm run format    # Prettier
npm run package   # key-scroll.zip with only the extension files (for the Chrome Web Store)
```

After changing a file, click the reload button of Key Scroll in `chrome://extensions` and reload the tab you test on.

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and pull requests.

## Credits

- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) by Vanilagy, MIT license (`vendor/mp4-muxer.LICENSE`).
- Fonts: [Asta Sans](https://github.com/42dot/Asta-Sans) and [DM Mono](https://github.com/googlefonts/dm-mono), SIL Open Font License 1.1 (`assets/fonts/`).

## License

Copyright (C) 2026 tlemaitre27

Key Scroll is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License version 3](LICENSE) as published by the Free Software Foundation.
It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the license for details.
