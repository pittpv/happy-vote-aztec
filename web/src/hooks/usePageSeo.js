import { useEffect } from "react";
import { applyDocumentSeo } from "../lib/seo.js";

export function usePageSeo({ title, description, path, noindex = false, jsonLd }) {
  const jsonKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const parsed = jsonKey ? JSON.parse(jsonKey) : undefined;
    applyDocumentSeo({ title, description, path, noindex, jsonLd: parsed });
  }, [title, description, path, noindex, jsonKey]);
}
