export class WalletUserRejectedError extends Error {
  constructor(cause) {
    super("Wallet request rejected by user", cause !== undefined ? { cause } : undefined);
    this.name = "WalletUserRejectedError";
  }
}

export function flattenError(err, depth = 0, seen = new Set()) {
  if (err == null || depth > 6 || seen.has(err)) return "";
  seen.add(err);
  const parts = [];
  if (typeof err === "string") parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message, err.name);
    if ("cause" in err) parts.push(flattenError(err.cause, depth + 1, seen));
  } else if (typeof err === "object") {
    const e = err;
    for (const k of ["message", "error", "details", "data"]) {
      if (typeof e[k] === "string") parts.push(e[k]);
    }
    if (e.cause) parts.push(flattenError(e.cause, depth + 1, seen));
  } else {
    parts.push(String(err));
  }
  return parts.join(" ").toLowerCase();
}

export function isUserRejection(err) {
  const blob = flattenError(err);
  return (
    blob.includes("user denied") ||
    blob.includes("user rejected") ||
    blob.includes("rejected by user") ||
    blob.includes("user cancelled") ||
    blob.includes("user canceled") ||
    blob.includes("request rejected") ||
    err instanceof WalletUserRejectedError
  );
}
