# Unified Invite Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three separate admin invite cards (teacher/student/parent) with one card that has a Teacher · Student · Parent role selector.

**Architecture:** A single client component `InviteUserForm` holds a `role` state (segmented control) plus the existing name/email fields, and posts to the unchanged `/api/admin/invite-user` endpoint. The three old form components and their 2-up grid wrapper are deleted.

**Tech Stack:** Next.js 16 (App Router), React client components, TypeScript. Styling via inline `style={{}}` objects (this project does not generate positional/layout Tailwind utilities — always use inline styles for grid/flex/gap/etc.).

## Global Constraints

- Layout/positional styling MUST use inline `style={{}}`, not Tailwind utility classes (project convention).
- No API route changes: `/api/admin/invite-user` already accepts and validates `role ∈ {teacher, student, parent, admin}`.
- No Supabase migrations or schema changes.
- No email-deliverability / activation-tracking / resend-visibility work — explicitly out of scope (handled separately).
- Preserve every existing form behavior verbatim: `409 alreadyActive` warning, `409 alreadyInvited` → resend button, `emailError` → reveal password, success → reveal password + reset + `router.refresh()`.
- Test gate for this UI-only workstream: `npm run lint` and `npm run build` pass, plus manual E2E. No component unit test (no RTL/jsdom harness exists in this repo).

---

### Task 1: Create the unified `InviteUserForm` component

**Files:**
- Create: `src/components/admin/invite-user-form.tsx`

**Interfaces:**
- Consumes: `Button`, `Card/CardContent/CardHeader/CardTitle`, `Input`, `Label` from `@/components/ui/*`; `useRouter` from `next/navigation`.
- Produces: `export function InviteUserForm()` — a self-contained card, no props.

- [ ] **Step 1: Write the component**

Create `src/components/admin/invite-user-form.tsx` with this exact content:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "teacher" | "student" | "parent";

