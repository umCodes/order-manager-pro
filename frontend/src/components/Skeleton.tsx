/** Grey placeholder rows shimmering where a list or page is about to appear, instead of "Loading…". */
export default function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row">
          <div className="skeleton__line skeleton__line--mid" />
          <div className="skeleton__line skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}
