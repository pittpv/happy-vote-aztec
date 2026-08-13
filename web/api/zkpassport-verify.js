/**
 * Server-side ZKPassport proof re-verification (Phase 4).
 * Client posts proofs + original query + queryResult; we re-run SDK verify().
 *
 * @see https://docs.zkpassport.id/examples/client-server
 *
 * ESM `@zkpassport/sdk` is loaded after postinstall rewrites its JSON import
 * (`with { type: "json" }`), `buffer/` directory import, and CJS named import
 * of i18n-iso-countries. See scripts/patch-zkpassport-json-import.mjs.
 *
 * bb-crs-env must be imported first so Barretenberg can write CRS under /tmp.
 */
import "./bb-crs-env.js";
import { ZKPassport } from "@zkpassport/sdk";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const {
      proofs,
      originalQuery,
      queryResult,
      scope,
      domain,
      devMode,
      pollId,
    } = body;

    if (!proofs || !originalQuery || !queryResult) {
      return res.status(400).json({
        ok: false,
        error: "Missing proofs, originalQuery, or queryResult",
      });
    }

    const resolvedDomain =
      (typeof domain === "string" && domain.trim()) ||
      process.env.ZKPASSPORT_DOMAIN ||
      process.env.VITE_ZKPASSPORT_DOMAIN ||
      "aztec.happyvote.xyz";

    const allowDev =
      devMode === true ||
      process.env.ZKPASSPORT_DEV_MODE === "true" ||
      process.env.VITE_ZKPASSPORT_DEV_MODE === "true";

    if (typeof ZKPassport !== "function") {
      throw new Error("Failed to load ZKPassport constructor from @zkpassport/sdk");
    }

    const zkPassport = new ZKPassport(resolvedDomain);

    const verifyArgs = {
      proofs,
      originalQuery,
      queryResult,
      devMode: allowDev,
    };
    if (scope != null && String(scope).trim() !== "") {
      verifyArgs.scope = String(scope);
    }

    const capturedLogs = [];
    const originalError = console.error;
    console.error = (...args) => {
      capturedLogs.push(args.map(stringifyLogArg).join(" "));
      originalError.apply(console, args);
    };

    let verified;
    let uniqueIdentifier;
    let queryResultErrors;
    try {
      ({ verified, uniqueIdentifier, queryResultErrors } = await zkPassport.verify(verifyArgs));
    } finally {
      console.error = originalError;
    }

    if (!verified) {
      return res.status(400).json({
        ok: false,
        verified: false,
        error:
          formatQueryResultError(queryResultErrors) ||
          extractBbError(capturedLogs) ||
          "ZKPassport verification failed",
        queryResultErrors: queryResultErrors || null,
        pollId: pollId ?? null,
      });
    }

    if (!uniqueIdentifier) {
      return res.status(400).json({
        ok: false,
        verified: true,
        error: "Verified but no uniqueIdentifier",
      });
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      uniqueIdentifier: String(uniqueIdentifier),
      pollId: pollId ?? null,
      domain: resolvedDomain,
    });
  } catch (error) {
    console.error("[zkpassport-verify]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
}

function stringifyLogArg(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractBbError(logs) {
  const joined = logs.join("\n");
  if (/Read-only file system|\.bb-crs|BBApiException/i.test(joined)) {
    const match = joined.match(/BBApiException:[^\n]+|\.bb-crs[^\n]+|Read-only file system[^\n]+/i);
    return match ? match[0].trim() : "Barretenberg could not write its CRS cache";
  }
  return "";
}

function formatQueryResultError(queryResultErrors) {
  if (!queryResultErrors || typeof queryResultErrors !== "object") return "";
  const messages = [];
  for (const group of Object.values(queryResultErrors)) {
    if (!group || typeof group !== "object") continue;
    for (const detail of Object.values(group)) {
      const msg = detail?.message;
      if (typeof msg === "string" && msg.trim()) messages.push(msg.trim());
    }
  }
  return [...new Set(messages)].join(" · ");
}
