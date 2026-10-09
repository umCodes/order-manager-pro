import { redisClient } from "../../config/redis.js";

/**
 * What happened to each draft line on its way out, in three steps, each
 * recorded by whoever did it:
 *   prepared — the preparer, as they put the order together
 *   sent     — the preparer, as it's loaded / handed over
 *   received — the delivery driver, as they take it
 * A line whose received amount differs from what was sent is a conflict.
 *
 * Kept in Redis only (one hash per invoice; field "<line_item_id>:<step>"
 * so the preparer and the driver never overwrite each other's writes). The
 * Zoho invoice is never changed by any of this.
 */
const LINES_TTL_SECONDS = 60 * 60 * 24 * 60;

export const PREP_STEPS = ["prepared", "sent", "received"] as const;
export type PrepStep = (typeof PREP_STEPS)[number];

export type StepRecord = {
  quantity: number;
  /** ISO timestamp of when it was recorded. */
  recorded_at: string;
};

export type LineRecords = Partial<Record<PrepStep, StepRecord>>;

export type StepUpdate = {
  line_item_id: string;
  /** null clears the record (back to "not done yet"). */
  quantity: number | null;
};

function linesKey(invoiceId: string) {
  return `prep:lines:${invoiceId}`;
}

export function isPrepStep(value: unknown): value is PrepStep {
  return typeof value === "string" && (PREP_STEPS as readonly string[]).includes(value);
}

function parseRecord(raw: string): StepRecord | null {
  try {
    const record = JSON.parse(raw);
    return Number.isFinite(record?.quantity) ? record : null;
  } catch {
    return null;
  }
}

/** Every recorded step for each of `invoiceIds`, as invoice_id → line_item_id → step → record. */
export async function getLineRecords(invoiceIds: string[]): Promise<Record<string, Record<string, LineRecords>>> {
  const hashes = await Promise.all(invoiceIds.map((id) => redisClient.hGetAll(linesKey(id))));
  const result: Record<string, Record<string, LineRecords>> = {};
  invoiceIds.forEach((invoiceId, index) => {
    const lines: Record<string, LineRecords> = {};
    for (const [field, raw] of Object.entries(hashes[index] ?? {})) {
      const separator = field.lastIndexOf(":");
      const lineItemId = field.slice(0, separator);
      const step = field.slice(separator + 1);
      const record = parseRecord(raw);
      if (!isPrepStep(step) || !record) continue;
      (lines[lineItemId] ??= {})[step] = record;
    }
    result[invoiceId] = lines;
  });
  return result;
}

/** Records (or clears) one step for some of an invoice's lines; returns all of that invoice's records. */
export async function saveStep(invoiceId: string, step: PrepStep, updates: StepUpdate[]): Promise<Record<string, LineRecords>> {
  const key = linesKey(invoiceId);
  const recordedAt = new Date().toISOString();
  const multi = redisClient.multi();
  for (const { line_item_id, quantity } of updates) {
    const field = `${line_item_id}:${step}`;
    if (quantity === null) multi.hDel(key, field);
    else multi.hSet(key, field, JSON.stringify({ quantity, recorded_at: recordedAt } satisfies StepRecord));
  }
  multi.expire(key, LINES_TTL_SECONDS);
  await multi.exec();
  return (await getLineRecords([invoiceId]))[invoiceId] ?? {};
}

/** Validates a request body's `lines` array; throws a readable error otherwise. Any amount of 0 or more is fine (1.5, 0, …). */
export function parseStepUpdates(value: unknown): StepUpdate[] {
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
