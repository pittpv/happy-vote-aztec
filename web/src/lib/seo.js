import { SITE_AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site.js";

const JSON_LD_ID = "seo-jsonld";

export function pageTitle(segment) {
  if (!segment) return SITE_NAME;
  return `${segment} · ${SITE_NAME}`;
}

export function metaDescription(text, fallback = SITE_DESCRIPTION) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return fallback;
  if (raw.length <= 160) return raw;
  const cut = raw.slice(0, 157);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

export function canonicalUrl(path = "/") {
  const normalized = path === "/" ? "/" : String(path).replace(/\/+$/, "") || "/";
  return `${SITE_URL}${normalized}`;
}

function setMetaByName(name, content) {
  let el = document.head.querySelector(`meta[name="${CSS.escape(name)}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property, content) {
  let el = document.head.querySelector(`meta[property="${CSS.escape(property)}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLinkRel(rel, href) {
  let el = document.head.querySelector(`link[rel="${CSS.escape(rel)}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(data) {
  let el = document.getElementById(JSON_LD_ID);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = JSON_LD_ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/favicon.svg`,
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}/#author`,
        name: SITE_AUTHOR.name,
        sameAs: SITE_AUTHOR.sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#org` },
        author: { "@id": `${SITE_URL}/#author` },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#app` },
      },
    ],
  };
}

export function webPageJsonLd({ title, description, path, breadcrumbs }) {
  const url = canonicalUrl(path);
  const items = (breadcrumbs || []).map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: canonicalUrl(crumb.path),
  }));
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: items,
    },
  };
}

export function applyDocumentSeo({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  noindex = false,
  jsonLd,
}) {
  const url = canonicalUrl(path);
  document.title = title;
  setMetaByName("description", description);
  setMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow");
  setMetaByName("twitter:card", "summary");
  setMetaByName("twitter:title", title);
  setMetaByName("twitter:description", description);
  setMetaByProperty("og:type", "website");
  setMetaByProperty("og:site_name", SITE_NAME);
  setMetaByProperty("og:title", title);
  setMetaByProperty("og:description", description);
  setMetaByProperty("og:url", url);
  setMetaByProperty("og:locale", "en_US");
  setLinkRel("canonical", url);
  if (jsonLd) setJsonLd(jsonLd);
}
