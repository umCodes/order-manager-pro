import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Copy, FileText, Paperclip, Plus, Search, SendHorizontal, Trash2 } from "lucide-react";
import {
  createWhatsAppTemplate,
  fetchWhatsAppTemplates,
  sendWhatsAppTemplateMessage,
  uploadWhatsAppTemplateMedia,
  uploadWhatsAppTemplateSample,
  type NewWhatsAppTemplate,
  type WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppTemplate,
  type WhatsAppTemplateHeaderFormat,
  type WhatsAppTemplateValues,
} from "../lib/api";
import RefreshButton from "./RefreshButton";
import FilterChip from "./FilterChip";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "ar", label: "Arabic" },
  { code: "am", label: "Amharic" },
];

const CATEGORIES = [
  { value: "UTILITY", label: "Utility", hint: "Order updates, invoices, payment confirmations" },
  { value: "MARKETING", label: "Marketing", hint: "Offers, announcements, new products" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING: "In review",
  IN_APPEAL: "In appeal",
  REJECTED: "Rejected",
  PAUSED: "Paused",
  DISABLED: "Disabled",
};

/** The distinct {{…}} placeholders in a template text, in order of first appearance. */
function placeholdersIn(text: string | undefined): string[] {
  const found: string[] = [];
  for (const match of (text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

function fill(text: string | undefined, values: Record<string, string> | undefined) {
  return (text ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key) => values?.[key]?.trim() || whole);
}

function languageLabel(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Language names for the prefix our template names start with (am_…, ar_…, en_…). */
const NAME_LANGUAGES: Record<string, string> = { am: "Amharic", ar: "Arabic", en: "English", fr: "French", om: "Oromo", ti: "Tigrinya", so: "Somali" };

/** Words shown in capitals in a template's title ("invoice_pdf" → "Invoice PDF"). */
const ACRONYMS = new Set(["pdf", "id", "sms", "url", "vat", "etb", "otp"]);

/**
 * A template's name for reading: by our naming convention the first part
 * is the language the text is written in (which can differ from the
 * language it's registered under), shown as a badge; the rest becomes the
 * title, words capitalised: "am_payment_confirmation" → "Payment
 * Confirmation" with an "Amharic" badge. Names without a language prefix
 * just get the title treatment.
 */
function displayName(name: string): { title: string; language?: string } {
  const words = name.split("_").filter(Boolean);
  const prefix = words[0]?.toLowerCase();
  const hasLanguage = words.length > 1 && !!prefix && (prefix in NAME_LANGUAGES || /^[a-z]{2}$/.test(prefix));
  const titleWords = hasLanguage ? words.slice(1) : words;
  return {
    title: titleWords.map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))).join(" ") || name,
    ...(hasLanguage && { language: NAME_LANGUAGES[prefix] ?? prefix.toUpperCase() }),
  };
}

function TemplateName({ name }: { name: string }) {
  const { title, language } = displayName(name);
  return (
    <>
      <span className="wa-template__title">{title}</span>
      {language && <span className="badge wa-template__language">{language}</span>}
    </>
  );
}

function part(template: WhatsAppTemplate, type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS") {
  return template.components.find((c) => c.type === type);
}

type MediaFormat = Exclude<WhatsAppTemplateHeaderFormat, "TEXT">;

/** File headers: what to call them, which files a sample (for review) may be, and which files can be sent. */
const MEDIA_FORMATS: Record<MediaFormat, { label: string; icon: string; sampleAccept: string; sampleHint: string; sendAccept: string }> = {
  DOCUMENT: { label: "Document", icon: "📄", sampleAccept: "application/pdf", sampleHint: "a PDF", sendAccept: "*/*" },
  IMAGE: { label: "Image", icon: "📷", sampleAccept: "image/jpeg,image/png", sampleHint: "a JPG or PNG", sendAccept: "image/jpeg,image/png" },
  VIDEO: { label: "Video", icon: "🎥", sampleAccept: "video/mp4", sampleHint: "an MP4", sendAccept: "video/mp4,video/3gpp" },
};

function mediaFormatOf(template: WhatsAppTemplate): MediaFormat | undefined {
  const format = part(template, "HEADER")?.format;
  return format && format in MEDIA_FORMATS ? (format as MediaFormat) : undefined;
}

/** Why a template can't be sent from the app, if it can't. */
function unsendableReason(template: WhatsAppTemplate): string | undefined {
  if (template.status !== "APPROVED") return `${STATUS_LABELS[template.status] ?? template.status} — only approved templates can be sent`;
  const header = part(template, "HEADER");
  if (header?.format && header.format !== "TEXT" && !mediaFormatOf(template))
    return `Has a ${header.format.toLowerCase()} header, which can't be sent from here`;
  return undefined;
}

/** List order: approved first, then ones still in review, then paused, then rejected / disabled. */
const STATUS_ORDER: Record<string, number> = { APPROVED: 0, PENDING: 1, IN_APPEAL: 1, PAUSED: 2, REJECTED: 3, DISABLED: 3 };

function statusRank(status: string) {
  return STATUS_ORDER[status] ?? 2;
}

/** Rejected and disabled templates are hidden unless asked for — they can't be sent. */
function isHiddenByDefault(template: WhatsAppTemplate) {
  return template.status === "REJECTED" || template.status === "DISABLED";
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "APPROVED" ? "approved" : status === "REJECTED" || status === "DISABLED" ? "rejected" : "pending";
  return <span className={`badge wa-template__status wa-template__status--${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}

/** How a template reads, with any filled-in values substituted. */
function TemplatePreview({ template, values }: { template: WhatsAppTemplate; values?: WhatsAppTemplateValues }) {
  const header = part(template, "HEADER");
  const body = part(template, "BODY");
  const footer = part(template, "FOOTER");
  const buttons = part(template, "BUTTONS")?.buttons ?? [];
  return (
    <div className="wa-template__preview">
      {header &&
        (header.format && header.format !== "TEXT" ? (
          <div className="wa-template__preview-media">
            {MEDIA_FORMATS[header.format as MediaFormat]?.icon ?? "📎"}{" "}
            {values?.header_media?.filename ?? MEDIA_FORMATS[header.format as MediaFormat]?.label ?? header.format.toLowerCase()}
          </div>
        ) : (
          <div className="wa-template__preview-header">{fill(header.text, values?.header)}</div>
        ))}
      <div className="wa-template__preview-body">{fill(body?.text, values?.body)}</div>
      {footer?.text && <div className="wa-template__preview-footer">{footer.text}</div>}
      {buttons.length > 0 && (
        <div className="wa-template__preview-buttons">
          {buttons.map((button, index) => (
            <span key={index} className="wa-template__preview-button">
              {button.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type SentResult = { chat: WhatsAppChat; conversation: WhatsAppConversation; error?: string };

/**
 * The Templates screen of the WhatsApp tab: every template on the WhatsApp
 * Business Account with its review status, a form to create a new one
 * (submitted to Meta for review), and sending an approved one to a contact.
 */
export default function WhatsAppTemplates({
  chats,
  onBack,
  onSent,
}: {
  chats: WhatsAppChat[];
  onBack: () => void;
  /** After sending, with the contact it went to (the inbox opens that chat). */
  onSent: (chat: WhatsAppChat) => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The form's starting point: blank, or a copy of an existing template.
  const [creating, setCreating] = useState<{ source?: WhatsAppTemplate } | null>(null);
  const [isChoosingStart, setIsChoosingStart] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<WhatsAppTemplate | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  // Templates start collapsed (name and status only); tapping one shows the rest.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function load(force = false) {
    return fetchWhatsAppTemplates(force)
      .then((list) => {
        setTemplates(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load templates"));
  }

  useEffect(() => {
    load();
  }, []);

  if (creating) {
    return (
      <CreateTemplateForm
        source={creating.source}
        onCancel={() => setCreating(null)}
        onCreated={(name, status) => {
          setCreating(null);
          setNotice(
            status === "APPROVED"
              ? `"${name}" was approved and is ready to send.`
              : `"${name}" was submitted to WhatsApp for review. It can be sent once it's approved — usually within minutes, at most 24 hours.`,
          );
          load(true);
        }}
      />
    );
  }

  const sortedTemplates = (templates ?? []).toSorted((a, b) => statusRank(a.status) - statusRank(b.status));
  const rejectedCount = sortedTemplates.filter(isHiddenByDefault).length;
  const allTemplates = showRejected ? sortedTemplates : sortedTemplates.filter((t) => !isHiddenByDefault(t));
  const visibleTemplates = categoryFilter ? allTemplates.filter((t) => t.category === categoryFilter) : allTemplates;

  return (
    <div>
      <div className="wa-list__toolbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to chats">
          <ArrowLeft size={18} />
        </button>
        <div className="wa-templates__title">Templates</div>
        <RefreshButton onRefresh={() => load(true)} />
        <button type="button" className="btn btn--primary wa-templates__new" onClick={() => setIsChoosingStart(true)}>
          <Plus size={16} />
          New
        </button>
      </div>

      {notice && <div className="wa-templates__notice">{notice}</div>}
      {error && <div className="form-error">{error}</div>}

      {sortedTemplates.length > 0 && (
        <div className="wa-chips" role="group" aria-label="Filter by category">
          <FilterChip label="All" count={allTemplates.length} active={categoryFilter === null} onClick={() => setCategoryFilter(null)} />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.value}
              label={c.label}
              count={allTemplates.filter((t) => t.category === c.value).length}
              active={categoryFilter === c.value}
              onClick={() => setCategoryFilter(c.value)}
            />
          ))}
          {rejectedCount > 0 && (
            <button
              type="button"
              className={`wa-chip wa-chip--toggle${showRejected ? " wa-chip--active" : ""}`}
              onClick={() => setShowRejected((current) => !current)}
              aria-pressed={showRejected}
            >
              {showRejected ? "Hide rejected" : "Show rejected"}
              <span className="wa-chip__count">{rejectedCount}</span>
            </button>
          )}
        </div>
      )}

      {templates === null && !error ? (
        <div className="items-area__empty">Loading...</div>
      ) : visibleTemplates.length === 0 ? (
        <div className="items-area__empty">{categoryFilter
            ? "No templates in this category"
            : rejectedCount > 0 && !showRejected
              ? "No approved or in-review templates"
              : "No templates yet"}</div>
      ) : (
        <div className="wa-templates">
          {visibleTemplates.map((template) => {
            const reason = unsendableReason(template);
            const isExpanded = expandedIds.has(template.id);
            return (
              <div key={template.id} className={`wa-template${isExpanded ? " wa-template--expanded" : ""}`}>
                <button
                  type="button"
                  className="wa-template__summary"
                  onClick={() => toggleExpanded(template.id)}
                  aria-expanded={isExpanded}
                >
                  <ChevronRight size={16} className="wa-template__chevron" />
                  <span className="wa-template__heading">
                    <span className="wa-template__name">{displayName(template.name).title}</span>
                    <span className="wa-template__meta">
                      {template.name} · {template.category.charAt(0) + template.category.slice(1).toLowerCase()}
                    </span>
                  </span>
                  <span className="wa-template__badges">
                    {displayName(template.name).language && (
                      <span className="badge wa-template__language">{displayName(template.name).language}</span>
                    )}
                    <StatusBadge status={template.status} />
                  </span>
                </button>
                {isExpanded && (
                  <div className="wa-template__details">
                    <TemplatePreview template={template} />
                    <div className="wa-template__hint">Registered with WhatsApp as {languageLabel(template.language)} ({template.language})</div>
                    {template.status === "REJECTED" && template.rejected_reason && template.rejected_reason !== "NONE" && (
                      <div className="form-error" style={{ marginTop: 8, marginBottom: 0 }}>
                        Rejected: {template.rejected_reason.replace(/_/g, " ").toLowerCase()}
                      </div>
                    )}
                    {reason && template.status === "APPROVED" && <div className="wa-template__hint">{reason}</div>}
                    <div className="wa-template__actions">
                      <button type="button" className="btn btn--secondary wa-template__send" onClick={() => setCreating({ source: template })}>
                        <Copy size={15} />
                        Copy
                      </button>
                      {!reason && (
                        <button type="button" className="btn btn--primary wa-template__send" onClick={() => setSending(template)}>
                          <SendHorizontal size={15} />
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isChoosingStart && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={() => setIsChoosingStart(false)} />
          <div className="modal modal--wide">
            <div className="modal__title">New template</div>
            <button
              type="button"
              className="btn btn--primary btn--full"
              onClick={() => {
                setIsChoosingStart(false);
                setCreating({});
              }}
            >
              Start from blank
            </button>
            {sortedTemplates.length > 0 && (
              <div className="field" style={{ marginTop: 14 }}>
                <label className="field-label">Or start from a copy of</label>
                <div className="wa-pick-list">
                  {sortedTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="wa-pick-list__row"
                      onClick={() => {
                        setIsChoosingStart(false);
                        setCreating({ source: t });
                      }}
                    >
                      <span className="wa-pick-list__name">
                        <TemplateName name={t.name} />
                      </span>
                      <span className="wa-pick-list__sub">{STATUS_LABELS[t.status] ?? t.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button type="button" className="btn btn--secondary btn--full" style={{ marginTop: 10 }} onClick={() => setIsChoosingStart(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sending && (
        <SendTemplateModal
          template={sending}
          chats={chats}
          onClose={() => setSending(null)}
          onSent={({ chat }) => {
            setSending(null);
            onSent(chat);
          }}
        />
      )}
    </div>
  );
}

/**
 * Sends an approved template: pick the template (unless given), the contact
 * (unless given — e.g. from inside a chat), and fill in its variables.
 */
export function SendTemplateModal({
  template: fixedTemplate,
  chat: fixedChat,
  chats = [],
  onClose,
  onSent,
}: {
  template?: WhatsAppTemplate;
  chat?: WhatsAppChat;
  chats?: WhatsAppChat[];
  onClose: () => void;
  onSent: (result: SentResult) => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(fixedTemplate ? [fixedTemplate] : null);
  const [template, setTemplate] = useState<WhatsAppTemplate | null>(fixedTemplate ?? null);
  const [chat, setChat] = useState<WhatsAppChat | null>(fixedChat ?? null);
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<WhatsAppTemplateValues>({});
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaFormat = template ? mediaFormatOf(template) : undefined;

  /** File headers: uploads the picked file to WhatsApp right away, so Send only sends. */
  function handlePickFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setValues((current) => ({ ...current, header_media: undefined }));
    uploadWhatsAppTemplateMedia(file)
      .then((uploaded) => setValues((current) => ({ ...current, header_media: uploaded })))
      .catch((e) => setError(e instanceof Error ? e.message : "Upload failed"))
      .finally(() => setIsUploading(false));
  }

  useEffect(() => {
    if (fixedTemplate) return;
    fetchWhatsAppTemplates()
      .then((list) => setTemplates(list.filter((t) => !unsendableReason(t))))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load templates"));
  }, [fixedTemplate]);

  const fields = useMemo(() => {
    if (!template) return [];
    const list: { group: "header" | "body" | "buttons"; key: string; label: string }[] = [];
    for (const key of placeholdersIn(part(template, "HEADER")?.text)) list.push({ group: "header", key, label: `Header {{${key}}}` });
    for (const key of placeholdersIn(part(template, "BODY")?.text)) list.push({ group: "body", key, label: `{{${key}}}` });
    part(template, "BUTTONS")?.buttons?.forEach((button, index) => {
      if (button.type === "URL" && placeholdersIn(button.url).length)
        list.push({ group: "buttons", key: String(index), label: `"${button.text}" link (${button.url})` });
    });
    return list;
  }, [template]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchingChats = useMemo(
    () =>
      chats
        .filter(
          (c) =>
            !normalizedQuery ||
            c.name.toLowerCase().includes(normalizedQuery) ||
            c.phone.includes(normalizedQuery.replace(/\D/g, "") || normalizedQuery),
        )
        .slice(0, 30),
    [chats, normalizedQuery],
  );

  const isComplete =
    !!template && !!chat && fields.every((f) => values[f.group]?.[f.key]?.trim()) && (!mediaFormat || !!values.header_media);

  function setValue(group: "header" | "body" | "buttons", key: string, value: string) {
    setValues((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  }

  function handleSend() {
    if (!template || !chat || !isComplete) return;
    setIsSending(true);
    setError(null);
    sendWhatsAppTemplateMessage(chat.phone, template, values)
      .then((conversation) => onSent({ chat, conversation }))
      .catch((e: Error & { conversation?: WhatsAppConversation }) => {
        // Recorded as a failed message (with a retry) — the chat shows it.
        if (e.conversation) onSent({ chat, conversation: e.conversation, error: e.message });
        else setError(e.message);
      })
      .finally(() => setIsSending(false));
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={isSending ? undefined : onClose} />
      <div className="modal modal--wide">
        <div className="modal__title">{fixedChat ? `Send a template to ${fixedChat.name}` : "Send template"}</div>

        {!fixedTemplate && (
          <div className="field">
            <label className="field-label">Template</label>
            {templates === null && !error ? (
              <div className="items-area__empty">Loading...</div>
            ) : templates?.length === 0 ? (
              <div className="items-area__empty">No approved templates yet — create one under Templates.</div>
            ) : (
              <div className="wa-pick-list">
                {(templates ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`wa-pick-list__row${template?.id === t.id ? " wa-pick-list__row--active" : ""}`}
                    onClick={() => {
                      setTemplate(t);
                      setValues({});
                    }}
                  >
                    <span className="wa-pick-list__name">
                      <TemplateName name={t.name} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!fixedChat && (
          <div className="field">
            <label className="field-label">To</label>
            {chat ? (
              <div className="wa-pick-list__row wa-pick-list__row--active">
                <span className="wa-pick-list__name">{chat.name}</span>
                <span className="wa-pick-list__sub">+{chat.phone}</span>
                <button type="button" className="field-label-row__action" onClick={() => setChat(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="search-field" style={{ marginBottom: 6 }}>
                  <Search size={16} className="search-field__icon" />
                  <input
                    type="text"
                    className="input search-field__input"
                    placeholder="Search contacts"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="wa-pick-list">
                  {matchingChats.length === 0 ? (
                    <div className="items-area__empty">No matching contacts</div>
                  ) : (
                    matchingChats.map((c) => (
                      <button key={`${c.phone}-${c.customer_id ?? ""}`} type="button" className="wa-pick-list__row" onClick={() => setChat(c)}>
                        <span className="wa-pick-list__name">{c.name}</span>
                        <span className="wa-pick-list__sub">+{c.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {template && (
          <>
            {mediaFormat && (
              <div className="field">
                <label className="field-label">{MEDIA_FORMATS[mediaFormat].label} to send</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept={MEDIA_FORMATS[mediaFormat].sendAccept}
                  onChange={(e) => {
                    handlePickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn btn--dashed btn--full wa-template__file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSending}
                >
                  {values.header_media ? <FileText size={16} /> : <Paperclip size={16} />}
                  {isUploading ? "Uploading..." : (values.header_media?.filename ?? `Choose ${MEDIA_FORMATS[mediaFormat].label.toLowerCase()}`)}
                </button>
              </div>
            )}
            {fields.map((f) => (
              <div className="field" key={`${f.group}-${f.key}`}>
                <label className="field-label">{f.label}</label>
                <input
                  type="text"
                  className="input"
                  value={values[f.group]?.[f.key] ?? ""}
                  onChange={(e) => setValue(f.group, f.key, e.target.value)}
                />
              </div>
            ))}
            <div className="field">
              <label className="field-label">Preview</label>
              <TemplatePreview template={template} values={values} />
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="invoice-details__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={isSending}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSend} disabled={!isComplete || isSending || isUploading}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DraftButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value: string };

type HeaderChoice = "NONE" | WhatsAppTemplateHeaderFormat;

const HEADER_CHOICES: { value: HeaderChoice; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
  { value: "DOCUMENT", label: "Document" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
];

type Draft = {
  name: string;
  category: NewWhatsAppTemplate["category"];
  language: string;
  headerChoice: HeaderChoice;
  header: string;
  headerExample: string;
  body: string;
  bodyExamples: Record<string, string>;
  footer: string;
  buttons: DraftButton[];
};

const BLANK_DRAFT: Draft = {
  name: "",
  category: "UTILITY",
  language: "en",
  headerChoice: "NONE",
  header: "",
  headerExample: "",
  body: "",
  bodyExamples: {},
  footer: "",
  buttons: [],
};

/**
 * A new template's form, pre-filled from an existing one ("Copy"): same
 * wording, examples and buttons, under a new name. Named variables
 * ({{customer}}) become numbered ones, which is all the form creates. A file
 * header's sample has to be added again — Meta doesn't hand it back.
 */
function draftFrom(source: WhatsAppTemplate): Draft {
  const header = part(source, "HEADER");
  const body = part(source, "BODY");
  const example = (body?.example ?? {}) as { body_text?: string[][]; body_text_named_params?: { param_name: string; example: string }[] };
  const headerExample = (header?.example ?? {}) as { header_text?: string[]; header_text_named_params?: { example: string }[] };

  // Renumber the body's variables {{1}}, {{2}}, … in order of appearance.
  const keys = placeholdersIn(body?.text);
  const renumber = (text: string | undefined) =>
    (text ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key) => {
      const index = keys.indexOf(key);
      return index === -1 ? whole : `{{${index + 1}}}`;
    });
  const bodyExamples: Record<string, string> = {};
  keys.forEach((key, index) => {
    const value =
      example.body_text?.[0]?.[Number(key) - 1] ?? example.body_text_named_params?.find((p) => p.param_name === key)?.example ?? "";
    bodyExamples[String(index + 1)] = value;
  });
  const headerKeys = placeholdersIn(header?.text);

  return {
    name: `${source.name}_copy`.slice(0, 512),
    category: source.category === "MARKETING" ? "MARKETING" : "UTILITY",
    language: source.language,
    headerChoice: !header
      ? "NONE"
      : !header.format || header.format === "TEXT"
        ? "TEXT"
        : header.format in MEDIA_FORMATS
          ? (header.format as HeaderChoice)
          : "NONE",
    header: headerKeys.length ? (header?.text ?? "").replace(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/, "{{1}}") : (header?.text ?? ""),
    headerExample: headerExample.header_text?.[0] ?? headerExample.header_text_named_params?.[0]?.example ?? "",
    body: renumber(body?.text),
    bodyExamples,
    footer: part(source, "FOOTER")?.text ?? "",
    buttons: (part(source, "BUTTONS")?.buttons ?? [])
      .filter((b) => b.type === "QUICK_REPLY" || b.type === "URL" || b.type === "PHONE_NUMBER")
      .map((b) => ({ type: b.type as DraftButton["type"], text: b.text, value: b.type === "URL" ? (b.url ?? "") : (b.phone_number ?? "") })),
  };
}

/** Form for a new template (blank, or a copy of `source`); WhatsApp reviews it before it can be sent. */
function CreateTemplateForm({
  source,
  onCancel,
  onCreated,
}: {
  source?: WhatsAppTemplate;
  onCancel: () => void;
  onCreated: (name: string, status: string) => void;
}) {
  const [initial] = useState<Draft>(() => (source ? draftFrom(source) : BLANK_DRAFT));
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<NewWhatsAppTemplate["category"]>(initial.category);
  const [language, setLanguage] = useState(initial.language);
  const [headerChoice, setHeaderChoice] = useState<HeaderChoice>(initial.headerChoice);
  const [header, setHeader] = useState(initial.header);
  const [headerExample, setHeaderExample] = useState(initial.headerExample);
  // File headers: the sample file uploaded for review.
  const [sample, setSample] = useState<{ handle: string; filename: string } | null>(null);
  const [isUploadingSample, setIsUploadingSample] = useState(false);
  const [body, setBody] = useState(initial.body);
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>(initial.bodyExamples);
  const [footer, setFooter] = useState(initial.footer);
  const [buttons, setButtons] = useState<DraftButton[]>(initial.buttons);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const mediaChoice = headerChoice in MEDIA_FORMATS ? (headerChoice as MediaFormat) : undefined;

  function chooseHeader(choice: HeaderChoice) {
    setHeaderChoice(choice);
    setSample(null);
  }

  function handlePickSample(file: File | undefined) {
    if (!file || !mediaChoice) return;
    setIsUploadingSample(true);
    setError(null);
    setSample(null);
    uploadWhatsAppTemplateSample(mediaChoice, file)
      .then((handle) => setSample({ handle, filename: file.name }))
      .catch((e) => setError(e instanceof Error ? e.message : "Upload failed"))
      .finally(() => setIsUploadingSample(false));
  }

  const bodyVariables = placeholdersIn(body);
  const headerHasVariable = headerChoice === "TEXT" && placeholdersIn(header).length > 0;

  /** Inserts the next numbered variable at the cursor. */
  function addVariable() {
    const next = `{{${bodyVariables.length + 1}}}`;
    const input = bodyRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + next + body.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + next.length, start + next.length);
    });
  }

  function updateButton(index: number, patch: Partial<DraftButton>) {
    setButtons((current) => current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    const template: NewWhatsAppTemplate = {
      name,
      category,
      language,
      ...(headerChoice === "TEXT" && header.trim() && { header_format: "TEXT", header: header.trim() }),
      ...(headerHasVariable && { header_example: headerExample }),
      ...(mediaChoice && { header_format: mediaChoice, header_handle: sample?.handle }),
      body: body.trim(),
      body_examples: bodyVariables.map((key) => bodyExamples[key] ?? ""),
      ...(footer.trim() && { footer: footer.trim() }),
      buttons: buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text, url: b.value }
          : b.type === "PHONE_NUMBER"
            ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.value }
            : { type: "QUICK_REPLY", text: b.text },
      ),
    };
    createWhatsAppTemplate(template)
      .then((created) => onCreated(name, created.status))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to create template"))
      .finally(() => setIsSubmitting(false));
  }

  return (
    <div>
      <div className="wa-list__toolbar">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back to templates">
          <ArrowLeft size={18} />
        </button>
        <div className="wa-templates__title">{source ? `Copy of ${displayName(source.name).title}` : "New template"}</div>
      </div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        WhatsApp reviews every new template before it can be sent.
      </p>

      <div className="field">
        <label className="field-label" htmlFor="tpl-name">
          Name
        </label>
        <input
          id="tpl-name"
          type="text"
          className="input"
          placeholder="e.g. order_ready"
          value={name}
          // Meta only accepts lowercase letters, numbers and underscores.
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
        />
      </div>

      <div className="field">
        <label className="field-label">Category</label>
        <div className="mode-toggle" style={{ marginBottom: 4 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`mode-toggle__option${category === c.value ? " mode-toggle__option--active" : ""}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="wa-template__hint">{CATEGORIES.find((c) => c.value === category)?.hint}</div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="tpl-language">
          Language
        </label>
        <div className="select-wrap">
          <select id="tpl-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.code})
              </option>
            ))}
          </select>
          <ChevronDown className="select-wrap__chevron" size={18} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Header</label>
        <div className="wa-chips wa-chips--wrap" role="group" aria-label="Header type">
          {HEADER_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className={`wa-chip${headerChoice === choice.value ? " wa-chip--active" : ""}`}
              aria-pressed={headerChoice === choice.value}
              onClick={() => chooseHeader(choice.value)}
            >
              {choice.value in MEDIA_FORMATS && `${MEDIA_FORMATS[choice.value as MediaFormat].icon} `}
              {choice.label}
            </button>
          ))}
        </div>
        {headerChoice === "TEXT" && (
          <input
            id="tpl-header"
            type="text"
            className="input"
            maxLength={60}
            placeholder="Bold first line, up to 60 characters"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
        )}
        {mediaChoice && (
          <>
            <div className="wa-template__hint" style={{ marginTop: 0, marginBottom: 6 }}>
              Every message from this template carries a {MEDIA_FORMATS[mediaChoice].label.toLowerCase()}, chosen when you send it. WhatsApp's
              review needs a sample — {MEDIA_FORMATS[mediaChoice].sampleHint}.
            </div>
            <input
              ref={sampleInputRef}
              type="file"
              hidden
              accept={MEDIA_FORMATS[mediaChoice].sampleAccept}
              onChange={(e) => {
                handlePickSample(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn--dashed btn--full wa-template__file-btn"
              onClick={() => sampleInputRef.current?.click()}
              disabled={isUploadingSample || isSubmitting}
            >
              {sample ? <FileText size={16} /> : <Paperclip size={16} />}
              {isUploadingSample ? "Uploading..." : (sample?.filename ?? "Choose sample file")}
            </button>
          </>
        )}
        {headerHasVariable && (
          <input
            type="text"
            className="input"
            style={{ marginTop: 6 }}
            placeholder="Example value for the header's {{1}}"
            value={headerExample}
            onChange={(e) => setHeaderExample(e.target.value)}
          />
        )}
      </div>

      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="tpl-body">
            Message
          </label>
          <button type="button" className="field-label-row__action" onClick={addVariable}>
            + Add variable
          </button>
        </div>
        <textarea
          id="tpl-body"
          ref={bodyRef}
          className="textarea"
          rows={5}
          maxLength={1024}
          placeholder={"e.g. Hello {{1}}, your order {{2}} is ready for pickup."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="wa-template__hint">
          Variables like {"{{1}}"} are filled in each time you send. WhatsApp needs an example value for each.
        </div>
      </div>

      {bodyVariables.map((key) => (
        <div className="field" key={key}>
          <label className="field-label">Example for {`{{${key}}}`}</label>
          <input
            type="text"
            className="input"
            value={bodyExamples[key] ?? ""}
            onChange={(e) => setBodyExamples((current) => ({ ...current, [key]: e.target.value }))}
          />
        </div>
      ))}

      <div className="field">
        <label className="field-label" htmlFor="tpl-footer">
          Footer (optional)
        </label>
        <input
          id="tpl-footer"
          type="text"
          className="input"
          maxLength={60}
          placeholder="Small grey text, up to 60 characters"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">Buttons (optional)</label>
        {buttons.map((button, index) => (
          <div key={index} className="wa-template__button-row">
            <select
              className="select"
              value={button.type}
              onChange={(e) => updateButton(index, { type: e.target.value as DraftButton["type"], value: "" })}
            >
              <option value="QUICK_REPLY">Quick reply</option>
              <option value="URL">Website</option>
              <option value="PHONE_NUMBER">Call</option>
            </select>
            <input
              type="text"
              className="input"
              maxLength={25}
              placeholder="Label"
              value={button.text}
              onChange={(e) => updateButton(index, { text: e.target.value })}
            />
            {button.type !== "QUICK_REPLY" && (
              <input
                type={button.type === "URL" ? "url" : "tel"}
                className="input wa-template__button-value"
                placeholder={button.type === "URL" ? "https://…" : "+251…"}
                value={button.value}
                onChange={(e) => updateButton(index, { value: e.target.value })}
              />
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove button"
              onClick={() => setButtons((current) => current.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {buttons.length < 10 && (
          <button
            type="button"
            className="btn btn--dashed btn--full"
            onClick={() => setButtons((current) => [...current, { type: "QUICK_REPLY", text: "", value: "" }])}
          >
            + Add button
          </button>
        )}
      </div>

      {body.trim() && (
        <div className="field">
          <label className="field-label">Preview</label>
          <TemplatePreview
            template={{
              id: "draft",
              name,
              language,
              status: "DRAFT",
              category,
              components: [
                ...(headerChoice === "TEXT" && header.trim() ? [{ type: "HEADER" as const, format: "TEXT", text: header }] : []),
                ...(mediaChoice ? [{ type: "HEADER" as const, format: mediaChoice }] : []),
                { type: "BODY" as const, text: body },
                ...(footer.trim() ? [{ type: "FOOTER" as const, text: footer }] : []),
                ...(buttons.length ? [{ type: "BUTTONS" as const, buttons: buttons.map((b) => ({ type: b.type, text: b.text || "Button" })) }] : []),
              ],
            }}
            values={{ header: { 1: headerExample }, body: bodyExamples, ...(sample && { header_media: { id: "", filename: sample.filename } }) }}
          />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="invoice-details__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={isSubmitting || isUploadingSample || !name || !body.trim() || (!!mediaChoice && !sample)}
        >
          {isSubmitting ? "Submitting..." : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
