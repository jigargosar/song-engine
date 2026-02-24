import type { Rng } from './rng'
import { NoteName } from './note'
import type { NoteEvent } from './note'

// --- Motif (opaque to callers — degrees are internal) ---

export interface Motif {
    readonly _tag: 'Motif'
    readonly length: number
}

interface MotifImpl extends Motif {
    readonly degrees: readonly number[]
}

function isMotifImpl(m: Motif): m is MotifImpl {
    return 'degrees' in m
}

function toImpl(m: Motif): MotifImpl {
    if (!isMotifImpl(m)) throw new Error('Invalid motif')
    return m
}

function motif(degrees: readonly number[]): Motif {
    const impl: MotifImpl = { _tag: 'Motif', length: degrees.length, degrees }
    return impl
}

// --- MelodyRhythm ---

export interface MelodyRhythm {
    readonly pattern: readonly boolean[]
}

// --- Exports ---

export function createMotif(
    rng: Rng,
    scaleLength: number,
    motifLength: number,
): Motif {
    const degrees: number[] = []
    let degree = rng.int(0, scaleLength - 1)
    for (let i = 0; i < motifLength; i++) {
        degrees.push(degree)
        if (rng.next() < 0.7) degree += rng.next() < 0.5 ? 1 : -1
        else degree += rng.int(-2, 2)
        degree = Math.max(0, Math.min(scaleLength * 2 - 1, degree))
    }
    return motif(degrees)
}

export function createRhythm(rng: Rng, motifLength: number): MelodyRhythm {
    const pattern: boolean[] = []
    for (let i = 0; i < motifLength; i++) {
        pattern.push(i === 0 || rng.next() < 0.5)
    }
    return { pattern }
}

export function varyMotif(rng: Rng, base: Motif, amount: number): Motif {
    const impl = toImpl(base)
    const degrees = impl.degrees.map((d) =>
        rng.next() < amount ? d + rng.int(-1, 1) : d,
    )
    return motif(degrees)
}

function degreeToNote(
    scaleNotes: readonly string[],
    degree: number,
    octaveBase: number,
): NoteName {
    const len = scaleNotes.length
    const oct = Math.floor(degree / len)
    const idx = ((degree % len) + len) % len
    const note = scaleNotes[idx] ?? 'C'
    return NoteName(note + (octaveBase + oct))
}

export function motifToEvents(
    rng: Rng,
    motif_: Motif,
    rhythm: MelodyRhythm,
    scaleNotes: readonly string[],
    octave: number,
    energy: number,
    vel: number,
    barTime: number,
    stepDuration: number,
    stepOffset: number,
): { events: NoteEvent[]; nextOffset: number } {
    const impl = toImpl(motif_)
    const events: NoteEvent[] = []
    let counter = stepOffset

    for (let step = 0; step < 8; step++) {
        const motifIdx = counter % impl.length
        counter++
        if (!rhythm.pattern[motifIdx]) continue
        if (rng.next() > 0.4 + energy * 0.4) continue

        const degree = impl.degrees[motifIdx]
        if (degree === undefined) continue
        const note = degreeToNote(scaleNotes, degree, octave)
        events.push({
            time: barTime + step * stepDuration,
            note,
            duration: stepDuration * 1.2,
            vel,
        })
    }

    return { events, nextOffset: counter }
}
