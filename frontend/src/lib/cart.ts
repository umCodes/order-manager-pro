import type { Cart, CartLine } from "../types";

/** The item a cart line is for: its own `item_id` when it's an extra line, else its key. */
export const cartLineItemId = (cartKey: string, line: CartLine) => line.item_id ?? cartKey;

/** A free cart key for another line of `itemId`: the id itself, else "<item_id>~2", "~3"… */
export function nextCartKey(cart: Cart, itemId: string): string {
  if (!cart[itemId]) return itemId;
  let n = 2;
  while (cart[`${itemId}~${n}`]) n++;
  return `${itemId}~${n}`;
}
