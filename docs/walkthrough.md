Song Engine — Codebase Walkthrough

## The Big Picture

The app is a **procedural music generator**. Given a seed number, it deterministically creates a complete song — chord progressions, melodies, drums, arpeggios — and plays it through synthesizers in the browser.

The key architectural idea is **separation of generation from playback**. The original `music_gen_v2.html` mixed "what notes to play" with "how to play them" in a single 860-line file. The refactored code computes a complete `Song` data object first, then hands it to a separate playback engine. This is the classic **data-driven** approach — generate a plan, then execute it.

## Dependency Flow

```
index.html
  └─ main.ts  (app entry — state machine, DOM, wiring)
       ├─ song.ts  (orchestrator — assembles a Song from all generators)
       │    ├─ rng.ts       (seeded randomness)
       │    │    └─ brand.ts (type-level nominal typing)
       │    ├─ note.ts       (note/MIDI conversions, event types)
       │    ├─ markov.ts     (chord progression via Markov chain)
       │    ├─ voice-leading.ts  (smooth chord voicing)
       │    ├─ drums.ts      (pattern lookup by energy level)
       │    ├─ arp.ts        (arpeggiator patterns)
       │    ├─ melody.ts     (motif generation & variation)
       │    ├─ dynamics.ts   (energy curves, instrument activation)
       │    └─ timing.ts     (BPM curves, bar start times)
       ├─ playback.ts  (Tone.js audio engine)
       └─ ui.ts        (DOM rendering, log display)
```

---

## Layer 1: Foundation Types

### `brand.ts` (2 lines)

```ts
declare const __brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [__brand]: B }
```

Creates **nominal types** — types that are structurally identical to `number` or `string` but the compiler treats them as different. A MIDI number, a BPM, a seed — all plain `number` in the original. With branding, you can't accidentally pass a BPM where a MIDI number was expected.

### `rng.ts` — Seeded Randomness

**Insight:** The original used a module-level mutable `_seed` variable — classic global state. The refactored version wraps it in a `createRng(seed)` function that returns an `Rng` object. This means you could create multiple independent RNG streams without them corrupting each other. The RNG is also now passed as a parameter to every function that needs randomness, making the data flow explicit instead of hidden.

Exports:
- `Seed` — branded number type
- `Rng` — interface with `next()`, `int(min, max)`, `pick(arr)`
- `createRng(seed)` — factory using the `seedrandom` library

### `note.ts` — Musical Type System

Branded types used across the whole system:

- `NoteName` — e.g. `"C4"`, `"Eb3"`
- `MidiNumber` — e.g. `60`, `63`
- `ChordSymbol` — e.g. `"Cm"`, `"Eb"`

Also defines the two event shapes that every instrument generator produces:
- `NoteEvent` — a single note at a time with duration and velocity
- `PadEvent` — multiple notes (a chord) at a time

---

## Layer 2: Music Theory Modules

Each module owns one musical concept.

### `markov.ts` — Chord Progressions

A weighted transition matrix (`Im → bIII` with weight 2, etc.) and `generatePhrase()` that walks 4 steps through it. Now takes `rng: Rng` as a parameter instead of reading from a global. Exports `RomanNumeral` branded type.

### `voice-leading.ts` — Smooth Chord Voicing

`closestVoicing()` picks the voicing (inversion) of a chord that requires the least finger movement from the previous chord. Minimizes total MIDI distance between voices.

### `drums.ts` — Pattern Banks

