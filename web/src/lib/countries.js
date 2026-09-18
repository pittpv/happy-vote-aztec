import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

/** @type {{ code: string, label: string }[]} */
export const ALL_COUNTRIES = Object.entries(countries.getAlpha3Codes())
  .map(([code]) => ({
    code,
    label: countries.getName(code, "en") || code,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const DOCUMENT_TYPE_OPTIONS = [
  { id: "passport", label: "Passport" },
  { id: "id_card", label: "National ID" },
  { id: "residence_permit", label: "Residence Permit" },
];

export function countryLabel(code) {
  const c = String(code || "").toUpperCase();
  return countries.getName(c, "en") || c;
}

/**
 * Accept ISO alpha-3 or an English country name. Unknown values are ignored.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function coerceCountryCode(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper) && countries.getName(upper, "en")) return upper;
  const fromName = countries.getAlpha3Code(s, "en");
  return fromName || null;
}
