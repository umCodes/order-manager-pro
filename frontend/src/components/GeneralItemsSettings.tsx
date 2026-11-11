import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchGeneralItemIds, fetchItems, saveGeneralItemIds } from "../lib/api";
import type { CatalogItem } from "../types";

/**
 * Settings → General items: up to three catalog items for things sold now
 * and then outside the usual range. When one is added to an invoice, its
 * unit (normally pieces) can be changed for that line.
 */
export default function GeneralItemsSettings() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [max, setMax] = useState(3);
  const [slots, setSlots] = useState<string[]>(["", "", ""]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function apply(ids: string[], slotCount: number) {
    setSaved(ids);
    setSlots(Array.from({ length: slotCount }, (_, i) => ids[i] ?? ""));
  }

  useEffect(() => {
    Promise.all([fetchGeneralItemIds(), fetchItems()])
      .then(([loaded, items]) => {
        setCatalog([...items].sort((a, b) => a.name.localeCompare(b.name)));
        setMax(loaded.max);
        apply(loaded.item_ids, loaded.max);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the general items"));
  }, []);

  const chosen = slots.filter(Boolean);
  const isDirty = saved !== null && chosen.join(",") !== saved.join(",");

  function save() {
    setIsSaving(true);
    setSaveError(null);
    saveGeneralItemIds(chosen)
      .then((ids) => {
        apply(ids, max);
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="page-header">
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Which items
        </h2>
      </div>
      <p className="page-subtitle">
        Up to {max} items for things you sell now and then. Each can be added to an invoice several times, one line per thing, and its unit changed for that line.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {!saved && !loadError && <div className="items-area__empty">Loading…</div>}

      {saved && (
        <div className="settings-group">
          {slots.map((value, index) => (
            <div key={index} className="field">
              <label className="field-label" htmlFor={`general-item-${index}`}>
                General item {index + 1}
              </label>
              <div className="select-wrap">
                <select
                  id={`general-item-${index}`}
                  className="select"
                  value={value}
                  onChange={(e) => {
                    setSavedAt(null);
                    setSlots((current) => current.map((v, i) => (i === index ? e.target.value : v)));
                  }}
                >
                  <option value="">None</option>
                  {value && !catalog.some((item) => item.item_id === value) && <option value={value}>Unavailable item</option>}
                  {catalog.map((item) => (
                    <option
                      key={item.item_id}
                      value={item.item_id}
                      disabled={item.item_id !== value && slots.includes(item.item_id)}
                    >
                      {item.name}
                      {item.unit ? ` (${item.unit})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="select-wrap__chevron" size={16} />
              </div>
            </div>
          ))}

          {saveError && <div className="form-error">{saveError}</div>}
          {savedAt && !isDirty && <div className="settings-saved">Saved</div>}
          <button type="button" className="btn btn--primary btn--full" disabled={!isDirty || isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </>
  );
}
