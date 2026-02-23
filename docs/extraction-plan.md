Extraction Plan — music_gen_v2.html → TypeScript Modules

## What This Is

A procedural music generator: seed in → deterministic song out → Tone.js plays it.
860 lines of JS in one HTML file. Three layers: generation (pure), playback (impure),
UI (impure).

## Target Architecture

```
                    ┌─────────────┐
                    │   main.ts   │  wires UI + playback + song
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌────────┐
         │ ui.ts  │  │playback.ts│  │song.ts │  orchestrator
         └────────┘  └──────────┘  └───┬────┘
                                       │
         ┌─────────┬──────────┬────────┼────────┬──────────┬──────────┐
         ▼         ▼          ▼        ▼        ▼          ▼          ▼
     markov.ts  voice-    arp.ts  melody.ts  timing.ts  dynamics.ts  drums.ts
               leading.ts
         │         │          │        │        │          │          │
         ▼         ▼          ▼        ▼        ▼          ▼          ▼
       rng.ts   note.ts    rng.ts   rng.ts   rng.ts     rng.ts    (none)
                           note.ts  note.ts
```

Layer 0 (no project deps): rng, note, drums
Layer 1 (depends on L0):   markov, voice-leading, arp, melody, timing, dynamics
Layer 2 (orchestrator):    song — imports everything, owns presets, exports generateSong
Layer 3 (impure):          playback (Tone.js), ui (DOM), main (wiring)

## Principles

1. Co-locate data + operations — no types.ts, no constants.ts
2. Parameters over constants — configurable values are function args, not module globals
3. Inside-out build — leaf modules first, orchestrator last
4. No side effects on import — all state via factory calls
5. Explicit dependencies — rng: Rng in signature
6. No null/undefined — throw on bugs, empty arrays for "nothing"
7. Branded primitives — prevent interchange (Seed vs Bpm vs MidiNumber)
8. Closure-based opacity — factory returns objects, state in closure
9. TDA + PLOP — expose operations, not internals
10. Libraries over hand-rolled — seedrandom, remeda, tonal, tone

## Pure / Impure Wall

```
generateSong(seed: Seed): Song
```

Everything feeding into this is pure. The Song type is plain data — arrays of
events with times, notes, velocities. No audio objects, no DOM refs.
Playback and UI consume Song as an interpreter consumes a program.

## Module Responsibilities

### rng.ts
Owns: Seed (branded), Rng (closure-based), createRng factory
Wraps seedrandom internally. Callers get next(), int(), pick().

### note.ts
Owns: NoteName, MidiNumber, ChordSymbol (branded), NoteEvent, PadEvent types
Operations: noteToMidi (throws, never null), midiToNote
Wraps Tonal.Note at the boundary.

### drums.ts
Owns: DrumEvent, DrumPattern, EnergyLevel types
All kick/snare/hat pattern arrays are internal definitions.
Operations: energyLevel classifier, pattern selectors.

### markov.ts
Owns: RomanNumeral (branded)
Transition matrix + weights are internal definitions.
Single export: generatePhrase(rng) → RomanNumeral[]

### voice-leading.ts
No owned types. Pure utility.
Single export: closestVoicing(candidates, reference) → NoteName[]

### arp.ts
Owns: ArpStyle union
Export: generateArpEvents(rng, notes, style, energy, vel, barTime, stepDur) → NoteEvent[]

### melody.ts
Owns: Motif (opaque), MelodyRhythm
Exports: createMotif, createRhythm, varyMotif, motifToEvents

### timing.ts
Owns: Bpm (branded), Seconds (branded), BarTiming type
Exports: buildBpmCurve(rng, sectionBars, center, range) → Bpm[]
         buildBarTiming(bpmCurve) → BarTiming

### dynamics.ts
Owns: InstrumentName union, InstrumentVolumes type
Sigmoid thresholds/smoothness are internal definitions.
Exports: buildEnergyCurve(rng, sections) → { curve, sectionNames }
         computeVolumes(energy, ordering) → InstrumentVolumes
         dominantInstruments(vols) → InstrumentName[]

### song.ts — Orchestrator
Owns: Song, BarData types + all preset data (structures, orderings, key pool, voice range)
Presets are the orchestrator's configuration — not exported, used internally.
Single export: generateSong(seed) → Song

### playback.ts — Impure boundary
Owns: PlaybackControls type
Creates Tone.js instruments on call, schedules events, manages transport.
stop() disposes everything.
Export: startPlayback(song, onBar) → PlaybackControls

### ui.ts
Pure: buildLogEntries(song) → LogEntry[]
Impure: renderLog, updateStatus, updateButtons

### main.ts
Wires DOM → song → playback → ui. Entry point.

## Feature Tiers

### Tier 1 — Skeleton (must work to hear anything)
- rng, note, markov, voice-leading, timing, dynamics
- song.ts with pad + bass events only
- playback.ts with pad + bass instruments
- minimal UI (play/stop, status)

### Tier 2 — Rhythm
- drums.ts + kick/snare/hat events in song.ts
- drum instruments in playback.ts

### Tier 3 — Texture
- arp.ts + melody.ts
- arp/melody events in song.ts
- arp/melody instruments in playback.ts

### Tier 4 — Polish
- Drum fills at transitions
- Master fade on last bar
- Bar highlighting in UI
- Pause/resume
- New seed button
- Energy curve noise (Perlin-like)

## Approaches

### A: Monolith-first (recommended for safety)
Paste entire script into main.ts with @ts-nocheck. Get it running in Vite.
Extract modules one at a time — each extraction is provably safe refactor.

### B: Inside-out clean build (recommended for learning)
Build each module from scratch using the original as reference.
Slower to first sound, but every line is typed from birth.

### C: Hybrid
Build Tier 1 modules inside-out. Copy remaining logic from monolith for Tiers 2-4,
then clean up.

Current choice: **B** — inside-out clean build, all tiers.

## Event Pipeline (why not RxJS)

The generation is a data transformation pipeline, not reactive:

```
seed → rng → pick config → generate chords → voice chords
     → for each bar: energy → volumes → pad/bass/drum/arp/melody events
     → sort + dedup → Song (plain data)
```

Events are computed once, consumed once. No subscriptions, no hot streams.
remeda.pipe fits for composing transforms. Tone.js handles scheduling natively.

RxJS would add value only if events were generated during playback (live/infinite mode).
That's a future feature, not current scope.
