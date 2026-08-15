/**
 * User-facing notice. Use for errors and important outcomes — never dump raw chain logs.
 */
export function Notice({ tone = "neutral", title, children }) {
  if (!title && (children == null || children === "")) return null;
  const role = tone === "error" ? "alert" : "status";
  return (
    <div className="notice" data-tone={tone} role={role}>
      {title ? <p className="notice-title">{title}</p> : null}
      {children != null && children !== "" ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}
