import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import RefreshButton from "./RefreshButton";
import { fetchItemCategorySettings, saveItemCategoryOrder, type ItemCategorySettings } from "../lib/api";

/** The saved order first, then catalog categories it doesn't mention yet, alphabetically. */
function initialList(settings: ItemCategorySettings): string[] {
  const listed = new Set(settings.order);
  return [...settings.order, ...settings.categories.filter((name) => !listed.has(name))];
}

/**
 * Settings section for category priority: the order categories appear in
 * the add-item sheet and under each day on the Items tab, top first. Categories come from
 * the Zoho Inventory item catalog; ones added later go to the bottom until
 * they're placed.
 */
export default function CategoryOrderSettings() {
  const [settings, setSettings] = useState<ItemCategorySettings | null>(null);
  const [list, setList] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function load(force = false) {
    return fetchItemCategorySettings({ force })
      .then((loaded) => {
        setLoadError(null);
        setSettings(loaded);
        setList(initialList(loaded));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load categories"));
  }

  useEffect(() => {
    load();
  }, []);

  const isDirty = settings !== null && list.join("\n") !== initialList(settings).join("\n");

  function move(index: number, offset: -1 | 1) {
    setSavedAt(null);
    setList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(index + offset, 0, moved);
      return next;
    });
  }

  function save() {
    setIsSaving(true);
    setSaveError(null);
    saveItemCategoryOrder(list)
      .then((order) => {
        const saved = settings ? { ...settings, order } : { order, categories: [] };
        setSettings(saved);
        setList(initialList(saved));
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save category order"))
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="page-header">
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Item category priority
        </h2>
        <RefreshButton onRefresh={() => load(true)} />
      </div>
      <p className="page-subtitle">The order categories appear in when adding items to an invoice and on the Items tab, top first.</p>

      {loadError && <div className="form-error">{loadError}</div>}

      {!settings && !loadError && <div className="items-area__empty">Loading…</div>}

      {settings && list.length === 0 && (
        <div className="items-area__empty">No categories on your Zoho Inventory items yet</div>
      )}

      {settings && list.length > 0 && (
        <div className="settings-group" style={{ paddingBottom: 14 }}>
          <ol className="category-order">
            {list.map((name, index) => (
              <li key={name} className="category-order__row">
                <span className="category-order__rank">{index + 1}</span>
                <span className="category-order__name">{name}</span>
                {!settings.categories.includes(name) && (
                  <span className="category-order__unused" title="No catalog item uses this category">
                    unused
                  </span>
                )}
                <span className="category-order__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${name} up`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(index, 1)}
                    disabled={index === list.length - 1}
                    aria-label={`Move ${name} down`}
                  >
                    <ArrowDown size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ol>

          {saveError && <div className="form-error">{saveError}</div>}
          {savedAt && !isDirty && <div className="settings-saved">Saved</div>}

          <button
            type="button"
            className="btn btn--primary btn--full"
            disabled={!isDirty || isSaving}
            onClick={save}
          >
            {isSaving ? "Saving..." : "Save order"}
          </button>
        </div>
      )}
    </>
  );
}
