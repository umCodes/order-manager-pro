import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchDraftInvoices, replyToTelegramMessage, sendTelegramMessage } from "../lib/api";
import type { DraftInvoice } from "../types";

/** Free-text Telegram message composer, optionally scoped as a reply to a specific draft invoice. */
export default function MessagesPage() {
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchDraftInvoices().then(setDrafts).catch(() => setDrafts([]));
  }, []);

  async function submitMessage() {
    if (!text.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (selectedInvoiceId) {
        await replyToTelegramMessage(text, selectedInvoiceId);
      } else {
        await sendTelegramMessage(text);
      }
      setText("");
      setSelectedInvoiceId("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Messages</h1>
      <p className="page-subtitle">Send to the team's Telegram channel</p>

      <div className="field">
        <label className="field-label" htmlFor="invoice-select">
          Invoice (optional)
        </label>
        <div className="select-wrap">
          <select
            id="invoice-select"
            className="select"
            value={selectedInvoiceId}
            onChange={(e) => setSelectedInvoiceId(e.target.value)}
          >
            <option value="">No invoice</option>
            {drafts.map((d) => (
              <option key={d.invoice_id} value={d.invoice_id}>
                {d.invoice_number}
              </option>
            ))}
          </select>
          <ChevronDown className="select-wrap__chevron" size={18} />
        </div>
      </div>

      <div className="field">
        <textarea
          className="textarea"
          rows={6}
          placeholder="Type your message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {submitError && <div className="form-error">{submitError}</div>}

      <button
        type="button"
        className="btn btn--primary btn--full"
        disabled={!text.trim() || isSubmitting}
        onClick={submitMessage}
      >
        {isSubmitting ? "Sending..." : "Send to Telegram"}
      </button>
    </div>
  );
}
