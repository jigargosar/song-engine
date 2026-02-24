import type { Rng } from './rng'

export type InstrumentName =
    | 'pad'
    | 'bass'
    | 'kick'
    | 'snare'
    | 'hat'
    | 'arp'
    | 'melody'

export type InstrumentVolumes = Record<InstrumentName, number>

// --- Sigmoid activation (internal definitions) ---

const SLOT_THRESHOLDS = [0.05, 0.18, 0.3, 0.42, 0.55, 0.68, 0.82] as const
const SLOT_SMOOTHNESS = [0.14, 0.13, 0.12, 0.11, 0.1, 0.09, 0.08] as const

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x))
}

// --- Orderings (preset instrument priority orders) ---

export const ORDERINGS: readonly (readonly InstrumentName[])[] = [
    ['pad', 'bass', 'hat', 'kick', 'arp', 'snare', 'melody'],
    ['arp', 'hat', 'pad', 'bass', 'kick', 'snare', 'melody'],
    ['bass', 'kick', 'hat', 'pad', 'snare', 'arp', 'melody'],
    ['hat', 'pad', 'bass', 'kick', 'arp', 'snare', 'melody'],
    ['melody', 'pad', 'arp', 'bass', 'hat', 'kick', 'snare'],
]

export const ORDERING_NAMES = [
    'Classic',
    'Arp Lead',
    'Bass Heavy',
    'Rhythm First',
    'Melodic',
] as const

// --- Exports ---

export function buildEnergyCurve(
    rng: Rng,
    sectionEnergies: readonly { readonly name: string; readonly bars: number; readonly energy: number }[],
): { curve: number[]; sectionNames: string[] } {
    const raw: number[] = []
    const sectionNames: string[] = []

    for (const section of sectionEnergies) {
        for (let b = 0; b < section.bars; b++) {
            raw.push(section.energy)
            sectionNames.push(section.name)
        }
    }

    // 3-pass neighbor averaging for smooth transitions
    function smooth(arr: readonly number[]): number[] {
        return arr.map((e, i) => {
            const prev = arr[i - 1] ?? e
            const next = arr[i + 1] ?? e
            return prev * 0.15 + e * 0.7 + next * 0.15
        })
    }

    let curve = raw
    for (let pass = 0; pass < 3; pass++) curve = smooth(curve)

    // Seeded noise for organic breathing
    const noise: number[] = []
    for (let i = 0; i <= raw.length; i++) noise.push(rng.next())

    curve = curve.map((e, i) => {
        const fi = Math.floor(i * 0.5)
        const frac = i * 0.5 - fi
        const t = frac * frac * (3 - 2 * frac) // smoothstep
        const a = noise[Math.min(fi, noise.length - 1)] ?? 0.5
        const b = noise[Math.min(fi + 1, noise.length - 1)] ?? 0.5
        const n = (a + (b - a) * t - 0.5) * 0.1
        return Math.max(0.01, Math.min(1, e + n))
    })

    return { curve, sectionNames }
}

export function computeVolumes(
    energy: number,
    ordering: readonly InstrumentName[],
): InstrumentVolumes {
    const vols: InstrumentVolumes = {
        pad: 0, bass: 0, kick: 0, snare: 0, hat: 0, arp: 0, melody: 0,
    }
    for (let i = 0; i < ordering.length; i++) {
        const name = ordering[i]
        const threshold = SLOT_THRESHOLDS[i]
        const smoothness = SLOT_SMOOTHNESS[i]
        if (name !== undefined && threshold !== undefined && smoothness !== undefined) {
            vols[name] = sigmoid((energy - threshold) / smoothness)
        }
    }
    return vols
}

const ALL_INSTRUMENTS: readonly InstrumentName[] = ['pad', 'bass', 'kick', 'snare', 'hat', 'arp', 'melody']

export function dominantInstruments(vols: InstrumentVolumes): InstrumentName[] {
    return ALL_INSTRUMENTS
        .filter((name) => vols[name] > 0.5)
        .sort((a, b) => vols[b] - vols[a])
}
