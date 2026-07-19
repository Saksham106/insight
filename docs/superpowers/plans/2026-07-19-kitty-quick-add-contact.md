# Kitty Quick Add Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable one-contact form to the Kitty dashboard that creates a consent-attested Academy WhatsApp contact through the existing admin API.

**Architecture:** A new focused client component owns form state and posts to the existing `POST /api/admin/hermes/contacts` route. The dashboard renders it above the unchanged vCard importer; the server remains the authority for normalization, duplicate rejection, consent, and audit behavior.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase, Node test runner, ESLint

## Global Constraints

- Keep the vCard importer unchanged.
- Require name, phone, one supported role, and explicit consent before submission.
- Retain the default calling code after success and clear all other fields.
- Keep validation, phone normalization, duplicate rejection, consent persistence, and audit recording on the existing server route.
- Do not add dependencies, schema changes, profile matching, or multi-row entry.

---

### Task 1: Quick Add Contact Form

**Files:**
- Create: `src/components/admin/hermes-contact-quick-add.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: `POST /api/admin/hermes/contacts` with `{ displayName, phone, defaultCallingCode, role, consentAttested }`.
- Produces: `HermesContactQuickAdd`, an always-visible client form that refreshes the current route after a successful `201` response.

- [ ] **Step 1: Write the failing contract test**

Add a test that reads `hermes-contact-quick-add.tsx` and asserts that it contains the five role labels, consent copy, `/api/admin/hermes/contacts`, `router.refresh()`, and state resets for name, phone, role, and consent. Assert the dashboard imports and renders `HermesContactQuickAdd` before `HermesContactImport`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`

Expected: FAIL because `src/components/admin/hermes-contact-quick-add.tsx` does not exist.

- [ ] **Step 3: Implement the minimal client component**

Create a client component with controlled name, phone, calling-code, role, consent, loading, and status state. Render semantic labels and existing `Input`, `Button`, `Card`, and `Label` components. On submit, post JSON to the existing route. On `201`, clear name, phone, role, and consent; keep the calling code; display `Contact added successfully.`; and call `router.refresh()`. On failure, display the returned safe error without clearing fields.

- [ ] **Step 4: Render the form on the Kitty dashboard**

Import `HermesContactQuickAdd` in `hermes-assistant-dashboard.tsx` and render it immediately before `HermesContactImport`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`

Expected: all Kitty admin dashboard tests pass.

- [ ] **Step 6: Run focused lint and production verification**

Run: `npx eslint src/components/admin/hermes-contact-quick-add.tsx src/components/admin/hermes-assistant-dashboard.tsx src/components/admin/hermes-assistant-dashboard.test.cjs`

Run: `npm run build`

Expected: both commands exit `0` with no errors.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/admin/hermes-contact-quick-add.tsx src/components/admin/hermes-assistant-dashboard.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat(admin): quick add Kitty contacts"
```
