# music-score

A frontend-only web app for writing staff notation with features that help you read sheet music.

https://yutachaos.github.io/music-score/

## Features

- **Score editor**: Click on the staff to place notes. Pick duration, dots, rests, accidentals, clef, key signature, and time signature from the palette. Use ↑/↓ to change pitch, ←/→ to move the selection, Delete to remove, and Ctrl+Z to undo
- **Reading aids**: Playback with the current note highlighted, tempo control, transposition, and note-name display (Doremi / CDE)
- **Saving**: Multiple scores autosaved to the browser (localStorage). Export as JSON / ABC, import from JSON
- **Photo recognition (experimental)**: Recognizes notes from a photo of cleanly printed, monophonic, treble-clef sheet music. All durations are read as quarter notes, so fix them in the editor after importing

## Development

```bash
npm install
npm run dev    # dev server
npm test       # unit tests (vitest)
npm run build  # build
```

Pushing to main deploys to GitHub Pages via GitHub Actions.
