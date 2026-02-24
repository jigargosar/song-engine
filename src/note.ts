import { Note } from 'tonal'
import type { Brand } from './brand'
import { brand } from './brand'

export type NoteName = Brand<string, 'NoteName'>
export function NoteName(s: string): NoteName {
    return brand<NoteName>(s)
}

export type MidiNumber = Brand<number, 'MidiNumber'>
export function MidiNumber(n: number): MidiNumber {
    return brand<MidiNumber>(n)
}

export type ChordSymbol = Brand<string, 'ChordSymbol'>
export function ChordSymbol(s: string): ChordSymbol {
    return brand<ChordSymbol>(s)
}

export function noteToMidi(note: NoteName): MidiNumber {
    const midi = Note.midi(note)
    if (midi === null) throw new Error(`Invalid note: ${note}`)
    return MidiNumber(midi)
}

export function midiToNote(midi: MidiNumber): NoteName {
    return NoteName(Note.fromMidi(midi))
}

export interface NoteEvent {
    readonly time: number
    readonly note: NoteName
    readonly duration: number
    readonly vel: number
}

export interface PadEvent {
    readonly time: number
    readonly notes: readonly NoteName[]
    readonly duration: number
    readonly vel: number
}
