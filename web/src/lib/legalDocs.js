/**
 * Legal documents for HappyVote on Aztec (aztec.happyvote.xyz).
 * Content reflects current product behaviour; not a substitute for counsel review.
 */

export const LEGAL_EFFECTIVE_DATE = "15 August 2026";
export const LEGAL_CONTACT = "legal@happyvote.xyz";
export const SERVICE_NAME = "HappyVote on Aztec";
export const SERVICE_URL = "https://aztec.happyvote.xyz";

/** @typedef {"terms" | "privacy" | "cookies" | "data-safety" | "gdpr"} LegalSlug */

/** @type {{ slug: LegalSlug, label: string, title: string }[]} */
export const LEGAL_NAV = [
  { slug: "terms", label: "Terms of Service", title: "Terms of Service" },
  { slug: "privacy", label: "Privacy Policy", title: "Privacy Policy" },
  { slug: "data-safety", label: "Data Safety", title: "Data Safety" },
  { slug: "cookies", label: "Cookie Policy", title: "Cookie Policy" },
  { slug: "gdpr", label: "GDPR", title: "GDPR & Your Rights" },
];

/**
 * @param {string} slug
 * @returns {{ slug: LegalSlug, label: string, title: string } | null}
 */
export function getLegalNavItem(slug) {
  return LEGAL_NAV.find((item) => item.slug === slug) ?? null;
}

/**
 * @typedef {{ heading: string, paragraphs?: string[], bullets?: string[] }} LegalSection
 * @typedef {{ title: string, intro: string, sections: LegalSection[] }} LegalDocument
 */

