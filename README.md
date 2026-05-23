# Meeting Caption Capture

A lightweight browser extension that captures the live captions already shown by Google Meet and Microsoft Teams, then lets you copy or save the transcript as plain text.

It does not use OpenAI, API keys, browser speech recognition, screen sharing, or microphone access. Meet/Teams do the captioning; this extension only reads the visible caption text from the meeting page.

## Features

- Works with Google Meet in the browser.
- Works with Microsoft Teams in the browser.
- Captures automatically when meeting captions are visible.
- Shows a movable, resizable transcript panel.
- `Hide` keeps the panel out of screen shares.
- `Copy` and `Save` export the cleaned transcript.
- Cleans common rolling-caption duplicates and accidental speaker-name suffixes.
- Stores transcript locally in browser local storage for the meeting URL/version.

## Install

1. Open Brave, Chrome, or Edge.
2. Go to `brave://extensions`, `chrome://extensions`, or `edge://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

```text
meeting_caption_capture_extension
```

## Use

1. Join a Google Meet or Microsoft Teams meeting in the browser.
2. Turn on captions:
   - Google Meet: click the `CC` button.
   - Microsoft Teams: `More` -> `Language and speech` -> `Show live captions`.
3. Keep the `Live Transcript` panel open while the meeting runs.
4. Drag the header to move it, drag the bottom-right corner to resize it, or click `-` to minimize it.
5. Click `Hide` before screen sharing. Press `Ctrl+Shift+Y` to show or hide the panel again.
6. Click `Save` at the end to download a `.txt` transcript.

## Project Structure

```text
meeting_caption_capture_extension/
  manifest.json   Chrome/Brave/Edge extension manifest
  content.js      Caption detection, cleanup, panel UI, copy/save behavior
  README.md       Install and usage notes
  PRIVACY.md      Privacy statement
  CHANGELOG.md    Release notes
```

## Development

After editing files:

1. Run `node --check content.js`.
2. Validate `manifest.json`.
3. Reload the extension from the browser extensions page.
4. Refresh the Meet/Teams tab.

## Notes

- Teams desktop app is not supported; use Teams in the browser.
- If captions are off, there is no text to capture.
- Caption quality depends on Google Meet or Microsoft Teams live captions.
- This is intended for personal transcription. Follow your local rules and meeting consent requirements.
