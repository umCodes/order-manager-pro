import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import ClickableCard from "./ClickableCard";
import DownloadInvoiceButton from "./DownloadInvoiceButton";
import PdfFileButton from "./PdfFileButton";
import { fetchCustomerTransactions, returnNoticePdfUrl, type CustomerTransactions as Transactions, type TransactionType } from "../lib/api";
import { businessDayKey } from "../lib/businessTime";
import { currency } from "../lib/currency";
import { formatStatus } from "../lib/status";
import type { CustomerPayment } from "../types";

type Props = {
  customerId: string;
  onSelectInvoice: (invoiceId: string) => void;
  onEditPayment: (payment: CustomerPayment) => void;
  onDeletePayment: (payment: CustomerPayment) => void;
  /** Changes when a payment was edited or deleted elsewhere on the page, to reload the list. */
  reloadKey?: string | number;
};

type PeriodKey = "this_year" | "this_month" | "last_month" | "last_year" | "custom";

const TYPES: { key: TransactionType; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "returns", label: "Returns" },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_year", label: "This year" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_year", label: "Last year" },
  { key: "custom", label: "Dates" },
];

const PAGE_SIZE = 30;

const PAYMENT_MODE_LABELS: Record<string, string> = { cash: "Cash", creditcard: "Card", banktransfer: "Bank transfer" };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The period's first and last day (YYYY-MM-DD), by the business day. */
function periodRange(key: Exclude<PeriodKey, "custom">): { from: string; to: string } {
  const today = businessDayKey();
  const [year = 0, month = 1] = today.split("-").map(Number);
  switch (key) {
    case "this_year":
      return { from: `${year}-01-01`, to: today };
    case "this_month":
      return { from: `${year}-${pad(month)}-01`, to: today };
    case "last_month": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOf(y, m))}` };
    }
    case "last_year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}

/**
 * The customer's transactions of any period (not only the last 30 days):
 * invoices, payments or returns, chosen with tabs, for this year by default.
 * Opening an invoice leads to its page — to see it, record a payment or a
 * return. Loaded only once the section is opened.
 */
export default function CustomerTransactions({ customerId, onSelectInvoice, onEditPayment, onDeletePayment, reloadKey }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("invoices");
  const [period, setPeriod] = useState<PeriodKey>("this_year");
  const [custom, setCustom] = useState(() => periodRange("this_month"));
  // What was loaded, tagged with the choice it was loaded for, so a change of choice reads as loading.
  const [result, setResult] = useState<{ key: string; data?: Transactions; error?: string } | null>(null);
  const [shown, setShown] = useState({ key: "", count: PAGE_SIZE });

  const range = period === "custom" ? custom : periodRange(period);
  const validRange = !!range.from && !!range.to && range.from <= range.to;
  const requestKey = `${type}|${range.from}|${range.to}|${reloadKey ?? ""}`;

  useEffect(() => {
    if (!isOpen || !validRange) return;
    let cancelled = false;
    fetchCustomerTransactions(customerId, type, range.from, range.to)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, error: e instanceof Error ? e.message : "Failed to load transactions" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, customerId, type, range.from, range.to, validRange, requestKey]);

  const loaded = result?.key === requestKey ? result : null;
  const current = loaded?.data ?? null;
  const error = loaded?.error ?? null;
  const isLoading = !loaded;
  // Back to the first page whenever the choice changes.
  const visibleCount = shown.key === requestKey ? shown.count : PAGE_SIZE;
  const showMore = () => setShown({ key: requestKey, count: visibleCount + PAGE_SIZE });

  return (
    <div className="line-items">
      <button type="button" className="line-items__header customer-tx__toggle" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen}>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Transactions
        {!isOpen && <span className="customer-tx__hint">invoices, payments, returns — any period</span>}
      </button>

      {isOpen && (
        <>
          <div className="mode-toggle customer-tx__types">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`mode-toggle__option${type === t.key ? " mode-toggle__option--active" : ""}`}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="customer-tx__periods">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`customer-tx__period${period === p.key ? " customer-tx__period--active" : ""}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="customer-tx__dates">
              <label>
                <span>From</span>
                <input type="date" className="input" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </label>
              <label>
                <span>To</span>
                <input type="date" className="input" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </label>
            </div>
          )}

          {!validRange ? (
            <div className="items-area__empty">Pick the period's first and last day</div>
          ) : error ? (
            <div className="form-error">{error}</div>
          ) : !current || isLoading ? (
            <div className="items-area__empty">Loading...</div>
          ) : (
            <>
              <div className="customer-tx__totals">{totalsLine(current)}</div>
              {current.items.length === 0 ? (
                <div className="items-area__empty">Nothing in this period</div>
              ) : (
                <div className="draft-list">
                  {current.type === "invoices" &&
                    current.items.slice(0, visibleCount).map((invoice) => (
                      <ClickableCard key={invoice.invoice_id} onClick={() => onSelectInvoice(invoice.invoice_id)}>
                        <div className="draft-card__top">
                          <span className="draft-card__invoice-number">{invoice.invoice_number}</span>
                          <div className="draft-card__top-right" onClick={(e) => e.stopPropagation()}>
                            <span className={`draft-card__status customer-tx__status--${invoice.status}`}>{formatStatus(invoice.status)}</span>
                            <DownloadInvoiceButton invoiceId={invoice.invoice_id} invoiceNumber={invoice.invoice_number} />
                          </div>
                        </div>
                        <div className="draft-card__bottom">
                          <span className="draft-card__scheduled">
                            {invoice.date}
                            {invoice.balance > 0 && invoice.balance < invoice.total && ` · ${currency(invoice.balance)} left`}
                          </span>
                          <span className="draft-card__total">{currency(invoice.total)}</span>
                        </div>
                      </ClickableCard>
                    ))}

                  {current.type === "payments" &&
                    current.items.slice(0, visibleCount).map((payment) => {
                      const asPayment: CustomerPayment = {
                        payment_id: payment.payment_id,
                        ...(payment.payment_number ? { payment_number: payment.payment_number } : {}),
                        date: payment.date,
                        amount: payment.amount,
                        ...(payment.payment_mode ? { payment_mode: payment.payment_mode } : {}),
                        kind: "payment",
                      };
                      return (
                        <div key={payment.payment_id} className="draft-card">
                          <div className="draft-card__top">
                            <span className="draft-card__invoice-number">{payment.payment_number || "Payment"}</span>
                            <div className="draft-card__top-right">
                              {payment.payment_mode && (
                                <span className="draft-card__status">{PAYMENT_MODE_LABELS[payment.payment_mode.toLowerCase()] ?? payment.payment_mode}</span>
                              )}
                              <button type="button" className="icon-btn" onClick={() => onEditPayment(asPayment)} aria-label={`Edit payment ${payment.payment_number ?? ""}`} title="Edit payment">
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn--danger"
                                onClick={() => onDeletePayment(asPayment)}
                                aria-label={`Delete payment ${payment.payment_number ?? ""}`}
                                title="Delete payment"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="draft-card__bottom">
                            <span className="draft-card__scheduled">
                              {payment.date}
                              {payment.invoice_numbers && ` · ${payment.invoice_numbers}`}
                            </span>
                            <span className="draft-card__total">{currency(payment.amount)}</span>
                          </div>
                        </div>
                      );
                    })}

                  {current.type === "returns" &&
                    current.items.slice(0, visibleCount).map((ret) => {
                      const content = (
                        <>
                          <div className="draft-card__top">
                            <span className="draft-card__invoice-number">{ret.creditnote_number}</span>
                            <div className="draft-card__top-right" onClick={(e) => e.stopPropagation()}>
                              {ret.invoice_number && <span className="draft-card__status">of {ret.invoice_number}</span>}
                              {ret.invoice_id && ret.has_notice && (
                                <PdfFileButton
                                  url={returnNoticePdfUrl(ret.invoice_id, ret.creditnote_id)}
                                  filename={`${ret.creditnote_number}.pdf`}
                                  label={`return notice ${ret.creditnote_number}`}
                                />
                              )}
                            </div>
                          </div>
                          <div className="draft-card__bottom">
                            <span className="draft-card__scheduled">{ret.date}</span>
                            <span className="draft-card__total">{currency(ret.total)}</span>
                          </div>
                        </>
                      );
                      return ret.invoice_id ? (
                        <ClickableCard key={ret.creditnote_id} onClick={() => onSelectInvoice(ret.invoice_id!)}>
                          {content}
                        </ClickableCard>
                      ) : (
                        <div key={ret.creditnote_id} className="draft-card">
                          {content}
                        </div>
                      );
                    })}
                </div>
              )}
              {current.items.length > visibleCount && (
                <button type="button" className="btn btn--secondary btn--full customer-tx__more" onClick={showMore}>
                  Show more ({current.items.length - visibleCount} left)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function totalsLine(data: Transactions) {
  switch (data.type) {
    case "invoices":
      return `${data.totals.count} invoice${data.totals.count === 1 ? "" : "s"} · ${currency(data.totals.total)}${data.totals.balance > 0 ? ` · ${currency(data.totals.balance)} still owed` : ""}`;
    case "payments":
      return `${data.totals.count} payment${data.totals.count === 1 ? "" : "s"} · ${currency(data.totals.amount)}`;
    case "returns":
      return `${data.totals.count} return${data.totals.count === 1 ? "" : "s"} · ${currency(data.totals.total)}`;
  }
}
