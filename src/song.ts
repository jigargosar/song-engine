import { type Seed, createRng } from './rng'
import { NoteName, ChordSymbol, noteToMidi, midiToNote, MidiNumber } from './note'
import type { NoteEvent, PadEvent } from './note'
import { generatePhrase } from './markov'
import type { RomanNumeral } from './markov'
import { closestVoicing } from './voice-leading'
import { generateArpEvents, ARP_STYLES } from './arp'
import { createMotif, createRhythm, varyMotif, motifToEvents } from './melody'
import { buildBpmCurve, buildBarTiming, Bpm } from './timing'
import type { Seconds } from './timing'
import { buildEnergyCurve, computeVolumes, ORDERINGS, ORDERING_NAMES } from './dynamics'
import type { InstrumentName } from './dynamics'
import { energyLevel, selectKickPattern, selectSnarePattern, selectHatPattern } from './drums'
import type { DrumEvent } from './drums'
import { Progression, Scale, Voicing, VoicingDictionary, VoiceLeading } from 'tonal'

// --- Song presets (owned by the orchestrator) ---

interface SectionDef {
    readonly name: string
    readonly bars: number
    readonly energy: number
}

const STRUCTURES: readonly (readonly SectionDef[])[] = [
    [
        { name: 'intro', bars: 4, energy: 0.15 },
        { name: 'build', bars: 4, energy: 0.45 },
        { name: 'main', bars: 8, energy: 0.75 },
        { name: 'break', bars: 4, energy: 0.3 },
        { name: 'peak', bars: 8, energy: 1.0 },
        { name: 'outro', bars: 4, energy: 0.1 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.1 },
        { name: 'intro2', bars: 4, energy: 0.2 },
        { name: 'build', bars: 4, energy: 0.5 },
        { name: 'main', bars: 8, energy: 0.75 },
        { name: 'peak', bars: 8, energy: 1.0 },
        { name: 'outro', bars: 4, energy: 0.15 },
    ],
    [
        { name: 'build', bars: 4, energy: 0.5 },
        { name: 'main', bars: 8, energy: 0.8 },
        { name: 'peak', bars: 8, energy: 1.0 },
        { name: 'break', bars: 4, energy: 0.35 },
        { name: 'peak2', bars: 8, energy: 0.95 },
        { name: 'outro', bars: 4, energy: 0.2 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.15 },
        { name: 'build', bars: 4, energy: 0.4 },
        { name: 'main', bars: 8, energy: 0.65 },
        { name: 'build2', bars: 4, energy: 0.5 },
        { name: 'main2', bars: 8, energy: 0.7 },
        { name: 'outro', bars: 4, energy: 0.1 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.1 },
        { name: 'build', bars: 4, energy: 0.4 },
        { name: 'build2', bars: 4, energy: 0.6 },
        { name: 'main', bars: 8, energy: 0.85 },
        { name: 'peak', bars: 8, energy: 1.0 },
        { name: 'peak2', bars: 8, energy: 0.95 },
    ],
]

const STRUCTURE_NAMES = [
    'Standard',
    'Slow Burn',
    'Energetic',
    'Minimal',
    'Epic',
] as const

const KEY_POOL = ['C', 'D', 'E', 'F', 'G', 'A'] as const
const VOICE_RANGE: [string, string] = ['C3', 'C5']
const MIN_VEL = 0.03

// --- Types ---

export interface BarData {
    readonly bar: number
    readonly section: string
    readonly energy: number
    readonly bpm: Bpm
    readonly chordSymbol: ChordSymbol
    readonly numeral: RomanNumeral
    readonly voiced: readonly NoteName[]
}

export interface Song {
    readonly seed: Seed
    readonly tonic: string
    readonly structName: string
    readonly orderName: string
    readonly ordering: readonly InstrumentName[]
    readonly phrase: readonly RomanNumeral[]
    readonly chordSymbols: readonly ChordSymbol[]
    readonly phraseVoicings: readonly (readonly NoteName[])[]
    readonly bars: readonly BarData[]
    readonly totalBars: number
    readonly energyCurve: readonly number[]
    readonly bpmCurve: readonly Bpm[]
    readonly barStartTimes: readonly Seconds[]
    readonly barDurations: readonly Seconds[]
    readonly totalTime: Seconds
    readonly padEvents: readonly PadEvent[]
    readonly bassEvents: readonly NoteEvent[]
    readonly kickEvents: readonly DrumEvent[]
    readonly snareEvents: readonly DrumEvent[]
    readonly hatEvents: readonly DrumEvent[]
    readonly arpEvents: readonly NoteEvent[]
    readonly melodyEvents: readonly NoteEvent[]
}

