/** A filter pill (city / district, template category): shows its unread messages as a badge when there are any, otherwise its count. */
export default function FilterChip({
  label,
  count,
  unread = 0,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  unread?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`wa-chip${active ? " wa-chip--active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {unread > 0 ? (
        <span className="unread-badge unread-badge--chip" aria-label={`${unread} unread`}>
          {unread > 99 ? "99+" : unread}
        </span>
      ) : (
        count !== undefined && <span className="wa-chip__count">{count}</span>
      )}
    </button>
  );
}
