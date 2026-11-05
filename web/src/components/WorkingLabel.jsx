export function WorkingLabel({ text }) {
  const base = String(text ?? "").replace(/(?:\u2026|\.{1,3})\s*$/, "").trimEnd();
  return (
    <span className="working-label">
      {base}
      <span className="sr-only">…</span>
      <span className="working-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}
