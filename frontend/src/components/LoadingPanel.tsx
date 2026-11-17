import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { confirmOrderLoading, fetchOrderLoading, undoOrderLoading } from "../lib/api";
import { reportTime } from "../lib/shortages";
import ConfirmModal from "./ConfirmModal";
import type { LoadedItem, LoadingItem, OrderLoadingView } from "../types";

const amount = (value: number, unit: string) => `${value} ${unit}`.trim();

/**
 * How a loaded item compares with the order and with what the preparers
 * reported: "missing" (none received) or "partial" (some), and whether the
 * driver's count disagrees with the preparers' — they didn't report
 * something that wasn't there, or reported short what was there.
 */
function compare(item: LoadedItem) {
  const state = item.received >= item.ordered ? "complete" : item.received > 0 ? "partial" : "missing";
  const mismatch =
    item.received < item.reported
      ? "Not reported by the preparers"
      : item.received > item.reported
        ? "Reported short, but received"
        : null;
  return { state, mismatch };
}

/**
 * The driver's loading of an order (a draft invoice or a backup list): one
 * tap "Loaded as reported", or "Check items" to enter what was received of
 * each. Once loaded: when, what wasn't received, where it differs from the
 * preparers' reports, and Change / Undo. Confirming marks the order's
 * Telegram group messages (🚚 ተጭኗል, received items struck through, the rest
 * with what came and 🟡/🔴); nothing changes in Zoho, and the preparers'
 * status stays as it is. Shows nothing for an order not in the group.
 */
export default function LoadingPanel({
  orderId,
  orderLabel,
  reloadToken,
  onChanged,
}: {
  orderId: string;
  /** INV-… or the BK- id, for the confirms. */
  orderLabel: string;
  /** Re-read whenever this changes (e.g. the invoice was reloaded). */
  reloadToken?: unknown;
  onChanged?: () => void;
}) {
  const [view, setView] = useState<OrderLoadingView | null>(null);
  const [confirming, setConfirming] = useState<"as_reported" | "undo" | null>(null);
  const [checking, setChecking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrderLoading(orderId)
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId, reloadToken]);

  if (!view || view.items.length === 0) return null;
  const { loading } = view;

  async function run(action: () => Promise<OrderLoadingView>) {
    setIsBusy(true);
    setError(null);
    try {
      setView(await action());
      setConfirming(null);
      setChecking(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsBusy(false);
    }
  }

  const notes = (loading?.items ?? [])
    .map((item) => ({ item, ...compare(item) }))
    .filter(({ state, mismatch }) => state !== "complete" || mismatch);
  const failed = view.telegram?.failed.length ?? 0;

  return (
    <div className={`loading-panel${loading ? " loading-panel--loaded" : ""}`}>
      <div className="loading-panel__header">
        <span className="loading-panel__title">
          <Truck size={15} />
          {loading ? (
            <>
              {view.complete === false ? `Loading ${loading.items.length}/${view.items.length}` : "Loaded"}{" "}
              <span className="loading-panel__when">{reportTime(loading.at)}</span>
              <span className="loading-panel__mode">{loading.mode === "as_reported" ? "as reported" : "checked"}</span>
            </>
          ) : (
            "Not loaded"
          )}
        </span>
        <span className="loading-panel__actions">
          {loading ? (
            <>
              <button type="button" className="link-btn" disabled={isBusy} onClick={() => setChecking(true)}>
                Change
              </button>
              <button
                type="button"
                className="link-btn loading-panel__undo"
                disabled={isBusy}
                onClick={() => {
                  setError(null);
                  setConfirming("undo");
                }}
              >
                Undo
              </button>
            </>
          ) : null}
        </span>
      </div>

      {!loading && (
        <div className="loading-panel__buttons">
          <button
            type="button"
            className="btn btn--primary"
            disabled={isBusy}
            onClick={() => {
              setError(null);
              setConfirming("as_reported");
            }}
          >
            Loaded as reported
          </button>
          <button type="button" className="btn btn--secondary" disabled={isBusy} onClick={() => setChecking(true)}>
            Check items
          </button>
        </div>
      )}

      {loading && notes.length === 0 && <div className="loading-panel__ok">Everything received</div>}
      {notes.map(({ item, state, mismatch }) => (
        <div key={item.item_key} className={`loading-note loading-note--${state === "complete" ? "extra" : state}`}>
          <span className="loading-note__item">
            {item.number}. {item.description}
          </span>
          <span className="loading-note__amount">
            {state === "missing" ? "Not received" : `Got ${item.received}/${amount(item.ordered, item.unit)}`}
          </span>
          {mismatch && (
            <span className="loading-note__mismatch">
              {mismatch}
              {item.reported < item.ordered && ` (said ${amount(item.reported, item.unit)})`}
            </span>
          )}
        </div>
      ))}

      {loading && view.changed_since.length > 0 && (
        <div className="loading-panel__warning">The order changed after loading. Check the items again.</div>
      )}
      {failed > 0 && (
        <div className="loading-panel__warning">
          Saved, but {failed} Telegram message{failed === 1 ? "" : "s"} couldn't be updated.
        </div>
      )}
      {error && !confirming && !checking && <div className="form-error">{error}</div>}

      {confirming && (
        <ConfirmModal
          title={confirming === "undo" ? `Undo loading of ${orderLabel}?` : `${orderLabel} loaded as reported?`}
          message={
            confirming === "undo"
              ? "The 🚚 marks come off its Telegram messages. The preparers' reports stay as they are."
              : "Every item as the preparers reported it. Its Telegram messages get 🚚 ተጭኗል, received items struck through. Nothing changes in Zoho."
          }
          confirmLabel={confirming === "undo" ? "Undo" : "Loaded"}
          error={error}
          isConfirming={isBusy}
          onConfirm={() =>
            run(() => (confirming === "undo" ? undoOrderLoading(orderId) : confirmOrderLoading(orderId, "as_reported")))
          }
          onCancel={() => setConfirming(null)}
        />
      )}

      {checking && (
        <CheckItemsModal
          orderLabel={orderLabel}
          items={view.items}
          loaded={loading?.items ?? null}
          error={error}
          isSaving={isBusy}
          onCancel={() => setChecking(false)}
          onSave={(received) => run(() => confirmOrderLoading(orderId, "checked", received))}
        />
      )}
    </div>
  );
}

