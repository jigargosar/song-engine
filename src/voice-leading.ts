import type { NoteName } from './note'
import { noteToMidi } from './note'

export function closestVoicing(
    candidates: readonly (readonly NoteName[])[],
    reference: readonly NoteName[],
): NoteName[] {
    if (candidates.length === 0) return []
    if (reference.length === 0) return [...candidates[0]]

    const movement = (voicing: readonly NoteName[]): number =>
        voicing.reduce((sum, note, i) => {
            const prev =
                i < reference.length
                    ? reference[i]
                    : reference[reference.length - 1]
            return (
                sum +
                Math.abs(
                    (noteToMidi(note) as number) - (noteToMidi(prev) as number),
                )
            )
        }, 0)

    return [...candidates.slice().sort((a, b) => movement(a) - movement(b))[0]]
}
