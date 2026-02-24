import seedrandom from 'seedrandom'
import type { Brand } from './brand'
import type { NonEmpty } from './NonEmpty'

export type Seed = Brand<number, 'Seed'>
export function Seed(n: number): Seed {
    return n as Seed
}

export interface Rng {
    next(): number
    int(min: number, max: number): number
    pick<T>(arr: NonEmpty<T>): T
}

export function createRng(seed: Seed): Rng {
    const prng = seedrandom(seed.toString())
    return {
        next: () => prng(),
        int(min, max) {
            return min + Math.floor(prng() * (max - min + 1))
        },
        pick(arr) {
            const all = arr.toArray()
            return all[Math.floor(prng() * all.length)] ?? arr.head
        },

    }
}
