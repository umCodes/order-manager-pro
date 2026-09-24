import type { Request, Response } from "express";
import { ZohoGetDrafts, ZohoGetInvoiceById, ZohoGetRecentNonDraftInvoices } from "../../services/zoho/invoices/index.js";
import { ZohoGetCustomerById, ZohoGetCustomersCached, getContactPreferredLanguage } from "../../services/zoho/customers/index.js";
import { createInvoicePdfBufferForLanguage, toInvoicePdfData } from "../../pdf/index.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { businessDayKey } from "../../utils/businessDate.js";
import { getCollectedToday, reconcileDailyEstimate } from "../../services/dailyTotals.js";

/**
 * Lists every invoice currently in draft status, each with its customer's
 * custom fields (address, business type, preferred language, ...) attached
 * as `customer_custom_fields`.
 *
 * Zoho's list-invoices rows only carry the invoice's own custom fields, not
 * the contact's, so unless a row already has `customer_custom_fields` they're
 * joined in from the cached customer list — at most one extra Zoho request
 * (to warm that cache), never one per customer. A failure there only drops
 * the fields; the drafts themselves still come back.
 */
export async function getDraftInvoices(req: Request, res: Response) {
  try {
    const access_token = requireAccessToken(req, "A problem occured getting draft invoices");

    const [drafts, customers] = await Promise.all([
      ZohoGetDrafts(access_token),
      ZohoGetCustomersCached(access_token).catch((error: unknown) => {
        console.error("Failed to load customers for draft custom fields:", error);
        return [];
      }),
    ]);

    const customFieldsByCustomerId = new Map<string, unknown[]>(
      customers.map((c: any) => [String(c.contact_id), c.custom_fields ?? []]),
    );

    res.status(200).json({
      drafts: drafts.map((draft: any) => ({
        ...draft,
        customer_custom_fields:
          draft.customer_custom_fields ?? customFieldsByCustomerId.get(String(draft.customer_id)) ?? [],
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

/**
 * The Drafts tab's "estimated amount for the day": today's scheduled drafts
 * summed up, reconciled against a Redis-cached high-water mark so the
 * number never drops within the same business day just because a draft got
 * paid/sent and left the draft list (see services/dailyTotals.ts) — plus
 * how much of it has actually been collected so far today.
 *
 * Also reports drafts dated before today that are still unsent ("past
 * due" — the Drafts tab shows them under today), summed live on every
 * request and deliberately kept out of the Redis high-water mark: they're
 * leftovers from earlier days, not part of today's own schedule.
 */
export async function getTodayEstimate(req: Request, res: Response) {
  try {
    const access_token = requireAccessToken(req, "A problem occured getting today's estimate");

    const drafts = await ZohoGetDrafts(access_token);
    const today = businessDayKey();
    const draftsToday = drafts.filter((d: any) => d.date === today);
    const freshTotal = draftsToday.reduce((sum: number, d: any) => sum + (d.total ?? 0), 0);
    const draftsPastDue = drafts.filter((d: any) => d.date && d.date < today);
    const pastDueTotal = draftsPastDue.reduce((sum: number, d: any) => sum + (d.total ?? 0), 0);

    const [estimatedTotal, collectedToday] = await Promise.all([
      reconcileDailyEstimate(freshTotal),
      getCollectedToday(),
    ]);

    res.status(200).json({
      estimatedTotal,
      collectedToday,
      draftCountToday: draftsToday.length,
      pastDueTotal,
      pastDueCount: draftsPastDue.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

/** Lists invoices from the last 30 days that aren't drafts — the "Previous Transactions" view. */
export async function getRecentInvoices(req: Request, res: Response) {
  try {
    const access_token = requireAccessToken(req, "A problem occured getting recent invoices");

    const invoices = await ZohoGetRecentNonDraftInvoices(access_token);
    res.status(200).json({ invoices });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

/** Fetches one invoice in full, including its line items. */
export async function getInvoiceById(req: Request, res: Response) {
  const id  = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured getting the invoice");
    if (!id) throw new Error("id not provided");

    const invoice = await ZohoGetInvoiceById(access_token, id);
    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

/**
 * Streams the invoice PDF (same classic template used for the WhatsApp
 * notification) inline, so the frontend can open it in a new tab and the
 * browser's native print dialog is right there. Falls back to "am" if the
 * invoice has no linked customer to resolve a preferred language from.
 */
export async function getInvoicePdf(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured getting the invoice PDF");
    if (!id) throw new Error("id not provided");

    const invoice = await ZohoGetInvoiceById(access_token, id);

    const preferredLanguage = invoice.customer_id
      ? getContactPreferredLanguage(await ZohoGetCustomerById(access_token, String(invoice.customer_id)))
      : "am";

    const pdf = await createInvoicePdfBufferForLanguage(toInvoicePdfData(invoice), preferredLanguage);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate invoice PDF",
    });
  }
}
