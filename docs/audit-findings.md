audit findings — src/main.ts surface (2026-02-24)

Files reviewed: src/main.ts, src/rng.ts, src/song.ts, src/playback.ts, src/ui.ts

+----+=========================================+====================================================+
| #  | Summary                                 | Fix Direction                                      |
+----+=========================================+====================================================+
| 1  | i % 4 hardcodes phrase length           | Replace with phrase.length                         |
+----+-----------------------------------------+----------------------------------------------------+
| 2  | Snare threshold 0.1 inconsistent with   | Replace 0.1 with MIN_VEL                           |
|    | named MIN_VEL = 0.03                    |                                                    |
+----+-----------------------------------------+----------------------------------------------------+
| 3  | bars[i].bpm duplicates bpmCurve         | Remove bpm from BarData; derive where needed       |
|    | (bpmCurve is the authoritative source)  | from song.bpmCurve                                 |
+----+-----------------------------------------+----------------------------------------------------+
| 4  | energyCurve likely dead on Song         | Verify no consumers, then remove from Song         |
|    | — bars[i].energy holds the same data    | interface                                          |
+----+-----------------------------------------+----------------------------------------------------+
| 5  | concurrent playSeed calls leak Tone.js  | Set appState = stopped before await; add           |
|    | nodes if clicked twice during init      | generation counter to discard stale results        |
+----+-----------------------------------------+----------------------------------------------------+
| 6  | dedup silently drops snare fill events  | Before pushing fill events, remove existing        |
|    | that share a timestamp with regular     | snare events at those steps instead of             |
|    | pattern hits                            | appending                                          |
+----+-----------------------------------------+----------------------------------------------------+
