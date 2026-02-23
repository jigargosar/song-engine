import { Note } from 'tonal'
import type { Brand } from './brand'

export type NoteName = Brand<string, 'NoteName'>
export function NoteName(s: string): NoteName {
    return s as NoteName
}

export type MidiNumber = Brand<number, 'MidiNumber'>
export function MidiNumber(n: number): MidiNumber {
    return n as MidiNumber
}

export type ChordSymbol = Brand<string, 'ChordSymbol'>
export function ChordSymbol(s: string): ChordSymbol {
    return s as ChordSymbol
}

export function noteToMidi(note: NoteName): MidiNumber {
    const midi = Note.midi(note as string)
    if (midi === null) throw new Error(`Invalid note: ${note}`)
    return MidiNumber(midi)
}

export function midiToNote(midi: MidiNumber): NoteName {
    return NoteName(Note.fromMidi(midi as number))
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
