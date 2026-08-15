import { useEffect } from "react";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_NAV } from "../lib/legalDocs.js";
import { legalPath, navigate } from "../lib/routing.js";
import { SITE_NAME } from "../lib/site.js";
import { metaDescription, pageTitle, webPageJsonLd } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";

export function LegalPage({ slug, walletConnect }) {
  const doc = LEGAL_DOCUMENTS[slug];
  const path = `/legal/${slug}`;
  const title = doc ? pageTitle(doc.title) : pageTitle("Legal");
  const description = metaDescription(doc?.intro);

  usePageSeo({
    title,
    description,
    path,
    jsonLd: webPageJsonLd({
      title,
      description,
      path,
      breadcrumbs: [
        { name: SITE_NAME, path: "/" },
        { name: doc?.title || "Legal", path },
      ],
    }),
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!doc) {
    return (
      <main className="app">
        <SiteHeader walletConnect={walletConnect} current="legal" />
        <p className="meta">Document not found.</p>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="legal" />

      <header className="legal-hero">
        <p className="legal-kicker">HappyVote on Aztec · Legal</p>
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-effective">Effective date: {LEGAL_EFFECTIVE_DATE}</p>
        <p className="lede legal-intro">{doc.intro}</p>
      </header>

      <nav className="legal-toc" aria-label="Other legal documents">
        {LEGAL_NAV.map((item) => (
          <button
            key={item.slug}
            type="button"
            className={`legal-toc-link${item.slug === slug ? " is-active" : ""}`}
            aria-current={item.slug === slug ? "page" : undefined}
            onClick={() => navigate(legalPath(item.slug))}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <article className="legal-doc">
        {doc.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {(section.paragraphs || []).map((text, i) => (
              <p key={`${section.heading}-p-${i}`}>{text}</p>
            ))}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((item, i) => (
                  <li key={`${section.heading}-li-${i}`}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      <SiteFooter
        disclaimer="These documents describe current HappyVote on Aztec practices and are not legal advice. Have counsel review them before relying on them in a regulated context."
      />
    </main>
  );
}
