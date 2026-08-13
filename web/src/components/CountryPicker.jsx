import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_COUNTRIES, countryLabel } from "../lib/countries.js";

/**
 * Multi-select country picker (ZKPassport Dashboard style).
 */
export function CountryPicker({ label, hint, value, onChange, disabled, exclude = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = Array.isArray(value) ? value : [];
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_COUNTRIES.filter((c) => {
      if (excludeSet.has(c.code)) return false;
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    });
  }, [query, excludeSet]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function toggle(code) {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code].sort());
  }

  const summary =
    selected.length === 0
      ? "Select countries"
      : selected.length <= 3
        ? selected.map(countryLabel).join(", ")
        : `${selected.length} countries`;

  return (
    <div className="country-picker">
      <button
        type="button"
        className="country-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {summary}
      </button>
      {open
        ? createPortal(
            <div className="wc-overlay" role="presentation" onClick={() => setOpen(false)}>
              <div
                className="country-modal"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="wc-modal-head">
                  <h3>{label}</h3>
                  <button
                    type="button"
                    className="wc-close"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                  >
                    ×
                  </button>
                </div>
                {hint ? <p className="wc-hint">{hint}</p> : null}
                <input
                  className="country-search"
                  type="search"
                  placeholder="Search countries…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <div className="country-grid">
                  {filtered.map((c) => (
                    <label key={c.code} className="check-row compact">
                      <input
                        type="checkbox"
                        checked={selected.includes(c.code)}
                        onChange={() => toggle(c.code)}
                      />
                      <span>
                        {c.label} <span className="country-code">{c.code}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary wc-full"
                  onClick={() => setOpen(false)}
                >
                  Done ({selected.length})
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
