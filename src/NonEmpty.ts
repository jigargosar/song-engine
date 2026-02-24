export type NonEmpty<T> = {
    readonly __head: T
    readonly __tail: readonly T[]
}

function head<T>(ne: NonEmpty<T>): T { return ne.__head }
function tail<T>(ne: NonEmpty<T>): readonly T[] { return ne.__tail }

function init<T>([h, ...t]: [T, ...T[]]): NonEmpty<T> {
    return { __head: h, __tail: t }
}

function fromArray<T>([h, ...t]: readonly T[]): NonEmpty<T> | null {
    return h !== undefined ? init([h, ...t]) : null
}

function map<T, U>(fn: (item: T) => U, ne: NonEmpty<T>): NonEmpty<U> {
    return { __head: fn(head(ne)), __tail: tail(ne).map(fn) }
}

function sort<T>(compareFn: (a: T, b: T) => number, ne: NonEmpty<T>): NonEmpty<T> {
    return fromArray([head(ne), ...tail(ne)].sort(compareFn)) ?? ne
}

function toArray<T>(ne: NonEmpty<T>): readonly T[] {
    return [head(ne), ...tail(ne)]
}

export const NonEmpty = { init, fromArray, head, tail, map, sort, toArray }
