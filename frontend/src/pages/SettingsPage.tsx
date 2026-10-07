import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import {
  assignActionTemplate,
  clearActionTemplate,
  fetchActionTemplates,
  fetchWhatsAppTemplates,
  type ActionTemplateMapping,
  type ActionTemplateSettings,
  type ActionValueSource,
  type WhatsAppTemplate,
} from "../lib/api";
import { displayName, part, placeholdersIn } from "../lib/templateUtils";
import { TemplatePreview } from "../components/WhatsAppTemplates";
import RefreshButton from "../components/RefreshButton";

const CUSTOMER_LANGUAGES: Record<string, string> = { am: "Amharic", ar: "Arabic", en: "English" };

type Action = ActionTemplateSettings["actions"][number];

/**
 * App settings. For now: which WhatsApp template each automatic action
 * sends, per customer preferred language, and which of the action's values
 * fills each of the template's variables. Saved on the server (Redis).
 */
export default function SettingsPage({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<ActionTemplateSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ actionKey: string; language: string } | null>(null);

  function load() {
    return fetchActionTemplates()
      .then((result) => {
        setSettings(result);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"));
  }

  useEffect(() => {
    load();
  }, []);

  const editingAction = editing && settings?.actions.find((a) => a.key === editing.actionKey);
  if (editing && editingAction) {
    return (
      <AssignTemplate
        action={editingAction}
        language={editing.language}
        onBack={() => setEditing(null)}
        onSaved={(result) => {
          setSettings(result);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="wa-list__toolbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="wa-templates__title">Settings</div>
        <RefreshButton onRefresh={load} />
      </div>

      <div className="settings-section__title">WhatsApp templates</div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        The template the app sends on its own for each action, per customer's preferred language.
      </p>

      {error && <div className="form-error">{error}</div>}
      {settings === null && !error && <div className="items-area__empty">Loading...</div>}

      {settings?.actions.map((action) => (
        <div key={action.key} className="wa-notification">
          <div className="wa-notification__title">{action.label}</div>
          <div className="wa-template__hint" style={{ marginTop: 0 }}>
            {action.description}
          </div>
          <div className="settings-slots">
            {settings.languages.map((language) => {
              const assigned = action.assignments[language];
              return (
                <button
                  key={language}
                  type="button"
                  className="settings-slot"
                  onClick={() => setEditing({ actionKey: action.key, language })}
                >
                  <span className="settings-slot__language">{CUSTOMER_LANGUAGES[language] ?? language} customers</span>
                  <span className="settings-slot__value">
                    {assigned ? (
                      <>
                        <span className="settings-slot__name">{displayName(assigned.name).title}</span>
                        {assigned.source === "env" && <span className="badge settings-slot__badge">server env</span>}
                      </>
                    ) : (
                      <span className="settings-slot__unset">Not assigned</span>
                    )}
                  </span>
                  <ChevronRight size={16} className="settings-slot__chevron" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type Variable = { group: "header" | "body" | "buttons"; key: string; label: string };

/** Every variable a template needs filled: header text, message, and button links. */
function variablesOf(template: WhatsAppTemplate): Variable[] {
  const list: Variable[] = [];
  for (const key of placeholdersIn(part(template, "HEADER")?.text)) list.push({ group: "header", key, label: `Header {{${key}}}` });
  for (const key of placeholdersIn(part(template, "BODY")?.text)) list.push({ group: "body", key, label: `{{${key}}}` });
  part(template, "BUTTONS")?.buttons?.forEach((button, index) => {
    if (button.type === "URL" && placeholdersIn(button.url).length)
      list.push({ group: "buttons", key: String(index), label: `"${button.text}" link` });
  });
  return list;
}

const CUSTOM = "__custom__";

/**
 * Assigns a template to one action + customer language: pick the template,
 * then say what fills each of its variables — one of the action's values,
 * or fixed text — with a live preview using example values.
 */
function AssignTemplate({
  action,
  language,
  onBack,
  onSaved,
}: {
  action: Action;
  language: string;
  onBack: () => void;
  onSaved: (settings: ActionTemplateSettings) => void;
}) {
  const current = action.assignments[language];
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ name: string; language: string } | null>(current ? { name: current.name, language: current.language } : null);
  const [mapping, setMapping] = useState<ActionTemplateMapping>(current?.mapping ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWhatsAppTemplates(true)
      .then((list) => setTemplates(list.filter((t) => t.status !== "REJECTED" && t.status !== "DISABLED")))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load templates"));
  }, []);

  const template = templates?.find((t) => t.name === selected?.name && t.language === selected?.language);
  const variables = useMemo(() => (template ? variablesOf(template) : []), [template]);
  const headerFormat = template ? part(template, "HEADER")?.format : undefined;
  const fileHeader = headerFormat && headerFormat !== "TEXT" ? headerFormat : undefined;
  const fileOptions = action.media.filter((m) => m.format === fileHeader);

  function chooseTemplate(value: string) {
    const [name, templateLanguage] = value.split("|");
    setSelected(name ? { name, language: templateLanguage } : null);
    // Keep the saved mapping only when coming back to the saved template.
    setMapping(current && current.name === name && current.language === templateLanguage ? current.mapping : {});
    setError(null);
  }

  function setSource(variable: Variable, source: ActionValueSource | undefined) {
    setMapping((m) => {
      const group = { ...(m[variable.group] ?? {}) };
      if (source) group[variable.key] = source;
      else delete group[variable.key];
      return { ...m, [variable.group]: group };
    });
  }

  const example = (source: ActionValueSource | undefined) =>
    !source ? undefined : "field" in source ? action.fields.find((f) => f.key === source.field)?.example : source.text;
  const previewValues = (group: Variable["group"]) =>
    Object.fromEntries(variables.filter((v) => v.group === group).map((v) => [v.key, example(mapping[group]?.[v.key]) ?? ""]));

  const isComplete =
    !!template &&
    variables.every((v) => {
      const source = mapping[v.group]?.[v.key];
      return source && ("field" in source ? !!source.field : !!source.text.trim());
    }) &&
    (!fileHeader || !!mapping.header_media);

  function handleSave() {
    if (!template || !isComplete) return;
    setIsSaving(true);
    setError(null);
    // Only what this template uses.
    const clean: ActionTemplateMapping = {};
    for (const v of variables) clean[v.group] = { ...(clean[v.group] ?? {}), [v.key]: mapping[v.group]![v.key] };
    if (fileHeader) clean.header_media = mapping.header_media;
    assignActionTemplate(action.key, language, { name: template.name, language: template.language, mapping: clean })
      .then(onSaved)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setIsSaving(false));
  }

  function handleRemove() {
    setIsSaving(true);
    setError(null);
    clearActionTemplate(action.key, language)
      .then(onSaved)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to remove"))
      .finally(() => setIsSaving(false));
  }

  return (
    <div>
      <div className="wa-list__toolbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to settings">
          <ArrowLeft size={18} />
        </button>
        <div className="wa-templates__title">{action.label}</div>
      </div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        For {CUSTOMER_LANGUAGES[language] ?? language} customers. {action.description}
      </p>
      {current?.source === "env" && (
        <div className="wa-templates__notice">Currently set by the server's env var. Saving here replaces it.</div>
      )}

      {loadError && <div className="form-error">{loadError}</div>}
      {templates === null && !loadError && <div className="items-area__empty">Loading templates...</div>}

      {templates && (
        <div className="field">
          <label className="field-label" htmlFor="assign-template">
            Template
          </label>
          <div className="select-wrap">
            <select
              id="assign-template"
              className="select"
              value={selected ? `${selected.name}|${selected.language}` : ""}
              onChange={(e) => chooseTemplate(e.target.value)}
            >
              <option value="">Choose a template</option>
              {selected && !template && <option value={`${selected.name}|${selected.language}`}>{selected.name} (not found)</option>}
              {templates.map((t) => {
                const { title, language: textLanguage } = displayName(t.name);
                return (
                  <option key={t.id} value={`${t.name}|${t.language}`}>
                    {`${title}${textLanguage ? ` (${textLanguage})` : ""}${t.status === "APPROVED" ? "" : " — in review"}`}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="select-wrap__chevron" size={18} />
          </div>
          {template && (
            <div className="wa-template__hint">
              {template.name} · registered with WhatsApp as {template.language}
            </div>
          )}
        </div>
      )}

      {template && (
        <>
          {fileHeader && (
            <div className="field">
              <label className="field-label">Header file</label>
              {fileOptions.length === 0 ? (
                <div className="form-error">
                  This template has a {fileHeader.toLowerCase()} header, and "{action.label}" has no file to put there. Choose another template.
                </div>
              ) : (
                <div className="select-wrap">
                  <select
                    className="select"
                    value={mapping.header_media ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, header_media: e.target.value || undefined }))}
                  >
                    <option value="">Choose a file</option>
                    {fileOptions.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="select-wrap__chevron" size={18} />
                </div>
              )}
            </div>
          )}

          {variables.length > 0 && <div className="settings-section__title">Fill the variables with</div>}
          {variables.map((v) => {
            const source = mapping[v.group]?.[v.key];
            const value = !source ? "" : "field" in source ? source.field : CUSTOM;
            return (
              <div className="field" key={`${v.group}-${v.key}`}>
                <label className="field-label">{v.label}</label>
                <div className="select-wrap">
                  <select
                    className="select"
                    value={value}
                    onChange={(e) =>
                      setSource(v, e.target.value === CUSTOM ? { text: "" } : e.target.value ? { field: e.target.value } : undefined)
                    }
                  >
                    <option value="">Choose a value</option>
                    {action.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                    <option value={CUSTOM}>Fixed text…</option>
                  </select>
                  <ChevronDown className="select-wrap__chevron" size={18} />
                </div>
                {source && "text" in source && (
                  <input
                    type="text"
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="Text to always send here"
                    value={source.text}
                    onChange={(e) => setSource(v, { text: e.target.value })}
                  />
                )}
              </div>
            );
          })}

          <div className="field">
            <label className="field-label">Preview (example values)</label>
            <TemplatePreview
              template={template}
              values={{
                header: previewValues("header"),
                body: previewValues("body"),
                ...(mapping.header_media && { header_media: { id: "", filename: "INV-000123.pdf" } }),
              }}
            />
          </div>
        </>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="invoice-details__actions">
        {current?.source === "settings" ? (
          <button type="button" className="btn btn--secondary" onClick={handleRemove} disabled={isSaving}>
            Remove
          </button>
        ) : (
          <button type="button" className="btn btn--secondary" onClick={onBack} disabled={isSaving}>
            Cancel
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!isComplete || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