const ROLES: { value: Role; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

export function InviteUserForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error">("success");
  const [pendingResend, setPendingResend] = useState<{ email: string; fullName: string; role: Role } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setPendingResend(null);
    setGeneratedPassword(null);
    setLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 409 && data.alreadyActive) {
      setStatusType("warning");
      setStatus(data.error ?? "This user already has an active account and can log in directly.");
      return;
    }

    if (response.status === 409 && data.alreadyInvited) {
      setPendingResend({ email, fullName, role });
      setStatusType("warning");
      setStatus("This user was invited but hasn't logged in yet.");
      return;
    }

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to send invite.");
      return;
    }

    if (data.emailError) {
      setStatusType("warning");
      setStatus("Account created, but the email failed to send. Share the password below manually.");
    } else {
      setStatusType("success");
      setStatus("Account created and credentials emailed.");
    }
    setGeneratedPassword(data.password ?? null);
    setFullName("");
    setEmail("");
    router.refresh();
  };

  const handleResend = async () => {
    if (!pendingResend) return;
    setResendLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pendingResend, resend: true }),
    });

    const data = await response.json();
    setResendLoading(false);
    setPendingResend(null);

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    if (data.emailError) {
      setStatusType("warning");
      setStatus("Credentials reset, but the email failed to send. Share the password below manually.");
    } else {
      setStatusType("success");
      setStatus("Credentials resent.");
    }
    setGeneratedPassword(data.password ?? null);
  };

  const statusColor = statusType === "error" ? "text-error" : statusType === "warning" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite user</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-role">Role</Label>
            <div
              id="invite-role"
              role="group"
              aria-label="Role"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              {ROLES.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRole(option.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: selected ? "1px solid var(--color-navy)" : "1px solid var(--color-border)",
                      background: selected ? "var(--color-navy)" : "var(--color-surface)",
                      color: selected ? "#ffffff" : "var(--color-navy)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {status ? <p className={`text-sm ${statusColor}`}>{status}</p> : null}
          {generatedPassword ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
              }}
            >
              <p className="text-sm" style={{ margin: 0 }}>
                If the email doesn&apos;t arrive, share this password directly:{" "}
                <strong style={{ fontFamily: "monospace" }}>{generatedPassword}</strong>
              </p>
              <button
                type="button"
                onClick={() => setGeneratedPassword(null)}
                className="text-sm text-muted"
                style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {pendingResend ? (
            <Button
              type="button"
              variant="outline"
              disabled={resendLoading}
              onClick={handleResend}
            >
              {resendLoading ? "Resending..." : "Resend credentials"}
            </Button>
          ) : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Note: the `--color-navy` / `--color-border` / `--color-surface` CSS variables are already used elsewhere in this repo (see `create-student-form.tsx` and the settings styling). If `--color-navy` is not defined as a CSS variable, fall back to the literal `#1b3560` used in the email templates — verify by grepping `--color-navy` before committing.

- [ ] **Step 2: Verify the file type-checks in isolation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep invite-user-form || echo "no type errors in invite-user-form"`
Expected: `no type errors in invite-user-form`

- [ ] **Step 3: Confirm the navy CSS variable exists (or fix the fallback)**

Run: `rg -n "\-\-color-navy" src | head`
Expected: at least one match. If none, replace `var(--color-navy)` occurrences in the new file with `#1b3560`.

---

### Task 2: Wire the card into the dashboard and delete the old forms

**Files:**
- Modify: `src/components/admin/admin-dashboard.tsx`
- Delete: `src/components/admin/create-teacher-form.tsx`
- Delete: `src/components/admin/create-student-form.tsx`
- Delete: `src/components/admin/create-parent-form.tsx`
- Delete: `src/components/admin/admin-forms-grid.tsx`

**Interfaces:**
- Consumes: `InviteUserForm` from Task 1 (`@/components/admin/invite-user-form`).

- [ ] **Step 1: Confirm the four files to delete have no other importers**

Run: `rg -n "create-teacher-form|create-student-form|create-parent-form|admin-forms-grid|CreateTeacherForm|CreateStudentForm|CreateParentForm|AdminFormsGrid" src`
Expected: matches ONLY in `admin-dashboard.tsx` (the imports/usages we are about to replace) and within the files being deleted themselves. If any OTHER file imports them, stop and reassess.

- [ ] **Step 2: Update `admin-dashboard.tsx` imports**

Remove these four import lines:
```tsx
import { AdminFormsGrid } from "@/components/admin/admin-forms-grid";
import { CreateParentForm } from "@/components/admin/create-parent-form";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { CreateTeacherForm } from "@/components/admin/create-teacher-form";
```
Add this import (keep imports alphabetically grouped with the other `@/components/admin/*` imports):
```tsx
import { InviteUserForm } from "@/components/admin/invite-user-form";
```

- [ ] **Step 3: Replace the three-card grid in the Users view**

Find this block (around line 176-180):
```tsx
          <AdminFormsGrid>
            <CreateTeacherForm />
            <CreateStudentForm />
            <CreateParentForm />
          </AdminFormsGrid>
```
Replace it with:
```tsx
          <InviteUserForm />
```

- [ ] **Step 4: Delete the four obsolete files**

Run:
```bash
git rm src/components/admin/create-teacher-form.tsx \
       src/components/admin/create-student-form.tsx \
       src/components/admin/create-parent-form.tsx \
       src/components/admin/admin-forms-grid.tsx
```

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed with no errors referencing the deleted files or `InviteUserForm`.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/invite-user-form.tsx src/components/admin/admin-dashboard.tsx
git commit -m "feat: unify teacher/student/parent invite cards into one card with role selector"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the app and exercise the flow**

Run: `npm run dev`, log in as the admin, go to the Users view.
Verify:
- One "Invite user" card with a Teacher · Student · Parent segmented selector (Student selected by default).
- Selecting a role highlights that segment (navy fill).
- Inviting a brand-new test email as each role creates a `profiles` row with the matching `role` (check via Supabase or the Teachers/Students/Parents tables refreshing).
- Re-inviting an already-active user shows the "already has an active account" warning.
- Re-inviting a pending (never-logged-in) user shows the "Resend credentials" button and resend succeeds.
- The generated-password reveal panel appears and dismisses.

- [ ] **Step 2: Clean up test users**

Delete any throwaway test accounts created during Step 1 from the admin Users tables (or via Supabase) so production data stays clean.

---

## Notes for the executor

- If `admin-dashboard.tsx` line numbers have drifted, locate the block by the `<AdminFormsGrid>` JSX tag rather than by line number.
- Do not touch `/api/admin/invite-user`, any Supabase migration, or any email code — out of scope for this workstream.
