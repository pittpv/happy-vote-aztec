import { FAQ_GROUPS } from "../lib/faq.js";
import { FAQ_PAGE_DESCRIPTION, faqPageJsonLd, pageTitle } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";

const FAQ_URL = /https?:\/\/[^\s)]+/g;

function linkify(text, keyPrefix) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(FAQ_URL)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const label = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    nodes.push(
      <a key={`${keyPrefix}-${url}-${start}`} href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function FaqAnswer({ text }) {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((paragraph, index) => <p key={index}>{linkify(paragraph, index)}</p>);
}

export function FaqPage({ walletConnect }) {
  const title = pageTitle("FAQ");
  usePageSeo({
    title,
    description: FAQ_PAGE_DESCRIPTION,
    path: "/faq",
    jsonLd: faqPageJsonLd(),
  });

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="faq" />

      <header className="catalog-hero">
        <p className="vote-kicker">FAQ</p>
        <h1 className="catalog-hero-title">Questions</h1>
        <p className="lede">
          Grouped for voters, for people publishing a poll, and for everyone else. Inside each
          group, the most useful answer is first.
        </p>
      </header>

      <nav className="faq-toc" aria-label="FAQ sections">
        {FAQ_GROUPS.map((group) => (
          <a key={group.id} href={`#faq-group-${group.id}`}>
            {group.title}
          </a>
        ))}
      </nav>

      {FAQ_GROUPS.map((group) => (
        <section
          key={group.id}
          className="faq-group"
          id={`faq-group-${group.id}`}
          aria-labelledby={`faq-heading-${group.id}`}
        >
          <header className="faq-group-head">
            <h2 className="section-title" id={`faq-heading-${group.id}`}>
              {group.title}
            </h2>
            <p className="section-lede">{group.lede}</p>
          </header>
          <div className="faq-list">
            {group.items.map((item) => (
              <details key={item.id} className="faq-item" id={`faq-${item.id}`}>
                <summary>{item.question}</summary>
                <FaqAnswer text={item.answer} />
              </details>
            ))}
          </div>
        </section>
      ))}

      <SiteFooter disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority." />
    </main>
  );
}
