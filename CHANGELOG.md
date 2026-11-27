# Changelog

All notable changes to Key Scroll are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

Versions up to 0.1.0 were built before the project was on GitHub, so they have no date.

## [Unreleased]

## [0.1.1] - 2026-11-27

### Added

- Changelog of every version since the first prototype.
- "What's new" in the settings page, with a one-time notice in the popup after an update.

## [0.1.0]

### Added

- New dark interface for the popup and the settings page, with four tabs: Anchors, Record, Cursor and CSS. The popup reopens on the last tab used.
- Header buttons: record / stop (the circle turns into a square while recording), add an anchor, open the settings.
- Toolbar icon.
- Anchors can have a name, shown in the list instead of their position.
- Drag and drop to reorder anchors.
- Play, edit and delete buttons appear when hovering an anchor; a blue dot marks anchors that have their own settings.
- "Close anchor" button in the anchor editor.
- Curve editor with a grid and a vertical preview that plays when the editor opens and on demand.
- Ease presets show "Default" when the curve is the default one and "Custom" when it matches no preset.
- Alt + Shift + P plays and stops the anchors.
- Frame rate setting: 24, 25, 30, 50 or 60 fps (60 by default).
- Element picker: Cancel button, and Esc now works without clicking the page first.
- The shortcuts list shows the shortcuts actually assigned in the browser.

### Changed

- Renamed from "Case Study Recorder" to Key Scroll; the whole interface is now in English.
- The Speed, Pause and Ease fields at the top of the Anchors tab now only pre-fill the next anchor you add. Existing anchors keep their values (anchors that followed those fields were updated once so they scroll exactly as before).
- An empty field in an anchor now means the factory default value.
- Fields that use their default value show it as dimmed placeholder text.
- Default download folder: `key-scroll-recordings`.
- Fonts reduced from 7.4 MB to 40 KB: the extension went from 7.8 MB to about 500 KB.
- Code reorganized into folders and modules, with linting, formatting, tests and continuous integration.
- License: GPL-3.0.

### Fixed

- Ellipsis characters were drawn halfway up the line.

## [0.0.5]

### Added

- File name: tab title (27 characters at most) followed by the date and time of the recording.
- Download subfolder setting (browsers only allow folders inside Downloads).
- Settings page: default values of the popup (size, countdown, hidden scrollbars, anchor speed, pause and ease), with reset buttons.
- Video quality setting: 6, 12, 20 or 40 Mb/s.
- Debug option: saves a `.log.json` diagnostic file next to the video, including window resizes during the recording.
- The popup is split into tabs.
- Aspect ratio shown in the size presets.
- New presets 664 × 1180 (9:16) and 885 × 1180 (3:4); the 400 × 800 preset was removed.
- Link button to keep the width / height ratio when one of them changes.
- Custom size presets, managed in the settings page.

## [0.0.4]

### Added

- Cursor drawn in the page during a recording (the real pointer is hidden), with three display modes: always, auto (appears near links and draggable elements) and hidden.
- Mac, Windows and custom cursor styles, each with its own arrow, pointer, text, open hand and closed hand.
- Custom style icons can be replaced by your own SVG, with an adjustable hotspot.
- Click feedback (the cursor shrinks slightly), drop shadow, size, and a fluid movement with adjustable smoothing.
- Cursor test area and reset button in the settings page.
- Option to hide the page scrollbars during a recording.

### Fixed

- The real pointer was sometimes visible in the video.
- The closed-hand cursor didn't show on sites that use it.
- In auto mode, the cursor appeared when the page scrolled under it over a link.
- Stutters in the video when a slider (such as Swiper) kept moving after being released.

## [0.0.3]

### Added

- Custom CSS per page, with syntax highlighting and `//` comments.
- Element picker that adds the selector of a clicked element to the CSS.
- Preview switch: turned on automatically when a recording starts, can be changed during the recording, and goes back to its previous state at the end.

### Changed

- New encoding pipeline: H.264 with WebCodecs into an MP4 at a strict constant 60 fps (captured frames are placed on a fixed timeline). MediaRecorder is kept as a fallback.
- The default ease is back to cubic-bezier(0.69, 0, 0.36, 1).

### Fixed

- Occasional small jumps in the video: Chromium skipped frames for about 250 ms after a scroll stopped. A capture helper now keeps every frame, also after the page reloads during a recording.

## [0.0.2]

### Added

- Scroll anchors saved per page: add, next, previous and play, with keyboard shortcuts.
- Each anchor has a position, speed, pause and ease, with default values for all anchors.
- Ease as a text field and as a visual curve editor.
- Smooth scrolling driven frame by frame, so the result is identical on every site.

## [0.0.1]

### Added

- First prototype: records the current tab to an MP4 video at the exact size of the page viewport.
- Size presets and custom width / height, applied by resizing the browser window (no device emulation, no black bars).
- Countdown before recording and a Record / Stop shortcut.
