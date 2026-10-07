function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Spreads an amount — a payment, or a return's credit — across a customer's
 * open invoices oldest-first, and returns the per-invoice amounts to send to
 * Zoho. Drafts, paid and void invoices are skipped, and any amount left over
 * once they're all covered is simply not applied. Amounts are rounded to
 * cents, so floating-point leftovers never reach Zoho.
 */
export function getAppliedInvoices(invoices: any[], amount: number) {
  const eligible = invoices
    .filter(
      (inv) =>
        inv.status !== "draft" &&
        inv.status !== "paid" &&
        inv.status !== "void"
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const applied: { invoice_id: string; amount_applied: number }[] = [];
  let remaining = amount;

  for (const inv of eligible) {
    if (remaining <= 0) break;
    const amountApplied = round2(Math.min(inv.balance, remaining));
    if (amountApplied <= 0) continue;
    applied.push({ invoice_id: inv.invoice_id, amount_applied: amountApplied });
    remaining = round2(remaining - amountApplied);
  }

  return applied;
}
