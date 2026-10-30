import { FAQ_ITEMS } from "./faq.js";
import { SITE_AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site.js";

export const POLLS_PAGE_DESCRIPTION =
  "Browse every HappyVote poll on Aztec Testnet. Search by title or topic, filter by country and eligibility, then open a ballot.";

export const FAQ_PAGE_DESCRIPTION =
  "Answers about private ballots, public tallies, ZKPassport, wallets, fees, and sealed polls on HappyVote on Aztec.";

const TWITTER_SITE = "@happyvoteaztec";
const OG_IMAGE_WIDTH = "1200";
const OG_IMAGE_HEIGHT = "630";

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
  return `${SITE_URL}${canonicalPath(path)}`;
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
  if (!data) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = JSON_LD_ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function ogImageUrl(path = "/") {
  return `${SITE_URL}/api/og?path=${encodeURIComponent(canonicalPath(path))}`;
}

export function canonicalPath(path = "/") {
  return path === "/" ? "/" : String(path).replace(/\/+$/, "") || "/";
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" id="${JSON_LD_ID}">${json}</script>`;
}

function optionLabels(poll) {
  return (poll?.options || [])
    .map((option) => {
      if (typeof option === "string") return option.trim();
      return String(option?.label || "").trim();
    })
    .filter(Boolean);
}

export function pollShareDescription(poll) {
  const base = String(poll?.description || poll?.title || "").trim();
  const labels = optionLabels(poll);
  const extra = labels.length ? ` Options: ${labels.join(", ")}.` : "";
  return metaDescription(`${base}${extra}`.trim());
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

export function pollJsonLd({ title, description, path, poll }) {
  const url = canonicalUrl(path);
  const labels = optionLabels(poll);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${url}#question` },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: canonicalUrl("/") },
            { "@type": "ListItem", position: 2, name: "All polls", item: canonicalUrl("/polls") },
            { "@type": "ListItem", position: 3, name: poll.title, item: url },
          ],
        },
      },
      {
        "@type": "Question",
        "@id": `${url}#question`,
        name: poll.title,
        text: description,
        identifier: String(poll.id),
        suggestedAnswer: labels.map((label) => ({
          "@type": "Answer",
          text: label,
        })),
      },
    ],
  };
}

export function faqPageJsonLd() {
  const url = canonicalUrl("/faq");
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    name: pageTitle("FAQ"),
    description: FAQ_PAGE_DESCRIPTION,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function replaceTag(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html;
}

function upsertMeta(html, attr, key, content) {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(
    `(<meta\\s+${attr}="${key}"\\s+content=")[^"]*("\\s*\\/?>)`,
    "i",
  );
  if (pattern.test(html)) return html.replace(pattern, `$1${escaped}$2`);
  return html.replace(
    "</head>",
    `    <meta ${attr}="${key}" content="${escaped}" />\n  </head>`,
  );
}

export function applyHtmlSeo(html, seo) {
  const path = canonicalPath(seo.path || "/");
  const url = canonicalUrl(path);
  const image = ogImageUrl(path);
  const robots = seo.noindex ? "noindex, nofollow" : "index, follow";
  let next = html;
  next = replaceTag(next, /<title>[^<]*<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  next = upsertMeta(next, "name", "description", seo.description);
  next = upsertMeta(next, "name", "robots", robots);
  next = upsertMeta(next, "name", "twitter:card", "summary");
  next = upsertMeta(next, "name", "twitter:site", TWITTER_SITE);
  next = upsertMeta(next, "name", "twitter:title", seo.title);
  next = upsertMeta(next, "name", "twitter:description", seo.description);
  next = upsertMeta(next, "name", "twitter:image", image);
  next = upsertMeta(next, "name", "twitter:image:alt", seo.title);
  next = upsertMeta(next, "property", "og:type", "website");
  next = upsertMeta(next, "property", "og:site_name", SITE_NAME);
  next = upsertMeta(next, "property", "og:title", seo.title);
  next = upsertMeta(next, "property", "og:description", seo.description);
  next = upsertMeta(next, "property", "og:url", url);
  next = upsertMeta(next, "property", "og:locale", "en_US");
  next = upsertMeta(next, "property", "og:image", image);
  next = upsertMeta(next, "property", "og:image:alt", seo.title);
  next = upsertMeta(next, "property", "og:image:width", OG_IMAGE_WIDTH);
  next = upsertMeta(next, "property", "og:image:height", OG_IMAGE_HEIGHT);
  next = replaceTag(
    next,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );
  if (seo.jsonLd) {
    const script = jsonLdScript(seo.jsonLd);
    if (new RegExp(`<script type="application/ld\\+json" id="${JSON_LD_ID}">[\\s\\S]*?<\\/script>`).test(next)) {
      next = next.replace(
        new RegExp(`<script type="application/ld\\+json" id="${JSON_LD_ID}">[\\s\\S]*?<\\/script>`),
        script,
      );
    } else {
      next = next.replace("</head>", `    ${script}\n  </head>`);
    }
  }
  return next;
}

export function applyDocumentSeo({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  noindex = false,
  jsonLd,
}) {
  const url = canonicalUrl(path);
  const image = ogImageUrl(path);
  document.title = title;
  setMetaByName("description", description);
  setMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow");
  setMetaByName("twitter:card", "summary");
  setMetaByName("twitter:site", TWITTER_SITE);
  setMetaByName("twitter:title", title);
  setMetaByName("twitter:description", description);
  setMetaByName("twitter:image", image);
  setMetaByName("twitter:image:alt", title);
  setMetaByProperty("og:type", "website");
  setMetaByProperty("og:site_name", SITE_NAME);
  setMetaByProperty("og:title", title);
  setMetaByProperty("og:description", description);
  setMetaByProperty("og:url", url);
  setMetaByProperty("og:locale", "en_US");
  setMetaByProperty("og:image", image);
  setMetaByProperty("og:image:alt", title);
  setMetaByProperty("og:image:width", OG_IMAGE_WIDTH);
  setMetaByProperty("og:image:height", OG_IMAGE_HEIGHT);
  setLinkRel("canonical", url);
  setJsonLd(jsonLd);
}
