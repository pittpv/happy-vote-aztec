import { FAQ_ITEMS } from "../lib/faq.js";
import { FAQ_PAGE_DESCRIPTION, faqPageJsonLd, pageTitle } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";

const FAQ_URL = /https?:\/\/[^\s)]+/g;

function FaqAnswer({ text }) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(FAQ_URL)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const label = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    nodes.push(
      <a key={`${url}-${start}`} href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <p>{nodes}</p>;
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
          Short answers about privacy, wallets, and how a ballot is counted. The important points
          are first.
        </p>
      </header>

      <section className="faq-list" aria-label="Frequently asked questions">
        {FAQ_ITEMS.map((item) => (
          <details key={item.id} className="faq-item" id={`faq-${item.id}`}>
            <summary>{item.question}</summary>
            <FaqAnswer text={item.answer} />
          </details>
        ))}
      </section>

      <SiteFooter disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority." />
    </main>
  );
}
