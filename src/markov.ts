import type { Rng } from './rng'
import type { Brand } from './brand'
import { brand } from './brand'

export type RomanNumeral = Brand<string, 'RomanNumeral'>
export function RomanNumeral(s: string): RomanNumeral {
    return brand<RomanNumeral>(s)
}

type Transition = readonly [string, number]

const TRANSITIONS: Record<string, readonly Transition[]> = {
    Im:   [['bIII', 2], ['IVm', 3], ['Vm', 1], ['bVI', 3], ['bVII', 2]],
    bIII: [['Im', 1],   ['IVm', 3], ['bVI', 2], ['bVII', 3]],
    IVm:  [['Im', 2],   ['bIII', 1], ['Vm', 2], ['bVI', 1], ['bVII', 3]],
    Vm:   [['Im', 3],   ['IVm', 1], ['bVI', 3]],
    bVI:  [['Im', 1],   ['bIII', 2], ['IVm', 2], ['bVII', 3]],
    bVII: [['Im', 3],   ['bIII', 2], ['IVm', 1], ['bVI', 2]],
}

function markovNext(rng: Rng, current: string): string {
    const transitions = TRANSITIONS[current]
    if (transitions === undefined) return current
    const totalWeight = transitions.reduce((sum, [, w]) => sum + w, 0)
    let r = rng.next() * totalWeight
    for (const [target, weight] of transitions) {
        r -= weight
        if (r <= 0) return target
    }
    const last = transitions[transitions.length - 1]
    return last !== undefined ? last[0] : current
}

export function generatePhrase(rng: Rng): RomanNumeral[] {
    const walk: string[] = ['Im']
    for (let i = 1; i < 4; i++) {
        const prev = walk[i - 1]
        if (prev !== undefined) walk.push(markovNext(rng, prev))
    }
    return walk.map(RomanNumeral)
}
