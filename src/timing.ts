import type { Rng } from './rng'
import type { Brand } from './brand'

export type Bpm = Brand<number, 'Bpm'>
export function Bpm(n: number): Bpm {
    return n as Bpm
}

export type Seconds = Brand<number, 'Seconds'>
export function Seconds(n: number): Seconds {
    return n as Seconds
}

export interface BarTiming {
    readonly barStartTimes: readonly Seconds[]
    readonly barDurations: readonly Seconds[]
    readonly totalTime: Seconds
}

export function buildBpmCurve(
    rng: Rng,
    sectionBars: readonly number[],
    center: Bpm,
    range: number,
): Bpm[] {
    const baseBpm = Math.round((center as number) + (rng.next() - 0.5) * range)
    const curve: Bpm[] = []

    for (const bars of sectionBars) {
        const nudge = Math.round((rng.next() - 0.5) * 8)
        const sectionBpm = Bpm(
            Math.max(112, Math.min(144, baseBpm + nudge)),
        )
        for (let b = 0; b < bars; b++) {
            curve.push(sectionBpm)
        }
    }

    return curve
}

export function buildBarTiming(bpmCurve: readonly Bpm[]): BarTiming {
    const barStartTimes: Seconds[] = []
    const barDurations: Seconds[] = []
    let t = 0

    for (const bpm of bpmCurve) {
        const beatSec = 60 / (bpm as number)
        const barSec = beatSec * 4
        barStartTimes.push(Seconds(t))
        barDurations.push(Seconds(barSec))
        t += barSec
    }

    return { barStartTimes, barDurations, totalTime: Seconds(t) }
}
