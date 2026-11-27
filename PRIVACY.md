# Privacy policy

_Last updated: 2026-11-27_

Key Scroll is a browser extension that records the current tab to a video file and scrolls web pages between saved positions ("anchors"). This policy explains what the extension handles and what it does with it.

## In short

- Everything stays on your computer. Key Scroll has no server, no account, no analytics and no ads.
- Nothing is sent over the network, sold, or shared with anyone.
- The extension only acts on a page when you use it (recording, anchors, custom CSS, element picker, keyboard shortcuts).

## What the extension handles, and why

| Data                                                               | Why                                                                                                              | Where it is kept                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Content of the tab you record** (what is displayed on screen)    | To create the video you asked for. Frames are encoded in your browser and saved as an MP4 file.                  | The video is saved to your Downloads folder. Frames are not kept anywhere else. |
| **Address of the current page** (without query string or `#` part) | To remember the anchors and the custom CSS of each page, and to show them again when you come back.              | `chrome.storage.local`, in your browser profile.                                |
| **Title of the recorded tab**                                      | To name the video file.                                                                                          | In the file name only.                                                          |
| **Your settings, anchors, custom CSS and cursor icons**            | To make the extension work the way you set it up.                                                                | `chrome.storage.local`, in your browser profile.                                |
| **Mouse position and clicks on the recorded page**                 | To draw the cursor in the video.                                                                                 | Only in memory during the recording.                                            |
| **Diagnostic log** (optional "Debug" setting, off by default)      | To investigate recording issues. It contains timings of the captured frames and scroll events, not page content. | Saved next to the video in your Downloads folder.                               |

Key Scroll does not read form fields, passwords, cookies or your browsing history, and does not collect personal or personally identifiable information.

## Sharing

Key Scroll does not transfer any data to anyone. The only files it creates are the ones it saves to your Downloads folder.

## Deleting your data

- Videos and logs: delete them from your Downloads folder.
- Anchors, custom CSS and settings: remove them in the extension, or uninstall the extension, which deletes all of its stored data.

## Chrome Web Store User Data Policy

The use of information received by Key Scroll complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Changes

Changes to this policy are listed in the project's [changelog](CHANGELOG.md) and the date above is updated.

## Contact

Questions: open an issue at https://github.com/tlemaitre27/key-scroll/issues
