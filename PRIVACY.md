# Privacy

Meeting Caption Capture runs locally as a browser extension content script.

- It does not request microphone permission.
- It does not record audio.
- It does not use screen sharing.
- It does not call external APIs.
- It does not send transcript text to any server.
- Transcript text is kept in browser local storage for the current meeting URL/version and can be copied or saved by the user.

The extension content script only runs on the page matches listed in `manifest.json`:

- `https://meet.google.com/*`
- `https://teams.microsoft.com/*`
- `https://*.teams.microsoft.com/*`

The extension reads visible caption text from supported meeting pages and displays it in the local transcript panel.
