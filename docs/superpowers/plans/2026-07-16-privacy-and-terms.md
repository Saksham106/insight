# MyInsightAcademy Privacy and Terms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production-ready, public Privacy Policy and Terms of Service pages that accurately disclose MyInsightAcademy's verified website, tutoring, WhatsApp, and AI practices.

**Architecture:** Add two statically prerendered App Router pages that share a server-rendered legal-document shell. Keep legal prose directly in route components for reviewability, reuse only navigation/document/footer presentation, and add source-contract tests before production code.

**Tech Stack:** Next.js 16.2 App Router, React 19.2 Server Components, TypeScript, Tailwind theme tokens, Node test runner, Playwright/agent-browser verification.

## Global Constraints

- Read relevant installed documentation in `node_modules/next/dist/docs/` before editing Next.js routes.
- Effective date is July 16, 2026.
- Do not invent a legal entity type, registered address, fixed retention period, unverified service provider, or security guarantee.
- Name only verified providers: Supabase, Vercel, Resend, Meta/WhatsApp, OpenAI, and Anthropic.
- Do not add analytics, advertising, payment processing, consent dark patterns, or pre-checked consent.
- Do not deploy or publish.
- Preserve public access without login and provide canonical URLs under `https://myinsightacademy.com`.
- State that the drafts require review by a qualified lawyer familiar with Vietnam and relevant international privacy law.

---

### Task 1: Legal-page contract tests

**Files:**
- Create: `src/app/legal-pages.test.cjs`

**Interfaces:**
- Consumes: route files at `src/app/(public)/privacy/page.tsx` and `src/app/(public)/terms/page.tsx`, landing page at `src/app/(public)/page.tsx`.
- Produces: an executable source contract enforcing public route content, metadata, contact details, provider disclosures, effective date, and footer links.

- [ ] **Step 1: Write the failing test**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const appDir = __dirname;
const read = (...parts) => fs.readFileSync(path.join(appDir, ...parts), "utf8");

test("privacy route includes metadata and required disclosures", () => {
  const src = read("(public)", "privacy", "page.tsx");
  assert.match(src, /Privacy Policy \| MyInsightAcademy/);
  assert.match(src, /https:\/\/myinsightacademy\.com\/privacy/);
  for (const phrase of ["July 16, 2026", "WhatsApp", "Hermes", "OpenAI", "Anthropic", "Supabase", "Vercel", "Resend", "local storage", "hello@myinsightacademy.com"]) {
    assert.ok(src.includes(phrase), `privacy page missing ${phrase}`);
  }
});

test("terms route includes metadata and required provisions", () => {
  const src = read("(public)", "terms", "page.tsx");
  assert.match(src, /Terms of Service \| MyInsightAcademy/);
  assert.match(src, /https:\/\/myinsightacademy\.com\/terms/);
  for (const phrase of ["July 16, 2026", "12 years old", "monthly", "reschedul", "WhatsApp", "AI", "Vietnam", "hello@myinsightacademy.com"]) {
    assert.ok(src.toLowerCase().includes(phrase.toLowerCase()), `terms page missing ${phrase}`);
  }
});

