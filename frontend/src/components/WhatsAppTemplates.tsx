import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Search, SendHorizontal, Trash2 } from "lucide-react";
import {
  createWhatsAppTemplate,
  fetchWhatsAppTemplates,
  sendWhatsAppTemplateMessage,
  type NewWhatsAppTemplate,
  type WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppTemplate,
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

function part(template: WhatsAppTemplate, type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS") {
  return template.components.find((c) => c.type === type);
}

/** Why a template can't be sent from the app, if it can't. */
function unsendableReason(template: WhatsAppTemplate): string | undefined {
  if (template.status !== "APPROVED") return `${STATUS_LABELS[template.status] ?? template.status} — only approved templates can be sent`;
  const header = part(template, "HEADER");
  if (header?.format && header.format !== "TEXT") return `Has a ${header.format.toLowerCase()} header — sent by the app automatically, not from here`;
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
          <div className="wa-template__preview-media">[{header.format.toLowerCase()}]</div>
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
  const [isCreating, setIsCreating] = useState(false);
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

  if (isCreating) {
    return (
      <CreateTemplateForm
        onCancel={() => setIsCreating(false)}
        onCreated={(name, status) => {
          setIsCreating(false);
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
        <button type="button" className="btn btn--primary wa-templates__new" onClick={() => setIsCreating(true)}>
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
                    <span className="wa-template__name">{template.name}</span>
                    <span className="wa-template__meta">
                      {languageLabel(template.language)} · {template.category.charAt(0) + template.category.slice(1).toLowerCase()}
                    </span>
                  </span>
                  <StatusBadge status={template.status} />
                </button>
                {isExpanded && (
                  <div className="wa-template__details">
                    <TemplatePreview template={template} />
                    {template.status === "REJECTED" && template.rejected_reason && template.rejected_reason !== "NONE" && (
                      <div className="form-error" style={{ marginTop: 8, marginBottom: 0 }}>
                        Rejected: {template.rejected_reason.replace(/_/g, " ").toLowerCase()}
                      </div>
                    )}
                    {reason ? (
                      template.status === "APPROVED" && <div className="wa-template__hint">{reason}</div>
                    ) : (
                      <button type="button" className="btn btn--secondary wa-template__send" onClick={() => setSending(template)}>
                        <SendHorizontal size={15} />
                        Send
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
  const [error, setError] = useState<string | null>(null);

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

  const isComplete = !!template && !!chat && fields.every((f) => values[f.group]?.[f.key]?.trim());

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
                    <span className="wa-pick-list__name">{t.name}</span>
                    <span className="wa-pick-list__sub">{languageLabel(t.language)}</span>
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
          <button type="button" className="btn btn--primary" onClick={handleSend} disabled={!isComplete || isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DraftButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value: string };

/** Form for a new template; WhatsApp reviews it before it can be sent. */
function CreateTemplateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (name: string, status: string) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<NewWhatsAppTemplate["category"]>("UTILITY");
  const [language, setLanguage] = useState("en");
  const [header, setHeader] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<DraftButton[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyVariables = placeholdersIn(body);
  const headerHasVariable = placeholdersIn(header).length > 0;

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
      ...(header.trim() && { header: header.trim() }),
      ...(headerHasVariable && { header_example: headerExample }),
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
        <div className="wa-templates__title">New template</div>
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
        <label className="field-label" htmlFor="tpl-header">
          Header (optional)
        </label>
        <input
          id="tpl-header"
          type="text"
          className="input"
          maxLength={60}
          placeholder="Bold first line, up to 60 characters"
          value={header}
          onChange={(e) => setHeader(e.target.value)}
        />
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
                ...(header.trim() ? [{ type: "HEADER" as const, format: "TEXT", text: header }] : []),
                { type: "BODY" as const, text: body },
                ...(footer.trim() ? [{ type: "FOOTER" as const, text: footer }] : []),
                ...(buttons.length ? [{ type: "BUTTONS" as const, buttons: buttons.map((b) => ({ type: b.type, text: b.text || "Button" })) }] : []),
              ],
            }}
            values={{ header: { 1: headerExample }, body: bodyExamples }}
          />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="invoice-details__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={isSubmitting || !name || !body.trim()}>
          {isSubmitting ? "Submitting..." : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