// --- Helpers ---

function dedup<T extends { time: number }>(events: T[]): T[] {
    const sorted = [...events].sort((a, b) => a.time - b.time)
    return sorted.filter((e, i) => i === 0 || e.time > sorted[i - 1].time)
}

function voiceChords(
    chordSymbols: readonly string[],
    lastRef: NoteName[],
): NoteName[][] {
    const dictionary = VoicingDictionary.triads
    let lastVoicing = lastRef
    const voicings: NoteName[][] = []

    for (const symbol of chordSymbols) {
        const candidates = Voicing.search(symbol, VOICE_RANGE, dictionary)

        if (candidates.length === 0) {
            const v = Voicing.get(
                symbol,
                VOICE_RANGE,
                dictionary,
                VoiceLeading.topNoteDiff,
                lastVoicing.length > 0
                    ? lastVoicing.map((n) => n as string)
                    : undefined,
            )
            const voiced = v.map(NoteName)
            voicings.push(voiced)
            lastVoicing = voiced
        } else {
            const typedCandidates = candidates.map((c) => c.map(NoteName))
            const chosen = closestVoicing(typedCandidates, lastVoicing)
            voicings.push(chosen)
            lastVoicing = chosen
        }
    }

    return voicings
}

// --- Main generation ---

export function generateSong(seed: Seed): Song {
    const rng = createRng(seed)

    const tonic = rng.pick(KEY_POOL)

    const structIdx = Math.floor(rng.next() * STRUCTURES.length)
    const structure = STRUCTURES[structIdx]
    const structName = STRUCTURE_NAMES[structIdx]

    const orderIdx = Math.floor(rng.next() * ORDERINGS.length)
    const ordering = ORDERINGS[orderIdx]
    const orderName = ORDERING_NAMES[orderIdx]

    const phrase = generatePhrase(rng)
    const rawChords = Progression.fromRomanNumerals(
        tonic,
        phrase.map((r) => r as string),
    )
    const chordSymbols = rawChords.map(ChordSymbol)
    const phraseVoicings = voiceChords(rawChords, [])

    const scaleNotes = Scale.get(`${tonic} minor`).notes
    const arpStyle = rng.pick(ARP_STYLES)
    const motifLen = rng.pick([4, 5, 6, 8] as const)
    const baseMotif = createMotif(rng, scaleNotes.length, motifLen)
    const melodyRhythm = createRhythm(rng, motifLen)
    const drumVariants = {
        low: rng.int(0, 2),
        mid: rng.int(0, 2),
        high: rng.int(0, 2),
        peak: rng.int(0, 2),
    } as const

    const { curve: energyCurve, sectionNames } = buildEnergyCurve(rng, structure)
    const totalBars = energyCurve.length
    const sectionBars = structure.map((s) => s.bars)
    const bpmCurve = buildBpmCurve(rng, sectionBars, Bpm(128), 12)
    const { barStartTimes, barDurations, totalTime } = buildBarTiming(bpmCurve)

    const bars: BarData[] = []
    for (let i = 0; i < totalBars; i++) {
        const phraseIdx = i % 4
        bars.push({
            bar: i,
            section: sectionNames[i],
            energy: energyCurve[i],
            bpm: bpmCurve[i],
            chordSymbol: chordSymbols[phraseIdx],
            numeral: phrase[phraseIdx],
            voiced: phraseVoicings[phraseIdx],
        })
    }

    // --- Generate all events ---

    const padEvents: PadEvent[] = []
    const bassEvents: NoteEvent[] = []
    const kickEvents: DrumEvent[] = []
    const snareEvents: DrumEvent[] = []
    const hatEvents: DrumEvent[] = []
    const arpEvents: NoteEvent[] = []
    const melodyEvents: NoteEvent[] = []

    let currentMotif = baseMotif
    let melodyStepCounter = 0

    for (const bar of bars) {
        const barTime = barStartTimes[bar.bar] as number
        const barSec = barDurations[bar.bar] as number
        const beatSec = barSec / 4
        const stepSec = beatSec / 2
        const energy = bar.energy
        const level = energyLevel(energy)
        const vols = computeVolumes(energy, ordering)

        const nextEnergy =
            bar.bar < totalBars - 1 ? energyCurve[bar.bar + 1] : energy
        const isTransition = Math.abs(nextEnergy - energy) > 0.06
        const isPhraseLast = (bar.bar + 1) % 4 === 0

        // Pad
        if (vols.pad > MIN_VEL) {
            padEvents.push({
                time: barTime,
                notes: bar.voiced,
                duration: barSec * 1.1,
                vel: vols.pad,
            })
        }

        // Bass
        if (vols.bass > MIN_VEL) {
            const rootMidi = noteToMidi(bar.voiced[0]) as number
            const bassNote = midiToNote(MidiNumber(rootMidi - 12))

            if (energy < 0.4) {
                bassEvents.push({
                    time: barTime,
                    note: bassNote,
                    duration: barSec * 0.9,
                    vel: vols.bass,
                })
            } else if (energy < 0.7) {
                bassEvents.push({
                    time: barTime,
                    note: bassNote,
                    duration: beatSec * 1.8,
                    vel: vols.bass,
                })
                bassEvents.push({
                    time: barTime + beatSec * 2,
                    note: bassNote,
                    duration: beatSec * 1.8,
                    vel: vols.bass,
                })
            } else {
                const chordMidis = bar.voiced.map(
                    (n) => (noteToMidi(n) as number) - 12,
                )
                for (let step = 0; step < 8; step++) {
                    if (rng.next() < 0.7) {
                        const midi = rng.pick(chordMidis)
                        bassEvents.push({
                            time: barTime + step * stepSec,
                            note: midiToNote(MidiNumber(midi)),
                            duration: stepSec * 0.8,
                            vel: vols.bass,
                        })
                    }
                }
            }
        }

        // Drums
        const kickPat = selectKickPattern(level, drumVariants[level])
        const snarePat = selectSnarePattern(level, drumVariants[level])
        const hatPat = selectHatPattern(level, drumVariants[level])

        for (let step = 0; step < 8; step++) {
            const t = barTime + step * stepSec
            if (kickPat[step] && vols.kick > MIN_VEL)
                kickEvents.push({ time: t, vel: vols.kick })
            if (snarePat[step] && vols.snare > MIN_VEL)
                snareEvents.push({ time: t, vel: vols.snare })
            if (hatPat[step] && vols.hat > MIN_VEL)
                hatEvents.push({ time: t, vel: vols.hat })
        }

        // Drum fill at transition
        if (isTransition && isPhraseLast && vols.snare > 0.1) {
            for (let step = 5; step < 8; step++) {
                snareEvents.push({
                    time: barTime + step * stepSec,
                    vel: vols.snare * (0.5 + (step - 5) * 0.2),
                })
            }
        }

        // Arp
        if (vols.arp > MIN_VEL) {
            const arpNotes = bar.voiced.map((n) =>
                midiToNote(MidiNumber((noteToMidi(n) as number) + 12)),
            )
            arpEvents.push(
                ...generateArpEvents(
                    rng,
                    arpNotes,
                    arpStyle,
                    energy,
                    vols.arp,
                    barTime,
                    stepSec,
                ),
            )
        }

        // Melody
        if (vols.melody > MIN_VEL) {
            if (melodyStepCounter > 0 && melodyStepCounter % 16 === 0) {
                currentMotif =
                    rng.next() < 0.3
                        ? baseMotif
                        : varyMotif(rng, baseMotif, 0.3)
            }
            const { events, nextOffset } = motifToEvents(
                rng,
                currentMotif,
                melodyRhythm,
                scaleNotes,
                5,
                energy,
                vols.melody,
                barTime,
                stepSec,
                melodyStepCounter,
            )
            melodyEvents.push(...events)
            melodyStepCounter = nextOffset
        } else {
            melodyStepCounter += 8
        }
    }

    return {
        seed,
        tonic,
        structName,
        orderName,
        ordering,
        phrase,
        chordSymbols,
        phraseVoicings,
        bars,
        totalBars,
        energyCurve,
        bpmCurve,
        barStartTimes,
        barDurations,
        totalTime,
        padEvents: dedup(padEvents),
        bassEvents: dedup(bassEvents),
        kickEvents: dedup(kickEvents),
        snareEvents: dedup(snareEvents),
        hatEvents: dedup(hatEvents),
        arpEvents: dedup(arpEvents),
        melodyEvents: dedup(melodyEvents),
    }
}
