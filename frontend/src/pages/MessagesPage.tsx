import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Pencil, Trash2 } from "lucide-react";
import {
  deleteTelegramMessage,
  editTelegramMessage,
  fetchDraftInvoices,
  fetchTelegramMessages,
  fetchWhatsAppMessages,
  replyToTelegramMessage,
  sendTelegramMessage,
} from "../lib/api";
import ConfirmModal from "../components/ConfirmModal";
import { shareOrDownloadFile } from "../lib/shareFile";
import type { TelegramLogMessage, WhatsAppLogMessage } from "../lib/api";
import type { DraftInvoice } from "../types";

type ViewMode = "telegram" | "whatsapp";

const WHATSAPP_STATUS_LABEL: Record<WhatsAppLogMessage["status"], string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

const WHATSAPP_STATUS_BADGE_CLASS: Record<WhatsAppLogMessage["status"], string> = {
  sent: "badge",
  delivered: "badge badge--wa-delivered",
  read: "badge badge--wa-read",
  failed: "badge badge--wa-failed",
};

/**
 * Free-text Telegram message composer, optionally scoped as a reply to a
 * specific draft invoice, plus a log of messages sent through this app to
 * the channel in the last 72 hours. The Bot API has no way to fetch a
 * channel's full history, so the log only ever covers messages this app
 * itself sent (invoice notices included) — not ones posted by anyone else.
 * A toggle switches to a read-only WhatsApp notification log instead,
 * showing each message's real delivery status as last reported by Meta.
 */
export default function MessagesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("telegram");

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

  const [waMessages, setWaMessages] = useState<WhatsAppLogMessage[]>([]);
  const [isLoadingWa, setIsLoadingWa] = useState(true);
  const [waError, setWaError] = useState<string | null>(null);
  const [isExportingWa, setIsExportingWa] = useState(false);
  const [waExportError, setWaExportError] = useState<string | null>(null);

  // Newest-first per recipient number, with each number's group ordered by
  // its own most recent message — this is what makes "under each number,
  // you'll see the message that was sent to that number each time" work.
  const waGroups = useMemo(() => {
    const byNumber = new Map<string, { to: string; customerName?: string; messages: WhatsAppLogMessage[] }>();
    for (const message of waMessages) {
      const group = byNumber.get(message.to);
      if (group) {
        group.messages.push(message);
        if (message.customer_name && !group.customerName) group.customerName = message.customer_name;
      } else {
        byNumber.set(message.to, {
          to: message.to,
          ...(message.customer_name && { customerName: message.customer_name }),
          messages: [message],
        });
      }
    }
    const groups = Array.from(byNumber.values());
    for (const group of groups) {
      group.messages.sort((a, b) => b.updated_at - a.updated_at);
    }
    groups.sort((a, b) => b.messages[0]!.updated_at - a.messages[0]!.updated_at);
    return groups;
  }, [waMessages]);

  useEffect(() => {
    fetchDraftInvoices().then(setDrafts).catch(() => setDrafts([]));
    loadMessages();
    loadWhatsAppMessages();
  }, []);

  function loadWhatsAppMessages() {
    setIsLoadingWa(true);
    setWaError(null);
    fetchWhatsAppMessages()
      .then(setWaMessages)
      .catch((e) => setWaError(e instanceof Error ? e.message : "Failed to load WhatsApp messages"))
      .finally(() => setIsLoadingWa(false));
  }

  function csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  async function handleDownloadWaLog() {
    setIsExportingWa(true);
    setWaExportError(null);
    try {
      const header = ["Customer", "Phone", "Template", "Language", "Status", "Sent At", "Last Updated", "Error"];
      const rows = waMessages.map((m) =>
        [
          m.customer_name ?? "",
          m.to,
          m.template_name,
          m.language,
          WHATSAPP_STATUS_LABEL[m.status],
          new Date(m.created_at).toLocaleString(),
          new Date(m.updated_at).toLocaleString(),
          m.error?.message ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
      const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");
      await shareOrDownloadFile(new Blob([csv], { type: "text/csv" }), "whatsapp-messages.csv", "text/csv");
    } catch (e) {
      setWaExportError(e instanceof Error ? e.message : "Failed to download WhatsApp log");
    } finally {
      setIsExportingWa(false);
    }
  }

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

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle__option${viewMode === "telegram" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setViewMode("telegram")}
        >
          Telegram
        </button>
        <button
          type="button"
          className={`mode-toggle__option${viewMode === "whatsapp" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setViewMode("whatsapp")}
        >
          WhatsApp
        </button>
      </div>

      {viewMode === "telegram" && (
        <>
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
        </>
      )}

      {viewMode === "whatsapp" && (
        <>
          <div className="page-header">
            <p className="page-subtitle" style={{ margin: 0 }}>
              Notifications sent through this app in the last 7 days
            </p>
            <button
              type="button"
              className="icon-btn"
              onClick={handleDownloadWaLog}
              disabled={isExportingWa || waMessages.length === 0}
              aria-label="Download WhatsApp log"
              title="Download WhatsApp log"
            >
              <Download size={14} />
            </button>
          </div>

          {waError && <div className="form-error">{waError}</div>}
          {waExportError && <div className="form-error">{waExportError}</div>}

          {isLoadingWa ? (
            <div className="items-area__empty">Loading…</div>
          ) : waGroups.length === 0 ? (
            <div className="items-area__empty">No WhatsApp notifications in the last 7 days</div>
          ) : (
            <div className="wa-log">
              {waGroups.map((group) => (
                <div key={group.to} className="wa-log-group">
                  <div className="wa-log-group__header">
                    {group.customerName && <span className="wa-log-group__name">{group.customerName}</span>}
                    <span className="wa-log-group__number">{group.to}</span>
                  </div>
                  <div className="telegram-log">
                    {group.messages.map((message) => (
                      <div key={message.message_id} className="telegram-log__row">
                        <div className="telegram-log__main">
                          <div className="telegram-log__text">
                            {message.template_name} <span className="badge">{message.language}</span>
                          </div>
                          <div className="telegram-log__meta">
                            {new Date(message.updated_at).toLocaleString()}
                            <span className={WHATSAPP_STATUS_BADGE_CLASS[message.status]}>
                              {WHATSAPP_STATUS_LABEL[message.status]}
                            </span>
                            {message.status === "failed" && message.error?.message && (
                              <span title={message.error.message}>— {message.error.message}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
