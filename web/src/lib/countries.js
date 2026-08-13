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
