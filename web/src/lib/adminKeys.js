/**
 * Parse admin key material from discrete fields or a pasted .env fragment.
 * Never logs values.
 */
export function parseAdminKeyMaterial({ secretKey, signingKey, salt, paste } = {}) {
  let secret = String(secretKey || "").trim();
  let signing = String(signingKey || "").trim();
  let saltVal = String(salt || "").trim();

  const blob = String(paste || "").trim();
  if (blob) {
    const map = {};
    for (const line of blob.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      map[key] = value;
    }
        secret = secret || map.SECRET_KEY || map.SECRET || map.secretKey || "";
    signing = signing || map.SIGNING_KEY || map.signingKey || "";
    saltVal = saltVal || map.SALT || map.salt || "";
  }

  if (!secret || !signing || !saltVal) {
    throw new Error("Need SECRET_KEY (or SECRET), SIGNING_KEY, and SALT (fields or pasted .env lines)");
  }
  if (!looksLikeFieldHex(secret)) {
    throw new Error("SECRET_KEY must be a hex field (0x… or decimal string)");
  }
  if (!looksLikeFieldHex(signing)) {
    throw new Error("SIGNING_KEY must be a hex scalar (0x…)");
  }
  if (!looksLikeFieldHex(saltVal)) {
    throw new Error("SALT must be a hex field (0x… or decimal string)");
  }

  return { secretKey: secret, signingKey: signing, salt: saltVal };
}

function looksLikeFieldHex(value) {
  const s = String(value).trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return true;
  if (/^[0-9]+$/.test(s)) return true;
  return false;
}
