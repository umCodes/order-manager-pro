import { ChevronDown, MessageSquareOff } from "lucide-react";
import { currency } from "../lib/currency";
import type { CatalogItem, CartLine } from "../types";

export type DraftForm = {
  description: string;
  quantity: string;
  rate: string;
  excludeFromTelegram: boolean;
};

type Props = {
  item: CatalogItem;
  inCart: CartLine | undefined;
  isExpanded: boolean;
  form: DraftForm;
  onToggleExpand: () => void;
  onFormChange: (form: DraftForm) => void;
  onCommit: () => void;
  onRemove: () => void;
};

/** One catalog item in the add-item sheet: a header row that expands into a qty/rate/description editor. */
export default function AddItemRow({
  item,
  inCart,
  isExpanded,
  form,
  onToggleExpand,
  onFormChange,
  onCommit,
  onRemove,
}: Props) {
  const formTotal = (Number(form.rate) || 0) * (Number(form.quantity) || 0);

  return (
    <div className="item-row">
      <button type="button" className="item-row__header" onClick={onToggleExpand}>
        <div className="item-row__main">
          <div className="item-row__name">
            {item.name}
            {inCart && <span className="badge item-row__badge">added</span>}
            {inCart?.excludeFromTelegram && (
              <span
                className="item-row__mute-icon"
                title="Excluded from Telegram"
                aria-label="Excluded from Telegram"
              >
                <MessageSquareOff size={13} />
              </span>
            )}
          </div>
          <div className="item-row__description">{item.description}</div>
        </div>
        <div className="item-row__side">
          <span className="item-row__rate">{currency(item.rate)}</span>
          <ChevronDown
            size={18}
            className={`item-row__chevron${isExpanded ? " item-row__chevron--open" : ""}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="item-row__expanded">

          <div className="field-row">
            <label className="field-row__label" htmlFor={`qty-${item.item_id}`}>
              Qty
            </label>
            <input
              id={`qty-${item.item_id}`}
              type="number"
              className="input field-row__input field-row__input--qty"
              value={form.quantity}
              onChange={(e) => onFormChange({ ...form, quantity: e.target.value })}
            />
          </div>
          <div className="field-row">
            <label className="field-row__label" htmlFor={`rate-${item.item_id}`}>
              Rate
            </label>
            <input
              id={`rate-${item.item_id}`}
              type="number"
              step="0.01"
              className="input field-row__input field-row__input--rate"
              value={form.rate}
              onChange={(e) => onFormChange({ ...form, rate: e.target.value })}
            />
          </div>
          <div className="field-row">
            <label className="field-row__label" htmlFor={`desc-${item.item_id}`}>
              Description
            </label>
            <input
              id={`desc-${item.item_id}`}
              type="text"
              className="input field-row__input field-row__input--description"
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field-row">
            <span className="field-row__label">Total</span>
            <span className="field-row__total">{currency(formTotal)}</span>
          </div>
          <div className="field-row">
            <label className="field-row__label" htmlFor={`exclude-${item.item_id}`}>
              Exclude from Telegram
            </label>
            <input
              id={`exclude-${item.item_id}`}
              type="checkbox"
              className="field-row__checkbox"
              checked={form.excludeFromTelegram}
              onChange={(e) => onFormChange({ ...form, excludeFromTelegram: e.target.checked })}
            />
          </div>

          <div className="item-row__actions">
            {inCart && (
              <button type="button" className="btn btn--secondary" onClick={onRemove}>
                Remove
              </button>
            )}
            <button type="button" className="btn btn--item-add" onClick={onCommit}>
              {inCart ? "Update line item" : "Add to invoice"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
