import type { NoteName } from './note'
import { noteToMidi } from './note'

export function closestVoicing(
    candidates: readonly (readonly NoteName[])[],
    reference: readonly NoteName[],
): NoteName[] {
    if (candidates.length === 0) return []

    const first = candidates[0]
    if (first === undefined) return []
    if (reference.length === 0) return [...first]

    const movement = (voicing: readonly NoteName[]): number =>
        voicing.reduce((sum, note, i) => {
            const ref = reference[Math.min(i, reference.length - 1)]
            if (ref === undefined) return sum
            return sum + Math.abs(noteToMidi(note) - noteToMidi(ref))
        }, 0)

    const sorted = candidates.slice().sort((a, b) => movement(a) - movement(b))
    const best = sorted[0]
    return best !== undefined ? [...best] : []
}
