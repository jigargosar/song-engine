import type { Rng } from './rng'
import type { NoteName, NoteEvent } from './note'
import { NonEmpty } from './NonEmpty'

export type ArpStyle = 'up' | 'down' | 'updown' | 'random'
export const ARP_STYLES: NonEmpty<ArpStyle> = NonEmpty.init(['up', 'down', 'updown', 'random'])

export function generateArpEvents(
    rng: Rng,
    chordNotes: NonEmpty<NoteName>,
    style: ArpStyle,
    energy: number,
    vel: number,
    barTime: number,
    stepDuration: number,
): NoteEvent[] {
    const events: NoteEvent[] = []
    const notes = NonEmpty.toArray(chordNotes)
    const len = notes.length

    for (let step = 0; step < 8; step++) {
        if (rng.next() > 0.2 + energy * 0.5) continue

        let idx: number
        switch (style) {
            case 'up':
                idx = step % len
                break
            case 'down':
                idx = (len - 1) - (step % len)
                break
            case 'updown': {
                const cycle = Math.max(1, len * 2 - 2)
                const pos = step % cycle
                idx = pos < len ? pos : cycle - pos
                break
            }
            case 'random':
                idx = Math.floor(rng.next() * len)
                break
        }

        events.push({
            time: barTime + step * stepDuration,
            note: notes[Math.min(idx, len - 1)] ?? NonEmpty.head(chordNotes),
            duration: stepDuration * 0.5,
            vel,
        })
    }

    return events
}
