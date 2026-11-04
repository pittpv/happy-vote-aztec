import { useEffect, useState } from "react";
import { fetchCatalogClosures } from "../lib/catalogClosure.js";

/** Chain open/ended flags for catalog cards. `null` until the request settles. */
export function useCatalogClosures() {
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchCatalogClosures();
        if (!cancelled) setClosures(next);
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { closures, error, ready: closures != null };
}
