import { LEGAL_DOCUMENTS, getLegalNavItem } from "./legalDocs.js";
import { SITE_DESCRIPTION, SITE_NAME } from "./site.js";
import {
  FAQ_PAGE_DESCRIPTION,
  POLLS_PAGE_DESCRIPTION,
  canonicalPath,
  faqPageJsonLd,
  homeJsonLd,
  metaDescription,
  pageTitle,
  pollJsonLd,
  pollShareDescription,
  webPageJsonLd,
} from "./seo.js";

function knownPoll(poll) {
  if (!poll?.title || !Array.isArray(poll.options) || poll.options.length < 2) return false;
  return poll.options.every((option) => {
    if (typeof option === "string") return option.trim().length > 0;
    return String(option?.label || "").trim().length > 0;
  });
}

export function resolvePageSeo(pathname, catalog) {
  const path = canonicalPath(pathname);
  if (path === "/") {
    return {
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      path,
      noindex: false,
      jsonLd: homeJsonLd(),
    };
  }
  if (path === "/polls") {
    const title = pageTitle("All polls");
    return {
      title,
      description: POLLS_PAGE_DESCRIPTION,
      path,
      noindex: false,
      jsonLd: webPageJsonLd({
        title,
        description: POLLS_PAGE_DESCRIPTION,
        path,
        breadcrumbs: [
          { name: SITE_NAME, path: "/" },
          { name: "All polls", path: "/polls" },
        ],
      }),
    };
  }
  if (path === "/faq") {
    const title = pageTitle("FAQ");
    return {
      title,
      description: FAQ_PAGE_DESCRIPTION,
      path,
      noindex: false,
      jsonLd: faqPageJsonLd(),
    };
  }
  const legalMatch = path.match(/^\/legal\/([a-z0-9-]+)$/);
  if (legalMatch) {
    const slug = legalMatch[1];
    const nav = getLegalNavItem(slug);
    const doc = LEGAL_DOCUMENTS[slug];
    if (!nav || !doc) return null;
    const title = pageTitle(doc.title);
    const description = metaDescription(doc.intro);
    return {
      title,
      description,
      path,
      noindex: false,
      jsonLd: webPageJsonLd({
        title,
        description,
        path,
        breadcrumbs: [
          { name: SITE_NAME, path: "/" },
          { name: doc.title, path },
        ],
      }),
    };
  }
  const pollMatch = path.match(/^\/p\/(\d+)$/);
  if (pollMatch) {
    const id = pollMatch[1];
    const poll = catalog?.polls?.[id];
    const known = knownPoll(poll);
    const title = pageTitle(known ? poll.title : `Poll #${id}`);
    const description = known
      ? pollShareDescription(poll)
      : metaDescription("This poll is not in the HappyVote catalog.");
    return {
      title,
      description,
      path,
      noindex: !known,
      jsonLd: known
        ? pollJsonLd({ title, description, path, poll })
        : webPageJsonLd({
            title,
            description,
            path,
            breadcrumbs: [
              { name: SITE_NAME, path: "/" },
              { name: "All polls", path: "/polls" },
              { name: `Poll #${id}`, path },
            ],
          }),
    };
  }
  return null;
}
