Architecture Review — Issues Found

## note.ts

### Unbranded scheduling numbers
`time`, `duration`, and `vel` in `NoteEvent` and `PadEvent` are plain `number`. They can be silently swapped at call sites. `Seconds` already exists in `timing.ts` and could cover `time`/`duration`. `vel` (0.0–1.0) needs its own branded type like `Velocity`.

### Unsafe `midiToNote` conversion
`midiToNote` blindly trusts `Note.fromMidi` output — no validation for out-of-range MIDI numbers. Compare with `noteToMidi` which correctly checks for null and throws.

### Types-only module without responsibility
`note.ts` is mostly type definitions with two thin delegation wrappers to `tonal`. It's a vocabulary barrel, not an encapsulated domain concept. Imported by 6+ modules so it avoids circular deps, but lacks real behavioral ownership.
