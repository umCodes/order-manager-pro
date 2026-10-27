/**
 * Item numbers on Telegram messages: each order numbers its own items ①, ②,
 * ③ … in the order they're first posted, and an item keeps its number for
 * the life of the order — a changes reply shows the same number again, and
 * an item added later takes the next free one (a removed item's number is
 * never reused). Preparers type the plain digit to refer to an item.
 */

/** Item number → the item it was given to, keyed the same way the changes reply compares items. */
export type ItemNumbers = Map<string, number>

type KeyedItem = { item_id?: string | number | null; description?: string | null }
/** How items are told apart on an order (see itemKeyFor). */
export type ItemKeyOf = (item: KeyedItem) => string

/** An item's identity on an order: its Zoho item id, or its description for a line without one. */
export const itemNumberKey: ItemKeyOf = (item) => String(item.item_id || item.description || "")

/**
 * Like itemNumberKey, but a general item (Settings) — which can be on an
 * order several times, once per thing it stands for — is told apart by its
 * description too, so each of its lines gets a number of its own.
 */
export function itemKeyFor(generalItemIds: Iterable<string>): ItemKeyOf {
    const general = new Set(generalItemIds)
    return (item) =>
        general.has(String(item.item_id ?? "")) ? `${item.item_id}|${String(item.description ?? "").trim()}` : itemNumberKey(item)
}

/**
 * ① – ⑳, ㉑ – ㉟ and ㊱ – ㊿ (Unicode has no circled numbers past 50);
 * anything higher falls back to "(51)".
 */
export function circledNumber(n: number): string {
    if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1)
    if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21)
    if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36)
    return `(${n})`
}

/**
 * `existing` numbers plus the next free number for every item in `items`
 * that doesn't have one yet, in the order given. `existing` is left as is.
 */
export function numberItems(items: KeyedItem[], existing?: ItemNumbers | null, keyOf: ItemKeyOf = itemNumberKey): ItemNumbers {
    const numbers: ItemNumbers = new Map(existing ?? [])
    let next = Math.max(0, ...numbers.values()) + 1
    for (const item of items) {
        const key = keyOf(item)
        if (!numbers.has(key)) numbers.set(key, next++)
    }
    return numbers
}
