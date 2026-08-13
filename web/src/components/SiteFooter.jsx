import { LEGAL_NAV } from "../lib/legalDocs.js";
import { legalPath, navigate } from "../lib/routing.js";

const AUTHOR_LINKS = [
  { label: "X", href: "https://x.com/pittpv" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/peter-ploskikh/" },
  { label: "GitHub", href: "https://github.com/pittpv/" },
];

const AZTEC_LINKS = [
  { label: "Aztec Network", href: "https://aztec.network/?utm_source=pittpv" },
  { label: "Aztec X", href: "https://x.com/aztecnetwork" },
];

export function SiteFooter({ disclaimer }) {
  return (
    <footer className="site-footer">
      {disclaimer ? <p className="disclaimer">{disclaimer}</p> : null}

      <div className="footer-bar">
        <div className="footer-start">
          <div className="footer-author">
            <p className="footer-author-label">Built by Peter Ploskikh</p>
            <nav className="author-nav" aria-label="Author">
              {AUTHOR_LINKS.map((item) => (
                <a
                  key={item.href}
                  className="author-nav-link"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <nav className="legal-nav" aria-label="Legal">
            {LEGAL_NAV.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="legal-nav-link"
                onClick={() => navigate(legalPath(item.slug))}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <nav className="footer-aztec" aria-label="Aztec">
          {AZTEC_LINKS.map((item) => (
            <a
              key={item.href}
              className="author-nav-link"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