Hardcoded kick/snare/hat pattern arrays (8 steps per bar) organized by energy level (`low`/`mid`/`high`/`peak`). Selector functions (`selectKickPattern(level, variant)`) rather than direct array access. Exports `DrumEvent` type (just `{ time, vel }` — drums don't have pitch).

### `arp.ts` — Arpeggiator

Takes chord notes and fans them out across 8 steps in patterns: up, down, updown, or random. Returns `NoteEvent[]` directly.

### `melody.ts` — Motif System

Generates a "motif" (a short sequence of 4-8 scale degrees), repeats and varies it throughout the song. The variation amount is controlled — ~30% of notes change, only by 1 step — so the melody evolves but stays recognizable.

**Insight:** The motif system is how the generator creates melodies that sound coherent rather than random. It generates a short pattern of 4-8 notes, then **repeats and varies** it throughout the song. This is a simplified version of how real composers work with themes.

Exports:
- `createMotif()` — generates the initial degree sequence
- `varyMotif()` — slight random mutations
- `createRhythm()` — which steps in the motif actually sound
- `motifToEvents()` — converts degrees to `NoteEvent[]`

### `dynamics.ts` — The "Mix Engineer"

Controls which instruments are playing and how loud at any point in the song. Two key concepts:

**Energy curve** — Each section (intro, build, peak, etc.) has a base energy. The curve smooths transitions (3-pass averaging) and adds subtle noise for organic feel.

**Sigmoid activation** — Each instrument has a threshold energy where it "turns on." The sigmoid creates a smooth fade-in rather than abrupt on/off:

```
Energy:  0.0 ──────── 0.5 ──────── 1.0
   pad:  ████████████████████░░░░░░░░░░  (threshold 0.05, always on)
  bass:  ░░████████████████████░░░░░░░░  (threshold 0.18)
   hat:  ░░░░░████████████████████░░░░░  (threshold 0.30)
  kick:  ░░░░░░░░████████████████████░░  (threshold 0.42)
   arp:  ░░░░░░░░░░░░░████████████████░  (threshold 0.55)
 snare:  ░░░░░░░░░░░░░░░░░██████████████ (threshold 0.68)
melody:  ░░░░░░░░░░░░░░░░░░░░░░████████  (threshold 0.82)
```

The **ordering** shuffles which instruments get low vs high thresholds. "Bass Heavy" puts bass and kick first; "Melodic" puts melody first.

### `timing.ts` — Tempo

Builds a BPM curve (each section gets ±4 BPM from base) and converts to absolute timestamps in seconds for each bar.

---

## Layer 3: The Orchestrator

### `song.ts` — Assembles Everything

The `generateSong(seed)` function:

1. Creates an RNG from the seed
2. Picks a random key, structure, and instrument ordering
3. Generates a 4-chord progression via Markov chain
4. Voices the chords with smooth voice leading
5. Builds the energy curve and BPM timing
6. Iterates over every bar, generating events for all 7 instruments

For each bar, it computes instrument volumes from the energy curve and only generates events for instruments above `MIN_VEL` (0.03). Instrument-specific logic applies (bass plays different rhythms at different energies, drums use different patterns at different energy levels, etc.).

The output is a `Song` object — a pure data structure with all metadata and event arrays. No audio, no DOM, no side effects.

**Insight:** The `Song` type (in `song.ts`) is the contract between generation and playback. Every field is `readonly` — once generated, a song is immutable. This makes it safe to pass around, render in the UI, and schedule in the audio engine without worrying about accidental mutation.

Also owns the 5 song structure presets (Standard, Slow Burn, Energetic, Minimal, Epic) and their section definitions.

---

## Layer 4: Output (Audio + UI)

### `playback.ts` — Tone.js Audio Engine

Creates 7 Tone.js synthesizers with their effect chains:

```
pad → Chorus → LowPass → Reverb → masterGain → speakers
bass → LowPass → masterGain
kick → masterGain
snare → HighPass → masterGain
hat → HighPass → masterGain
arp → LowPass → Reverb → masterGain
melody → LowPass → Reverb → masterGain
```

Uses `Tone.Part` to schedule every event from the `Song` object, plus bar-change callbacks and a master fade-out on the last bar.

Returns `PlaybackControls` (`pause()`, `resume()`, `stop()`).

**Insight:** The original stored every audio node as a module-level variable (`let pad = null, bass = null, kick = null...`) and had a `disposeAudio()` function that cleaned them all up. The refactored version creates everything inside `startPlayback()` and captures it in a closure. The `stop()` function disposes everything through closure scope, eliminating 18 module-level variables. This is the **closure as encapsulation** pattern — the audio nodes are private to the playback session, not global.

### `ui.ts` — DOM Rendering

Separated into:
- **Pure functions**: `buildLogEntries(song)` computes what to display without touching the DOM
- **Impure functions**: `renderLog()`, `renderSongHeader()`, `highlightBar()` do actual DOM manipulation

---

## Layer 5: Application Shell

### `main.ts` — The State Machine

The "conductor" that wires everything together. Key design — a discriminated union for app state:

```ts
type AppState =
    | { tag: 'stopped' }
    | { tag: 'playing'; song: Song; controls: PlaybackControls; barEls: BarElements }
    | { tag: 'paused';  song: Song; controls: PlaybackControls; barEls: BarElements }
```

**Insight:** The original used two independent booleans (`isPlaying`, `isPaused`) — 4 possible states including the invalid `isPlaying=false, isPaused=true`. The union has exactly 3 valid states, and you physically cannot have `controls` or `barEls` when stopped. The compiler enforces valid state transitions. This is the ISI (Make Impossible States Impossible) principle in action.

The `render(state)` function derives the entire UI from the current state.

---

## Original Line-to-Module Mapping

```
+-----+========================+======================+
| #   | Original (html)        | Refactored (src/)    |
+-----+========================+======================+
| 1   | Lines 6-33 (CSS)       | global.css           |
+-----+------------------------+----------------------+
| 2   | Lines 54-66 (DOM/log)  | main.ts + ui.ts      |
+-----+------------------------+----------------------+
| 3   | Lines 70-74 (RNG)      | rng.ts + brand.ts    |
+-----+------------------------+----------------------+
| 4   | Lines 77-82 (consts)   | song.ts (top)        |
+-----+------------------------+----------------------+
| 5   | Lines 85-111           | song.ts (STRUCTURES) |
|     | (structures)           |                      |
+-----+------------------------+----------------------+
| 6   | Lines 114-138          | markov.ts            |
|     | (Markov)               |                      |
+-----+------------------------+----------------------+
| 7   | Lines 141-149          | voice-leading.ts     |
|     | (voice leading)        |                      |
+-----+------------------------+----------------------+
| 8   | Lines 152-176          | drums.ts             |
|     | (drum patterns)        |                      |
+-----+------------------------+----------------------+
| 9   | Lines 179-199 (arp)    | arp.ts               |
+-----+------------------------+----------------------+
| 10  | Lines 201-223          | melody.ts            |
|     | (melody)               |                      |
+-----+------------------------+----------------------+
| 11  | Lines 225-264          | dynamics.ts          |
|     | (energy curve)         |                      |
+-----+------------------------+----------------------+
| 12  | Lines 266-299          | timing.ts            |
|     | (BPM/timing)           |                      |
+-----+------------------------+----------------------+
| 13  | Lines 301-335          | dynamics.ts          |
|     | (sigmoid volumes)      |                      |
+-----+------------------------+----------------------+
| 14  | Lines 339-558          | song.ts              |
|     | (generateSong)         |                      |
+-----+------------------------+----------------------+
| 15  | Lines 560-799          | playback.ts          |
|     | (Tone.js audio)        |                      |
+-----+------------------------+----------------------+
| 16  | Lines 801-856          | main.ts              |
|     | (play/pause/handlers)  |                      |
+-----+------------------------+----------------------+
```

---

## What Changed vs What Didn't

**What changed:**
1. Global mutable state → encapsulated closures and explicit parameter passing
2. Raw `number`/`string` → branded types (`Seed`, `NoteName`, `MidiNumber`, `Bpm`, etc.)
3. Boolean flags → discriminated union state machine
4. Inline `<script>` with CDN deps → Vite + ES modules with `import`/`export`
5. Homegrown RNG → `seedrandom` library

**What didn't change:**
- The musical algorithms are identical
- Same Markov chain, same drum patterns, same sigmoid activation
- Same Tone.js instrument configurations and effect chains
- Same visual rendering logic

The refactoring was a **structural** change, not a behavioral one. Same song, cleaner architecture.
