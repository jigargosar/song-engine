import seedrandom from 'seedrandom'
import type { Brand } from './brand'
import { brand } from './brand'
import { NonEmpty } from './NonEmpty'

export type Seed = Brand<number, 'Seed'>
export function Seed(n: number): Seed {
    return brand<Seed>(n)
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
            const all = NonEmpty.toArray(arr)
            return all[Math.floor(prng() * all.length)] ?? NonEmpty.head(arr)
        },

    }
}