/**
 * What was received of each item, filled in with the earlier count (when
 * changing a loading) or what the preparers reported available, with
 * "All" / "None" shortcuts.
 */
function CheckItemsModal({
  orderLabel,
  items,
  loaded,
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  orderLabel: string;
  items: LoadingItem[];
  loaded: LoadedItem[] | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (received: Record<string, number>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const before = new Map((loaded ?? []).map((item) => [item.item_key, item.received]));
    return Object.fromEntries(items.map((item) => [item.item_key, String(before.get(item.item_key) ?? item.reported)]));
  });
  const [invalid, setInvalid] = useState<string | null>(null);

  function save() {
    const received: Record<string, number> = {};
    for (const item of items) {
      const value = Number(values[item.item_key]);
      if (values[item.item_key] === "" || !Number.isFinite(value) || value < 0) {
        setInvalid(`Enter what was received of ${item.number}. ${item.description}`);
        return;
      }
      received[item.item_key] = value;
    }
    setInvalid(null);
    onSave(received);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal loading-check">
        <div className="modal__title">What was loaded for {orderLabel}?</div>
        <div className="loading-check__list">
          {items.map((item) => {
            const value = values[item.item_key] ?? "";
            const set = (next: string) => setValues((current) => ({ ...current, [item.item_key]: next }));
            const numeric = Number(value);
            const state = value === "" ? "" : numeric >= item.ordered ? "complete" : numeric > 0 ? "partial" : "missing";
            return (
              <div key={item.item_key} className={`loading-check__row loading-check__row--${state}`}>
                <div className="loading-check__item">
                  <div className="line-item__name">
                    {item.number}. {item.description}
                  </div>
                  <div className="line-item__meta">
                    Ordered {amount(item.ordered, item.unit)}
                    {item.reported < item.ordered && ` · preparers said ${amount(item.reported, item.unit)}`}
                  </div>
                </div>
                <div className="loading-check__input">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className="input"
                    aria-label={`Received of ${item.description}`}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  />
                  <span className="loading-check__unit">{item.unit}</span>
                  <button type="button" className="link-btn" onClick={() => set(String(item.ordered))}>
                    All
                  </button>
                  <button type="button" className="link-btn" onClick={() => set("0")}>
                    None
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {(invalid || error) && <div className="form-error">{invalid ?? error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Confirm loading"}
          </button>
        </div>
      </div>
    </div>
  );
}
