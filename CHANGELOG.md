# Changelog

## 0.30.0

- Removed old Stop/Resume state and related unused code.
- Removed unused extension permissions.
- Kept automatic capture behavior for Meet and Teams.
- Added safer cleanup for speaker-name suffixes accidentally appended to caption text.
- Added project documentation, privacy notes, and git hygiene files.

## 0.29.0

- Tightened Google Meet speaker detection so caption fragments are not treated as speaker names.

## 0.28.0

- Removed the Stop button from the panel.

## 0.27.0

- Improved Microsoft Teams caption fallback capture.
- Normalized `Kumar, Amit` to `You (Amit Kumar)`.
