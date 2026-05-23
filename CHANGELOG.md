# Changelog

## 0.31.0

- Added Google Meet-only raw caption snapshots so saved/copied transcripts are recomputed from captured caption history instead of the live panel draft.
- Kept Microsoft Teams on the existing capture/export path.

## 0.30.1

- Fixed panel dragging on Google Meet preview pages so camera on/off no longer changes how far up the transcript panel can move.

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
