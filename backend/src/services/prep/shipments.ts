import { redisClient } from "../../config/redis.js";

/**
 * What the preparers recorded as actually leaving the warehouse, per draft
 * line item. Kept in Redis only (one hash per invoice, keyed by
 * line_item_id) — the Zoho invoice is never changed by recording a shipment;
 * settling a shortfall is a separate, office-side decision.
 */
const SHIPMENTS_TTL_SECONDS = 60 * 60 * 24 * 60;

export type ShippedRecord = {
  quantity: number;
  /** ISO timestamp of when it was recorded. */
  recorded_at: string;
};

export type ShipmentUpdate = {
  line_item_id: string;
  /** null clears the record (back to "not done yet"). */
  quantity: number | null;
};

function shipmentsKey(invoiceId: string) {
  return `prep:shipped:${invoiceId}`;
}

function parseRecord(raw: string): ShippedRecord | null {
  try {
    const record = JSON.parse(raw);
    return Number.isFinite(record?.quantity) ? record : null;
  } catch {
    return null;
  }
}

/** Recorded shipments for each of `invoiceIds`, as invoice_id → line_item_id → record. */
export async function getShipments(invoiceIds: string[]): Promise<Record<string, Record<string, ShippedRecord>>> {
  const hashes = await Promise.all(invoiceIds.map((id) => redisClient.hGetAll(shipmentsKey(id))));
  const result: Record<string, Record<string, ShippedRecord>> = {};
  invoiceIds.forEach((invoiceId, index) => {
    const lines: Record<string, ShippedRecord> = {};
    for (const [lineItemId, raw] of Object.entries(hashes[index] ?? {})) {
      const record = parseRecord(raw);
      if (record) lines[lineItemId] = record;
    }
    result[invoiceId] = lines;
  });
  return result;
}

/** Records (or clears) shipped quantities for some of an invoice's lines; returns all of its records. */
export async function saveShipments(invoiceId: string, updates: ShipmentUpdate[]): Promise<Record<string, ShippedRecord>> {
  const key = shipmentsKey(invoiceId);
  const recordedAt = new Date().toISOString();
  const multi = redisClient.multi();
  for (const { line_item_id, quantity } of updates) {
    if (quantity === null) multi.hDel(key, line_item_id);
    else multi.hSet(key, line_item_id, JSON.stringify({ quantity, recorded_at: recordedAt } satisfies ShippedRecord));
  }
  multi.expire(key, SHIPMENTS_TTL_SECONDS);
  await multi.exec();
  return (await getShipments([invoiceId]))[invoiceId] ?? {};
}

/** Validates a request body's `lines` array into shipment updates; throws a readable error otherwise. */
export function parseShipmentUpdates(value: unknown): ShipmentUpdate[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("lines must be a non-empty array");
  if (value.length > 200) throw new Error("Too many lines");
  return value.map((line) => {
    const lineItemId = line?.line_item_id;
    const quantity = line?.quantity;
    if ((typeof lineItemId !== "string" && typeof lineItemId !== "number") || String(lineItemId).length === 0) {
      throw new Error("Each line needs a line_item_id");
    }
    if (quantity !== null && (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0)) {
      throw new Error("quantity must be a number of 0 or more, or null");
    }
    return { line_item_id: String(lineItemId), quantity };
  });
}