/** @type {Record<LegalSlug, LegalDocument>} */
export const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms of Service",
    intro:
      "These Terms govern your use of HappyVote on Aztec at aztec.happyvote.xyz (the “Service”). By accessing or using the Service, you agree to these Terms.",
    sections: [
      {
        heading: "1. Nature of the Service",
        paragraphs: [
          "HappyVote on Aztec is a technology layer for casting and viewing polls on Aztec Network (currently Testnet). It is not an official electoral authority, government body, or certified election system. Results are cryptographic / on-chain artefacts of the protocol and contracts you interact with — not legally binding election outcomes unless a separate binding arrangement says otherwise.",
        ],
      },
      {
        heading: "2. Eligibility",
        paragraphs: [
          "You must be able to lawfully use blockchain wallets and related tools in your jurisdiction. Some polls may require ZKPassport personhood or additional eligibility proofs (for example age or nationality predicates). Meeting those proofs does not grant you any official voting right under public law.",
        ],
      },
      {
        heading: "3. Wallets, keys, and transactions",
        bullets: [
          "You are solely responsible for your wallet, secret keys, seed phrases, and devices.",
          "Transactions you submit (including private and open votes) are irreversible once included on the network, subject only to the underlying chain’s consensus rules.",
          "Network fees, Sponsored FPC availability, faucet claims, and RPC reliability are outside our control.",
          "Browser-session wallets keep material in memory for the tab session; do not use them for high-value assets.",
        ],
      },
      {
        heading: "4. Acceptable use",
        paragraphs: [
          "You may not use the Service to break applicable law, harass others, attempt to compromise infrastructure, circumvent anti-double-vote or eligibility checks in an abusive way, spam the network, or misrepresent the Service as an official election platform. Operators may refuse or remove poll metadata they host and may restrict admin tooling.",
        ],
      },
      {
        heading: "5. Polls and content",
        paragraphs: [
          "Poll titles, descriptions, and options may be stored as off-chain metadata (including in your browser or our hosting configuration) while tallies and vote logic live in smart contracts. Operators do not endorse every poll’s political or commercial message. You rely on on-chain state and explorers for authoritative tallies.",
        ],
      },
      {
        heading: "6. Third-party services",
        paragraphs: [
          "The Service depends on Aztec nodes / RPC providers, explorers, fee faucets, wallet software, ZKPassport, CDNs, and hosting (for example Vercel). Their terms and availability apply in addition to these Terms.",
        ],
      },
      {
        heading: "7. No warranties",
        paragraphs: [
          "The Service is provided “as is” and “as available,” including during Testnet. We do not warrant uninterrupted access, freedom from bugs, privacy against all metadata leakage (for example IP or timing correlation), or fitness for any particular election, DAO, or commercial purpose.",
        ],
      },
      {
        heading: "8. Limitation of liability",
        paragraphs: [
          "To the fullest extent permitted by law, HappyVote operators are not liable for lost votes, lost keys, failed proofs, network congestion, third-party outages, incorrect metadata, or consequential damages arising from use of the Service. Your sole remedy is to stop using the Service.",
        ],
      },
      {
        heading: "9. Changes",
        paragraphs: [
          "We may update these Terms by posting a revised version on the Service. Continued use after the effective date constitutes acceptance of the updated Terms.",
        ],
      },
      {
        heading: "10. Contact",
        paragraphs: [
          `Questions about these Terms: ${LEGAL_CONTACT}.`,
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    intro:
      "This Privacy Policy explains what information HappyVote on Aztec processes when you use aztec.happyvote.xyz, and why. It should be read together with the Cookie Policy, Data Safety summary, and GDPR notice.",
    sections: [
      {
        heading: "1. Who we are",
        paragraphs: [
          `The Service is operated under the HappyVote project (“we”, “us”). Contact for privacy requests: ${LEGAL_CONTACT}. Website: ${SERVICE_URL}.`,
        ],
      },
      {
        heading: "2. What we process",
        bullets: [
          "Public blockchain data: poll tallies, open votes (address and choice when you vote openly), contract addresses, and transaction hashes visible on Aztec explorers.",
          "Private votes: validity and tally updates without revealing your address as the voter; live public tallies still show option counts.",
          "Wallet / account identifiers you connect in the browser for the session.",
          "Optional ZKPassport proofs: cryptographic personhood / eligibility signals (for example a scoped unique identifier). We do not receive your raw passport document through the HappyVote UI.",
          "Local browser storage: poll catalog metadata you or admins persist in this browser (key happyvote.aztec.polls.v1), and a short-lived ZKPassport personhood identifier per poll (key happyvote.aztec.zkid.v1) so a tab reload on mobile does not drop a completed identity check. This is not your passport image.",
          "Server logs / edge requests: when you load the site or call our guest tallies API (/api/poll-state), our host may process standard request metadata (IP, user agent, path, time) to deliver and secure the Service.",
          "First-party visit aggregates: we count pageviews without cookies. The server may read IP and user-agent only to derive a country code and a same-day uniqueness hash, then discard those inputs. We store daily totals (pageviews, approximate uniques, country, coarse site section, device class, browser family, referrer hostname). We do not store IP addresses, do not use analytics cookies, do not keep a cross-day visitor id, and do not record poll IDs in this counter. Small country/referrer counts are grouped so a single visit is not shown as a precise location.",
          "We do not require an email/password account to browse or vote.",
        ],
      },
      {
        heading: "3. Purposes and legal bases (EEA/UK summary)",
        bullets: [
          "Provide the voting UI, wallet connection, and public tallies — legitimate interests / performance of a requested service.",
          "Understand coarse, non-identifying site usage (daily visit totals) — legitimate interests. This processing does not use cookies and is not used to profile you or to link a visit to a ballot.",
          "Security, abuse prevention, and rate limiting on APIs — legitimate interests.",
          "Comply with law where applicable — legal obligation.",
          "Where consent is required for non-essential cookies or similar tech, we rely on consent (see Cookie Policy).",
        ],
      },
      {
        heading: "4. On-chain permanence",
        paragraphs: [
          "Data written to Aztec Network (including nullifiers, public tallies, and open vote records) is typically immutable and globally visible according to the protocol. We cannot “delete” on-chain history the way a traditional database can. Prefer private mode when you do not want your address linked to a choice; understand that metadata (IP, timing, fee patterns) can still correlate activity in some cases.",
        ],
      },
      {
        heading: "5. Sharing",
        paragraphs: [
          "We do not sell personal data. Processing occurs with infrastructure and protocol providers needed to run the Service (hosting, RPC, ZKPassport, wallets, and CDNs). Those parties process data under their own policies when you interact with them directly.",
        ],
      },
      {
        heading: "6. Retention",
        bullets: [
          "Browser localStorage: until you clear site data or we change storage keys.",
          "Session wallet material: until you disconnect or close the tab (as described in the UI).",
          "Visit aggregates: daily totals for a limited rolling window (on the order of months), without IP addresses or cookies.",
          "Same-day uniqueness hashes used only to approximate unique visits: dropped within about two days.",
          "Hosting/API logs: according to the host’s retention (often days to weeks) unless needed longer for security.",
          "On-chain data: indefinite, per network rules.",
        ],
      },
      {
        heading: "7. Your choices",
        paragraphs: [
          "You can browse tallies without connecting a wallet. You can disconnect your wallet, clear site storage, use a tracker blocker, send a Global Privacy Control or Do Not Track signal (we skip the visit counter), use private voting where offered, and decline ZKPassport-gated polls. For GDPR rights, see the GDPR page.",
        ],
      },
      {
        heading: "8. Children",
        paragraphs: [
          "The Service is not directed at children under 16 (or the higher age required in your country). Do not use it if you are under that age.",
        ],
      },
      {
        heading: "9. Changes",
        paragraphs: [
          "We may update this Policy by posting a new version with an updated effective date.",
        ],
      },
    ],
  },

  cookies: {
    title: "Cookie Policy",
    intro:
      "This Cookie Policy describes how HappyVote on Aztec uses cookies and similar technologies on aztec.happyvote.xyz.",
    sections: [
      {
        heading: "1. Do we use traditional cookies?",
        paragraphs: [
          "HappyVote on Aztec does not set first-party analytics cookies. Visit counting is cookieless: a same-origin request records an aggregated pageview. We use local browser storage and session memory for the app. Hosting, fonts, ZKPassport, and wallets may set additional cookies or storage when you use those features. We do not set advertising cookies or run cross-site marketing trackers on this subdomain.",
        ],
      },
      {
        heading: "2. Similar technologies we use",
        bullets: [
          "localStorage — poll metadata catalog (happyvote.aztec.polls.v1) so created/listed polls persist in your browser; ZKPassport personhood id for a poll (happyvote.aztec.zkid.v1) for up to 12 hours so iPhone reloads do not require scanning again.",
          "In-memory session state — wallet connection and admin key material for the current tab (not written to localStorage for admin import).",
          "Essential host/CDN cookies — our hosting or security edge may set strictly necessary cookies to deliver the site.",
          "Third-party flows — connecting an external Aztec wallet or completing ZKPassport may involve cookies or storage controlled by those providers.",
        ],
      },
      {
        heading: "3. Purpose categories",
        bullets: [
          "Strictly necessary — load the app, SPA routing, security headers, API delivery.",
          "Functional — remember poll metadata locally; keep a completed ZKPassport check across a tab reload; keep a wallet session while you vote.",
          "We do not set analytics or marketing cookies and do not run third-party analytics or cross-site advertising trackers on this subdomain. First-party visit totals (see Privacy Policy) do not use cookies.",
        ],
      },
      {
        heading: "4. Your controls",
        paragraphs: [
          "You can clear cookies and site data in your browser settings, use private browsing, or block storage and third-party scripts (some features such as saved poll metadata or wallet sessions may stop working). For third-party tools (wallets, ZKPassport), use those providers’ settings or disconnect before completing their flows.",
        ],
      },
      {
        heading: "5. Updates",
        paragraphs: [
          "If we add analytics cookies or other non-essential cookies, we will update this Policy and, where required, request consent before setting them.",
        ],
      },
    ],
  },

  "data-safety": {
    title: "Data Safety",
    intro:
      "This summary describes data practices for HappyVote on Aztec in plain language (similar to store “Data safety” disclosures). Details are in the Privacy Policy.",
    sections: [
      {
        heading: "Data collected",
        bullets: [
          "App activity: poll IDs requested from our tallies API, connection errors shown in the UI. We do not run a third-party analytics counter on this subdomain. A first-party cookieless counter stores only daily aggregates (not IP, cookies, or poll IDs).",
          "App info & performance: basic request logs via hosting (IP, user agent) for delivery and abuse prevention.",
          "Financial info: not collected by HappyVote (on-chain fee payments are handled by your wallet / network).",
          "Personal info: wallet addresses you choose to connect; optional ZKPassport unique identifier / eligibility signals — not government ID images.",
          "Messages / photos / files: not collected by the Service UI.",
        ],
      },
      {
        heading: "Data shared",
        bullets: [
          "With blockchain networks and explorers when you submit or view on-chain activity (public by design for public state).",
          "With RPC, hosting, ZKPassport, and wallet providers as needed to operate features you invoke.",
          "Not sold to data brokers or advertisers.",
        ],
      },
      {
        heading: "Security practices",
        bullets: [
          "HTTPS in production; security headers (CSP, COOP/COEP where required for proving, clickjacking protections).",
          "Admin deploy keys are not written to localStorage by the import UI; clear the tab after admin use.",
          "Camera/microphone/geolocation are disabled via Permissions-Policy on the host configuration.",
          "No system can eliminate all risk on a public testnet or when you expose keys.",
        ],
      },
      {
        heading: "Data deletion",
        bullets: [
          "You can delete local site data in the browser at any time.",
          "On-chain votes and tallies generally cannot be erased by HappyVote.",
          "To request deletion of off-chain logs we control, contact legal@happyvote.xyz (we will confirm what is technically feasible).",
        ],
      },
      {
        heading: "Children",
        paragraphs: [
          "Not intended for children under 16 (or higher age required locally).",
        ],
      },
    ],
  },

  gdpr: {
    title: "GDPR & Your Rights",
    intro:
      "If the EU General Data Protection Regulation (GDPR) or UK GDPR applies to you, this notice explains your rights regarding personal data processed in connection with HappyVote on Aztec. It supplements the Privacy Policy.",
    sections: [
      {
        heading: "1. Controller",
        paragraphs: [
          `For personal data we determine the purposes of (for example site hosting logs and off-chain poll metadata we publish), the controller is the HappyVote project operator. Contact: ${LEGAL_CONTACT}. Independent controllers (Aztec Labs RPC, ZKPassport, wallet vendors, explorers) process data under their own roles when you use them.`,
        ],
      },
      {
        heading: "2. Categories of personal data",
        paragraphs: [
          "Depending on how you use the Service: IP address and request metadata processed by the host (and, for visit totals, used ephemerally to derive a country and a same-day uniqueness hash, then discarded); aggregated visit statistics that we do not treat as identifying; wallet address; on-chain activity linked to an open vote; ZKPassport-derived identifiers/proofs; and any data you put in poll metadata fields.",
        ],
      },
      {
        heading: "3. Your rights",
        bullets: [
          "Access — ask whether we process personal data about you and receive a copy of what we hold off-chain.",
          "Rectification — correct inaccurate off-chain personal data we control.",
          "Erasure — request deletion of off-chain data we control (“right to be forgotten”), subject to legal exceptions.",
          "Restriction & objection — in certain cases, limit or object to processing based on legitimate interests.",
          "Portability — receive structured data you provided to us in a common format, where applicable.",
          "Withdraw consent — where processing is consent-based. You can also clear site cookies and storage.",
          "Complaint — lodge a complaint with your local supervisory authority.",
        ],
      },
      {
        heading: "4. Limits for blockchain data",
        paragraphs: [
          "GDPR rights do not always allow erasure of data that has been published to a public blockchain. Nullifiers, tallies, and open votes may remain network-wide. We will explain what we can and cannot change when you contact us.",
        ],
      },
      {
        heading: "5. International transfers",
        paragraphs: [
          "Infrastructure providers may process data in the EU, UK, US, or other regions. Where required, transfers rely on appropriate safeguards used by those providers (for example Standard Contractual Clauses).",
        ],
      },
      {
        heading: "6. How to exercise rights",
        paragraphs: [
          `Email ${LEGAL_CONTACT} with “GDPR request” in the subject, your wallet address or other identifiers relevant to the request, and what you want us to do. We may need to verify the request. We aim to respond within one month, or as required by law.`,
        ],
      },
    ],
  },
};
