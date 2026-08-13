/**
 * Rewrite @zkpassport/sdk ESM so Node 20+ on Vercel can load it:
 * - add `with { type: "json" }` to i18n-iso-countries locale import
 * - rewrite `buffer/` directory import to `buffer/index.js`
 * - convert CJS named import of i18n-iso-countries to default import
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const esmPath = join(webRoot, "node_modules/@zkpassport/sdk/dist/esm/index.js");

if (!existsSync(esmPath)) {
  throw new Error(`@zkpassport/sdk ESM entry not found: ${esmPath}`);
}

const source = readFileSync(esmPath, "utf8");
let next = source;
const changes = [];

if (!/i18n-iso-countries\/langs\/en\.json['"]\s+with\s*\{/.test(next)) {
  const patchedJson = next.replace(
    /from(['"])i18n-iso-countries\/langs\/en\.json\1/g,
    `from$1i18n-iso-countries/langs/en.json$1 with { type: "json" }`,
  );
  if (patchedJson === next) {
    throw new Error(
      `Did not find i18n-iso-countries/langs/en.json import in ${esmPath}. SDK may have changed; update this patch.`,
    );
  }
  next = patchedJson;
  changes.push("json-import-attribute");
}

if (next.includes("from'buffer/'") || next.includes('from"buffer/"')) {
  next = next.replace(/from(['"])buffer\/\1/g, "from$1buffer/index.js$1");
  changes.push("buffer-index");
}

if (!next.includes("__hvIsoCountries")) {
  const patchedIso = next.replace(
    /import \{registerLocale,getAlpha3Code\}from(['"])i18n-iso-countries\1;/,
    "import __hvIsoCountries from$1i18n-iso-countries$1;const {registerLocale,getAlpha3Code}=__hvIsoCountries;",
  );
  if (patchedIso === next) {
    throw new Error(
      `Did not find named i18n-iso-countries import in ${esmPath}. SDK may have changed; update this patch.`,
    );
  }
  next = patchedIso;
  changes.push("iso-countries-default-import");
}

if (next === source) {
  console.log(`[patch-zkpassport-json-import] already patched: ${esmPath}`);
  process.exit(0);
}

writeFileSync(esmPath, next);
console.log(`[patch-zkpassport-json-import] applied ${changes.join(", ")}: ${esmPath}`);