test("public footer links to both legal routes", () => {
  const src = read("(public)", "page.tsx");
  assert.match(src, /href="\/privacy"/);
  assert.match(src, /href="\/terms"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/app/legal-pages.test.cjs`
Expected: FAIL because the privacy and terms route files do not exist.

- [ ] **Step 3: Do not add production code in this task**

The failing test is the deliverable and establishes the red state for Tasks 2–4.

---

### Task 2: Shared legal document shell

**Files:**
- Create: `src/components/legal/legal-page.tsx`
- Create: `src/components/legal/legal-page.css`

**Interfaces:**
- Consumes: `React.ReactNode`, Next.js `Link`, existing CSS theme tokens.
- Produces: `LegalPage({ title, description, effectiveDate, sections, children })` where `sections` is `readonly { id: string; label: string }[]`.

- [ ] **Step 1: Implement the minimal shared shell**

```tsx
import Link from "next/link";
import "./legal-page.css";

interface LegalPageProps {
  title: string;
  description: string;
  effectiveDate: string;
  sections: readonly { id: string; label: string }[];
  children: React.ReactNode;
}

export function LegalPage({ title, description, effectiveDate, sections, children }: LegalPageProps) {
  return (
    <div className="legal-site-shell">
      <header className="legal-nav"><nav aria-label="Main navigation"><Link href="/">Insight Academy</Link><Link href="/login">Log in</Link></nav></header>
      <main className="legal-main">
        <header className="legal-hero"><p>MyInsightAcademy</p><h1>{title}</h1><p>{description}</p><p>Effective: {effectiveDate}</p></header>
        <div className="legal-layout">
          <aside className="legal-toc" aria-label="On this page"><p>On this page</p><ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>)}</ol></aside>
          <article className="legal-document">{children}</article>
        </div>
      </main>
      <footer className="legal-footer"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="mailto:hello@myinsightacademy.com">Contact</a></footer>
    </div>
  );
}
```

- [ ] **Step 2: Add responsive presentation**

Implement CSS using existing background, surface, border, navy, slate, muted,
gold, and typography tokens. Use a two-column table-of-contents/document layout
above 900px, one column below 900px, a readable document width, visible focus
styles, scroll margins on headings, wrapping links, and mobile padding at 24px.

- [ ] **Step 3: Run lint and type checking for the new shell**

Run: `npm run lint -- src/components/legal/legal-page.tsx`
Expected: exit 0.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

### Task 3: Privacy Policy route

**Files:**
- Create: `src/app/(public)/privacy/page.tsx`

**Interfaces:**
- Consumes: `LegalPage` and Next.js `Metadata`.
- Produces: static `/privacy` route with canonical `https://myinsightacademy.com/privacy`.

- [ ] **Step 1: Add route metadata and section navigation**

```tsx
export const metadata: Metadata = {
  title: "Privacy Policy | MyInsightAcademy",
  description: "Learn how MyInsightAcademy collects, uses, shares, and protects information across its tutoring platform, WhatsApp, and AI-assisted services.",
  alternates: { canonical: "https://myinsightacademy.com/privacy" },
};
```

Define stable IDs for: scope, information collected, WhatsApp and AI, cookies
and logs, uses and legal bases, sharing/providers, international transfers,
retention, security, rights/deletion, children, changes, and contact.

- [ ] **Step 2: Write complete policy prose from the approved specification**

Use semantic `section`, `h2`, `h3`, `p`, `ul`, `ol`, `a`, and `strong`
elements. Include every Privacy Policy requirement from the specification and
explicitly distinguish verified current implementation from provider-controlled
processing. Use purpose-based retention criteria and actionable deletion steps.

- [ ] **Step 3: Run the contract test**

Run: `node --test src/app/legal-pages.test.cjs`
Expected: Privacy assertions pass; Terms/footer assertions still fail.

---

### Task 4: Terms route and landing footer

**Files:**
- Create: `src/app/(public)/terms/page.tsx`
- Modify: `src/app/(public)/page.tsx`

**Interfaces:**
- Consumes: `LegalPage`, Next.js `Metadata`, existing landing footer.
- Produces: static `/terms` route with canonical `https://myinsightacademy.com/terms` and visible legal links on the public landing page.

- [ ] **Step 1: Add route metadata and complete Terms prose**

```tsx
export const metadata: Metadata = {
  title: "Terms of Service | MyInsightAcademy",
  description: "Review the terms that govern MyInsightAcademy tutoring, scheduling, messaging, WhatsApp, and AI-assisted services.",
  alternates: { canonical: "https://myinsightacademy.com/terms" },
};
```

Cover acceptance; minimum age 12 and parental consent; student, parent, tutor,
and account duties; scheduling and case-by-case rescheduling; monthly invoices;
acceptable use; chat/files; intellectual property and limited user-content
license; WhatsApp consent; AI inaccuracy and high-risk-use prohibitions;
third-party services; availability; suspension; disclaimers; non-excludable
rights; reasonable non-numeric liability limitation; narrow adult/tutor
indemnity; Vietnam law and informal dispute contact; changes; and contact.

- [ ] **Step 2: Add landing-footer links**

Keep the existing brand and descriptor, and add a footer navigation with Next.js
links to `/privacy` and `/terms` using existing small navy/muted typography.

- [ ] **Step 3: Run the contract test to green**

Run: `node --test src/app/legal-pages.test.cjs`
Expected: 3 tests pass, 0 fail.

---

### Task 5: Full verification and browser review

**Files:**
- Verify all files changed by Tasks 1–4.

**Interfaces:**
- Consumes: complete project and local production server.
- Produces: fresh evidence for tests, lint, types, build, public HTTP 200, metadata, desktop/mobile presentation, and accessibility basics.

- [ ] **Step 1: Run automated verification**

Run: `node --test $(find src -name '*.test.cjs' -print)`
Expected: all repository tests pass.

Run: `npm run lint`
Expected: exit 0 with no lint errors.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0; `/privacy` and `/terms` are listed as static routes.

- [ ] **Step 2: Start the production server and verify HTTP**

Run: `npm run start -- -p 3100`

Run: `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3100/privacy`
Expected: `200`.

Run: `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3100/terms`
Expected: `200`.

- [ ] **Step 3: Verify in a browser**

At 1440×1000 and 390×844, verify both routes contain meaningful content, have
no horizontal overflow or framework error overlay, show the correct h1 and
footer links, expose canonical metadata, and allow table-of-contents navigation.

- [ ] **Step 4: Run the React best-practices review**

Check semantic elements, named shared-component export, props typing, no client
hooks, accessible navigation, stable section keys, no unnecessary JavaScript,
and design-token consistency. Apply only focused fixes and rerun affected
verification.

- [ ] **Step 5: Review final diff against the specification**

Confirm every requested Privacy and Terms topic is present; list all factual
statements against verified code/user context; confirm there is no registered
address, fixed retention duration, payment processor, analytics provider,
security guarantee, or deployment action.
