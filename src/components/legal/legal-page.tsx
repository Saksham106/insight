import Link from "next/link";

import "./legal-page.css";

interface LegalPageProps {
  title: string;
  description: string;
  effectiveDate: string;
  sections: readonly { id: string; label: string }[];
  children: React.ReactNode;
}

export function LegalPage({
  title,
  description,
  effectiveDate,
  sections,
  children,
}: LegalPageProps) {
  return (
    <div className="legal-site-shell">
      <header className="legal-nav-shell">
        <nav className="legal-nav" aria-label="Main navigation">
          <Link href="/" className="legal-brand">
            Insight Academy
          </Link>
          <Link href="/login" className="legal-login-link">
            Log in
          </Link>
        </nav>
      </header>

      <main className="legal-main">
        <header className="legal-hero">
          <p className="legal-eyebrow">MyInsightAcademy</p>
          <h1>{title}</h1>
          <p className="legal-description">{description}</p>
          <p className="legal-effective-date">
            <strong>Effective:</strong> {effectiveDate}
          </p>
        </header>

        <div className="legal-layout">
          <aside className="legal-toc" aria-label="On this page">
            <p className="legal-toc-title">On this page</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.label}</a>
                </li>
              ))}
            </ol>
          </aside>

          <article className="legal-document">
            <div className="legal-review-notice" role="note">
              <strong>Legal review notice.</strong> This document is a draft and
              should be reviewed by a qualified lawyer familiar with Vietnam and
              relevant international privacy and consumer law before publication.
            </div>
            {children}
          </article>
        </div>
      </main>

      <footer className="legal-footer-shell">
        <div className="legal-footer">
          <span className="legal-footer-brand">Insight Academy</span>
          <nav aria-label="Legal and contact links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@myinsightacademy.com">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
