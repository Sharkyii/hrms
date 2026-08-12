export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <span className={`badge ${value}`}>{value.replace(/_/g, " ")}</span>;
}
