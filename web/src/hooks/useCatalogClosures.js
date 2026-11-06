import { useEffect, useRef, useState } from "react";
import { fetchCatalogClosures } from "../lib/catalogClosure.js";

/**
 * Chain open/ended flags for catalog cards.
 * A poll missing from the first response is read once more with a fresh request.
 * `pending` stays true during that second read.
 */
export function useCatalogClosures(openPollIds = "") {
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState("");
  const [checkedKey, setCheckedKey] = useState(null);
  const closuresRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const ids = openPollIds ? openPollIds.split(",").filter(Boolean) : [];
    const current = closuresRef.current;
    const missing =
      !current || ids.some((id) => typeof current[id]?.closed !== "boolean");
    if (!missing) {
      setCheckedKey(openPollIds);
      return undefined;
    }
    (async () => {
      try {
        let data = current;
        if (!data) {
          data = await fetchCatalogClosures();
          if (cancelled) return;
          closuresRef.current = data;
          setClosures(data);
        }
        const stillMissing = ids.some((id) => typeof data[id]?.closed !== "boolean");
        if (stillMissing) {
          data = await fetchCatalogClosures({ fresh: true });
          if (cancelled) return;
          closuresRef.current = data;
          setClosures(data);
        }
        if (!cancelled) {
          setError("");
          setCheckedKey(openPollIds);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || String(err));
          setCheckedKey(openPollIds);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openPollIds]);

  return { closures, error, pending: checkedKey !== openPollIds };
}
