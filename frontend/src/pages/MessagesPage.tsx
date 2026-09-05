import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import {
  deleteTelegramMessage,
  editTelegramMessage,
  fetchDraftInvoices,
  fetchTelegramMessages,
  replyToTelegramMessage,
  sendTelegramMessage,
} from "../lib/api";
import ConfirmModal from "../components/ConfirmModal";
import type { TelegramLogMessage } from "../lib/api";
import type { DraftInvoice } from "../types";

/**
 * Free-text Telegram message composer, optionally scoped as a reply to a
 * specific draft invoice, plus a log of messages sent through this app to
 * the channel in the last 72 hours. The Bot API has no way to fetch a
 * channel's full history, so the log only ever covers messages this app
 * itself sent (invoice notices included) — not ones posted by anyone else.
 */
export default function MessagesPage() {
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [logMessages, setLogMessages] = useState<TelegramLogMessage[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchDraftInvoices().then(setDrafts).catch(() => setDrafts([]));
    loadMessages();
  }, []);

  function loadMessages() {
    setIsLoadingLog(true);
    setLogError(null);
    fetchTelegramMessages()
      .then(setLogMessages)
      .catch((e) => setLogError(e instanceof Error ? e.message : "Failed to load messages"))
      .finally(() => setIsLoadingLog(false));
  }

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
      loadMessages();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(message: TelegramLogMessage) {
    setEditingMessageId(message.message_id);
    setEditText(message.text);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditText("");
    setEditError(null);
  }

  function saveEdit() {
    if (editingMessageId === null || !editText.trim()) return;
    setIsSavingEdit(true);
    setEditError(null);
    editTelegramMessage(editingMessageId, editText)
      .then(() => {
        setEditingMessageId(null);
        setEditText("");
        loadMessages();
      })
      .catch((e) => setEditError(e instanceof Error ? e.message : "Failed to edit message"))
      .finally(() => setIsSavingEdit(false));
  }

  function handleDelete() {
    if (deletingMessageId === null) return;
    setIsDeleting(true);
    setDeleteError(null);
    deleteTelegramMessage(deletingMessageId)
      .then(() => {
        setDeletingMessageId(null);
        loadMessages();
      })
      .catch((e) => setDeleteError(e instanceof Error ? e.message : "Failed to delete message"))
      .finally(() => setIsDeleting(false));
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

      <div className="page-header" style={{ marginTop: 28 }}>
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Recent Messages
        </h2>
      </div>
      <p className="page-subtitle">Sent through this app in the last 72 hours</p>

      {logError && <div className="form-error">{logError}</div>}

      {isLoadingLog ? (
        <div className="items-area__empty">Loading…</div>
      ) : logMessages.length === 0 ? (
        <div className="items-area__empty">No messages in the last 72 hours</div>
      ) : (
        <div className="telegram-log">
          {logMessages.map((message) => (
            <div key={message.message_id} className="telegram-log__row">
              {editingMessageId === message.message_id ? (
                <div className="telegram-log__edit">
                  <textarea
                    className="textarea"
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  {editError && <div className="form-error">{editError}</div>}
                  <div className="invoice-details__actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={isSavingEdit}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={isSavingEdit || !editText.trim()}
                      onClick={saveEdit}
                    >
                      {isSavingEdit ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="telegram-log__main">
                    <div className="telegram-log__text">{message.text}</div>
                    <div className="telegram-log__meta">
                      {new Date(message.created_at).toLocaleString()}
                      {message.edited && <span className="badge">edited</span>}
                    </div>
                  </div>
                  <div className="telegram-log__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Edit message"
                      title="Edit message"
                      onClick={() => startEdit(message)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Delete message"
                      title="Delete message"
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingMessageId(message.message_id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {deletingMessageId !== null && (
        <ConfirmModal
          title="Delete message"
          message="Delete this message from the Telegram channel? This can't be undone."
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          error={deleteError}
          isConfirming={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMessageId(null)}
        />
      )}
    </div>
  );
}
