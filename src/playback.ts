import * as Tone from 'tone'
import type { Song } from './song'
import type { NoteEvent, PadEvent } from './note'
import type { DrumEvent } from './drums'

export interface PlaybackCallbacks {
    onBarChange(barIndex: number): void
    onComplete(): void
}

export interface PlaybackControls {
    pause(): void
    resume(): void
    stop(): void
}

export async function startPlayback(
    song: Song,
    callbacks: PlaybackCallbacks,
): Promise<PlaybackControls> {
    await Tone.start()

    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()

    const masterGain = new Tone.Gain(1).toDestination()

    // Pad
    const padChorus = new Tone.Chorus({
        frequency: 0.4, delayTime: 3.5, depth: 0.5, wet: 0.3,
    }).start()
    const padFilter = new Tone.Filter({ frequency: 1200, type: 'lowpass', rolloff: -12 })
    const padReverb = new Tone.Reverb({ decay: 3, wet: 0.25 })
    const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 15 },
        envelope: { attack: 0.3, decay: 0.2, sustain: 0.4, release: 0.8 },
        volume: -10,
    })
    pad.chain(padChorus, padFilter, padReverb, masterGain)

    // Bass
    const bassFilter = new Tone.Filter({ frequency: 800, type: 'lowpass', rolloff: -12 })
    const bass = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.3 },
        filterEnvelope: {
            attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.2,
            baseFrequency: 150, octaves: 2.5,
        },
        volume: -4,
    })
    bass.chain(bassFilter, masterGain)

    // Kick
    const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 6,
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
        volume: -2,
    })
    kick.connect(masterGain)

    // Snare
    const snareFilter = new Tone.Filter({ frequency: 1200, type: 'highpass' })
    const snare = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
        volume: -6,
    })
    snare.chain(snareFilter, masterGain)

    // Hat
    const hatFilter = new Tone.Filter({ frequency: 8000, type: 'highpass' })
    const hat = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
        volume: -10,
    })
    hat.chain(hatFilter, masterGain)

    // Arp
    const arpFilter = new Tone.Filter({ frequency: 3000, type: 'lowpass' })
    const arpReverb = new Tone.Reverb({ decay: 1, wet: 0.2 })
    const arp = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.003, decay: 0.1, sustain: 0.05, release: 0.15 },
        volume: -8,
    })
    arp.chain(arpFilter, arpReverb, masterGain)

    // Melody
    const melodyFilter = new Tone.Filter({ frequency: 2200, type: 'lowpass' })
    const melodyReverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 })
    const melodySynth = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.25, release: 0.3 },
        volume: -6,
    })
    melodySynth.chain(melodyFilter, melodyReverb, masterGain)

    const allNodes = [
        pad, padChorus, padFilter, padReverb,
        bass, bassFilter,
        kick,
        snare, snareFilter,
        hat, hatFilter,
        arp, arpFilter, arpReverb,
        melodySynth, melodyFilter, melodyReverb,
        masterGain,
    ]

    // Schedule events
    const parts: Tone.Part[] = []

    if (song.padEvents.length > 0) {
        const p = new Tone.Part((time, value: PadEvent) => {
            pad.triggerAttackRelease(
                [...value.notes],
                value.duration, time, value.vel,
            )
        }, [...song.padEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.bassEvents.length > 0) {
        const p = new Tone.Part((time, value: NoteEvent) => {
            bass.triggerAttackRelease(value.note, value.duration, time, value.vel)
        }, [...song.bassEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.kickEvents.length > 0) {
        const p = new Tone.Part((time, value: DrumEvent) => {
            kick.triggerAttackRelease('C1', '8n', time, value.vel)
        }, [...song.kickEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.snareEvents.length > 0) {
        const p = new Tone.Part((time, value: DrumEvent) => {
            snare.triggerAttackRelease('16n', time, value.vel)
        }, [...song.snareEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.hatEvents.length > 0) {
        const p = new Tone.Part((time, value: DrumEvent) => {
            hat.triggerAttackRelease('32n', time, value.vel)
        }, [...song.hatEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.arpEvents.length > 0) {
        const p = new Tone.Part((time, value: NoteEvent) => {
            arp.triggerAttackRelease(value.note, value.duration, time, value.vel)
        }, [...song.arpEvents])
        p.start(0)
        parts.push(p)
    }

    if (song.melodyEvents.length > 0) {
        const p = new Tone.Part((time, value: NoteEvent) => {
            melodySynth.triggerAttackRelease(value.note, value.duration, time, value.vel)
        }, [...song.melodyEvents])
        p.start(0)
        parts.push(p)
    }

    // Bar highlighting
    for (let i = 0; i < song.totalBars; i++) {
        const barIdx = i
        const startTime = song.barStartTimes[i]
        if (startTime !== undefined) {
            transport.schedule((time) => {
                Tone.getDraw().schedule(() => {
                    callbacks.onBarChange(barIdx)
                }, time)
            }, startTime)
        }
    }

    // Master fade on last bar
    const lastBarDur = song.barDurations[song.totalBars - 1]
    if (lastBarDur !== undefined) {
        const fadeStart = song.totalTime - lastBarDur
        transport.schedule((time) => {
            masterGain.gain.setValueAtTime(1, time)
            masterGain.gain.linearRampToValueAtTime(0, time + lastBarDur)
        }, fadeStart)
    }

    transport.schedule(() => {
        dispose()
        callbacks.onComplete()
    }, song.totalTime + 1.5)

    transport.bpm.value = 128
    transport.start()

    let isPaused = false

    function dispose() {
        transport.stop()
        transport.cancel()
        for (const p of parts) p.dispose()
        for (const n of allNodes) n.dispose()
    }

    return {
        pause() {
            if (isPaused) return
            transport.pause()
            isPaused = true
        },
        resume() {
            if (!isPaused) return
            transport.start()
            isPaused = false
        },
        stop() {
            dispose()
        },
    }
}
