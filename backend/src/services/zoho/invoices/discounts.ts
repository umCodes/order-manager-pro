import { ZohoGetInvoiceById } from "./queries.js"
import { ZohoUpdateInvoice } from "./mutations.js"
import { invoiceUpdateReason } from "../../../utils/invoiceUpdateReason.js"

function round2(value: number) {
    return Math.round(value * 100) / 100
}

/** A discount added to one invoice, with what's needed to take it back off. */
export type AppliedInvoiceDiscount = {
    invoice_id: string
    invoice_number: string
    amount: number
    /** The invoice's discount before this one was added, exactly as Zoho had it. */
    previous: { discount: number | string; discount_type?: string }
}

/**
 * Whether a discount can be added to the invoice: an entity-level one can't
 * sit alongside per-item discounts, so invoices that already have those are
 * left alone rather than having them replaced.
 */
function canAddDiscount(invoice: any) {
    return invoice.discount_type !== "item_level" || !Number(invoice.discount_amount)
}

/**
 * Adds `amount` to an invoice's entity-level discount, on top of whatever
 * discount it already has (Zoho's field is the total, so setting it alone
 * would replace an earlier discount instead of adding to it).
 */
export async function addInvoiceDiscount(
    headers: string,
    invoice: any,
    amount: number,
    reason: string,
): Promise<AppliedInvoiceDiscount> {
    if (!canAddDiscount(invoice)) {
        throw new Error(`Invoice ${invoice.invoice_number} has per-item discounts, so another discount can't be added to it.`)
    }

    const total = round2(Number(invoice.discount_amount || 0) + amount)
    const discounted = await ZohoUpdateInvoice(headers, String(invoice.invoice_id), {
        discount: total,
        discount_type: "entity_level",
        // Required once the invoice is no longer a draft.
        reason: invoiceUpdateReason(undefined, reason),
    })
    // Zoho can return 200 with the invoice unchanged instead of rejecting the
    // update outright (seen on non-draft invoices) — so a successful call
    // alone doesn't prove the discount took effect.
    if (round2(Number(discounted.discount)) !== total) {
        throw new Error(`Zoho did not apply the discount to invoice ${invoice.invoice_number}.`)
    }

    return {
        invoice_id: String(invoice.invoice_id),
        invoice_number: invoice.invoice_number,
        amount,
        previous: { discount: invoice.discount ?? 0, discount_type: invoice.discount_type },
    }
}

/**
 * Takes discounts added by addInvoiceDiscount back off, restoring each
 * invoice's earlier discount. Best-effort: a failure is logged, since this
 * runs while another error is already being reported.
 */
export async function removeInvoiceDiscounts(headers: string, applied: AppliedInvoiceDiscount[]) {
    for (const discount of applied) {
        try {
            await ZohoUpdateInvoice(headers, discount.invoice_id, {
                discount: discount.previous.discount,
                ...(discount.previous.discount_type ? { discount_type: discount.previous.discount_type } : {}),
                reason: invoiceUpdateReason(undefined, `Discount of ${discount.amount} undone after a failed payment`),
            })
        } catch (error) {
            console.error(`Error undoing discount on invoice ${discount.invoice_number}:`, error)
        }
    }
}

/**
 * Spreads a customer-level discount over their open invoices: the whole
 * discount goes on the oldest invoice whose balance can take it; when none
 * can alone, it's split oldest-first, each invoice taking up to its balance.
 * All or nothing — if any invoice refuses its share, the ones already
 * discounted are restored before the error is thrown. `openInvoices` must
 * already be sorted oldest-first.
 */
export async function applyCustomerDiscount(
    headers: string,
    openInvoices: any[],
    discount: number,
): Promise<AppliedInvoiceDiscount[]> {
    const totalBalance = round2(openInvoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0))
    if (discount > totalBalance) {
        throw new Error(`The discount is more than the customer's outstanding balance (${totalBalance}).`)
    }

    const reason = `Discount of ${discount} applied with a customer payment`
    const details = new Map<string, any>()
    const fetchDetails = async (inv: any) => {
        const id = String(inv.invoice_id)
        if (!details.has(id)) details.set(id, await ZohoGetInvoiceById(headers, id))
        return details.get(id)
    }

    // The plan is settled before anything is written, so a refusal can't
    // leave a partly placed discount behind.
    let plan: { invoice: any; amount: number }[] = []

    for (const inv of openInvoices) {
        if (Number(inv.balance) < discount) continue
        const invoice = await fetchDetails(inv)
        if (!canAddDiscount(invoice)) continue
        plan = [{ invoice, amount: discount }]
        break
    }

    if (plan.length === 0) {
        let remaining = discount
        for (const inv of openInvoices) {
            if (remaining <= 0) break
            const invoice = await fetchDetails(inv)
            if (!canAddDiscount(invoice)) continue
            const share = round2(Math.min(Number(invoice.balance), remaining))
            if (share <= 0) continue
            plan.push({ invoice, amount: share })
            remaining = round2(remaining - share)
        }
        if (remaining > 0) {
            throw new Error("The discount couldn't be placed: the invoices that could take it don't have enough balance left.")
        }
    }

    const applied: AppliedInvoiceDiscount[] = []
    try {
        for (const { invoice, amount } of plan) {
            applied.push(await addInvoiceDiscount(headers, invoice, amount, reason))
        }
    } catch (error) {
        await removeInvoiceDiscounts(headers, applied)
        throw error
    }
    return applied
}
