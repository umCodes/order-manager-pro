import ShortageBadge from "./ShortageBadge";
import type { BackupMissingItem } from "../types";

/** Items quick invoices sent today that no backup list had, each with its invoice, as missing. */
export default function BackupMissingSection({ missing }: { missing: BackupMissingItem[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="category-group">
      <div className="category-group__header">
        <span className="category-group__label">Missing from backup (today)</span>
      </div>
      <div className="line-items day-group__line-items">
        {missing.map((item, index) => (
          <div key={`${item.invoice_number}:${item.item_id}:${index}`} className="line-item">
            <div className="line-item__main">
              <div className="line-item__name">
                <span className="line-item__name-text">{item.name || item.description}</span>
              </div>
              <div className="line-item__meta">
                {item.customer_name} · {item.invoice_number}
              </div>
            </div>
            <div className="line-item__right">
              <ShortageBadge short={item.quantity} ordered={item.quantity} unit={item.unit} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
