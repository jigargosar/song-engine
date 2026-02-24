declare const __brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [__brand]: B }

export function brand<B extends Brand<unknown, string>>(
    value: Omit<B, typeof __brand>,
): B {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- unavoidable at brand boundary
    return value as B
}
