export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="spinner-row">
      <span className="spinner" />
      <span className="muted">{label}</span>
    </div>
  );
}
