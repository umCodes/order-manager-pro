import { mintZohoAccessToken } from "../services/zoho/auth.js";
import { ZohoGetDrafts, ZohoGetInvoiceById } from "../services/zoho/invoices/index.js";
import { createInvoicePdf } from "../pdf/index.js";

/**
 * Development aid: renders the org's first draft invoice to ./test.pdf so the
 * PDF layout can be eyeballed without going through the app.
 *
 * NOTE: index.ts still runs this on every boot (as it always has), which costs
 * two Zoho API calls and writes test.pdf into the working directory each time.
 * Nothing depends on it — drop the call in index.ts to switch it off.
 */
export async function generateTestDraftInvoicePdf() {
  const { access_token } = await mintZohoAccessToken();
  const headers = `Bearer ${access_token}`;

  const drafts = await ZohoGetDrafts(headers);
  const draft = drafts?.[0];
  if (!draft) {
    console.log("No draft invoices found in Zoho, skipping test.pdf generation");
    return;
  }

  const invoice = await ZohoGetInvoiceById(headers, draft.invoice_id);

  await createInvoicePdf("./test.pdf", {
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    date: invoice.date,
    lineItems: invoice.line_items.map((item: any) => ({
      description: item.description,
      itemName: item.name,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
    })),
    totalPrice: invoice.total,
    paidAmount: invoice.payment_made,
    discountAmount: invoice.sub_total + invoice.tax_total + invoice.shipping_charge + invoice.adjustment - invoice.total,
    subTotal: invoice.sub_total,
  });

  console.log(`test.pdf created from draft ${invoice.invoice_number}`);
}
