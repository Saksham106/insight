# Invite System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the magic-link/PKCE invite flow with immediate account creation: inviting a user creates a working Supabase auth account with a generated password on the spot, emailed to them, with no link to click or token to expire.

**Architecture:** `POST /api/admin/invite-user` stops calling `inviteUserByEmail`/`generateLink` and instead calls `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` directly. A new `get_invite_user_state` RPC replaces `user_has_password` to decide, on a duplicate email, whether it's safe to regenerate credentials (never logged in) or must be blocked (already active). `profiles.password_set_at` is repurposed to mean "user manually changed their initial password," now also stamped from the authenticated Settings → Password flow.

**Tech Stack:** Next.js App Router route handlers, Supabase (`@supabase/supabase-js` admin client), Resend, Postgres migrations under `supabase/migrations/`. No test runner is configured in `package.json` — this repo's existing convention (`src/lib/onboarding-status.test.cjs`) is a plain Node `node:test` file with a TypeScript require-hook, executed directly with `node <path>`. Follow that same pattern for new tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-invite-system-redesign-design.md` — read it first for full rationale.
- Do not touch `/set-password`, `/auth/callback`, or `/forgot-password` — separate, working flow, explicitly out of scope.
- Password generator: exactly 10 characters, alphanumeric only (no symbols), excludes ambiguous characters `0`, `O`, `1`, `l`, `I`, guarantees at least one uppercase/lowercase/digit, uses `node:crypto` (`randomInt`), never `Math.random`.
- Duplicate-email safety gate is load-bearing: an existing user is only ever safe to regenerate a password for if `last_sign_in_at IS NULL` **and** `password_set_at IS NULL`. If either is set, block with `409 { alreadyActive: true }` and touch nothing.
- Every `NextResponse.json` error path returns the same shape already used in the codebase: `{ error: string }` (plus flow-specific booleans like `alreadyActive`/`alreadyInvited`).
- Verify TypeScript compiles after every task: `npx tsc --noEmit` from the repo root.

---

### Task 1: Password generator

**Files:**
- Create: `src/lib/auth/generate-temp-password.ts`
- Test: `src/lib/auth/generate-temp-password.test.cjs`

**Interfaces:**
- Produces: `generateTempPassword(): string` — exported from `src/lib/auth/generate-temp-password.ts`. Task 3 imports this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/generate-temp-password.test.cjs`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const {
  generateTempPassword,
} = require(path.join(__dirname, "generate-temp-password.ts"));

const ALLOWED = /^[A-HJ-NP-Za-hj-km-z2-9]+$/;

test("generates a 10 character password", () => {
  const password = generateTempPassword();
  assert.equal(password.length, 10);
});

test("only uses allowed, non-ambiguous characters", () => {
  const password = generateTempPassword();
  assert.match(password, ALLOWED);
  assert.doesNotMatch(password, /[0O1lI]/);
});

test("always contains at least one uppercase, one lowercase, and one digit", () => {
  for (let i = 0; i < 50; i++) {
    const password = generateTempPassword();
    assert.match(password, /[A-HJ-NP-Z]/, `no uppercase in ${password}`);
    assert.match(password, /[a-hj-km-z]/, `no lowercase in ${password}`);
    assert.match(password, /[2-9]/, `no digit in ${password}`);
  }
});

test("is randomized across calls", () => {
  const passwords = new Set();
  for (let i = 0; i < 20; i++) {
    passwords.add(generateTempPassword());
  }
  assert.ok(passwords.size > 1, "expected more than one unique password across 20 calls");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/auth/generate-temp-password.test.cjs`
Expected: FAIL — `Cannot find module '.../generate-temp-password.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/generate-temp-password.ts`:

```ts
import { randomInt } from "node:crypto";

// Excludes 0/O, 1/l/I — visually ambiguous when typed or read off a screen.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

const PASSWORD_LENGTH = 10;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

export function generateTempPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];

  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/auth/generate-temp-password.test.cjs`
Expected: PASS (4 tests, 0 failures)

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/lib/auth/generate-temp-password.ts src/lib/auth/generate-temp-password.test.cjs
git commit -m "feat: add temp password generator for invite redesign"
```

---

### Task 2: Database migration — `get_invite_user_state` RPC

**Files:**
- Create: `supabase/migrations/20260703000001_add_get_invite_user_state_rpc.sql`

**Interfaces:**
- Produces: RPC `public.get_invite_user_state(p_email text)` returning zero or one row of `{ auth_user_id uuid, last_sign_in_at timestamptz, password_set_at timestamptz }`. Task 3 calls this via `supabaseAdmin.rpc("get_invite_user_state", { p_email: email }).maybeSingle()`.
- Drops `public.user_has_password` (only caller was the invite route being rewritten in Task 3).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260703000001_add_get_invite_user_state_rpc.sql`:

```sql
-- Replaces user_has_password: the invite redesign needs more than a boolean —
-- it needs to know whether an existing account has ever been used at all
-- (last_sign_in_at) or had its password manually changed (profiles.password_set_at),
-- so a duplicate invite can safely regenerate credentials for a never-used
-- account while refusing to touch an active one.
drop function if exists public.user_has_password(text);

create or replace function public.get_invite_user_state(p_email text)
returns table (
  auth_user_id uuid,
  last_sign_in_at timestamptz,
  password_set_at timestamptz
)
language sql
security definer
set search_path = auth, public
as $$
  select u.id, u.last_sign_in_at, p.password_set_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;
```

- [ ] **Step 2: Apply the migration**

If working against a local Supabase instance: `supabase db reset` (or `supabase migration up` if only applying new migrations). If working against the hosted project via the `mcp__supabase__apply_migration` tool, apply it there instead — confirm which environment you have access to before running either.

- [ ] **Step 3: Verify the RPC**

Run against the connected DB (psql, Supabase SQL editor, or `mcp__supabase__execute_sql`):

```sql
select * from public.get_invite_user_state('nonexistent@example.com');
```

Expected: 0 rows, no error.

```sql
select * from public.user_has_password('anything@example.com');
```

Expected: error — function does not exist (confirms the drop took effect).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260703000001_add_get_invite_user_state_rpc.sql
git commit -m "feat: add get_invite_user_state RPC, drop user_has_password"
```

---

### Task 3: Rewrite the invite-user route

**Files:**
- Modify: `src/app/api/admin/invite-user/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `generateTempPassword(): string` from Task 1; RPC `get_invite_user_state` from Task 2; `getEmailFrom(): string` from `src/lib/email/from.ts` (existing).
- Produces: `POST /api/admin/invite-user` now returns `{ userId: string, password: string }` on success (200) — the `password` field is new and consumed by Task 7 (admin forms) and Task 8 (admin tables, for the resend action). Error/conflict shapes unchanged: `409 { alreadyActive: true, error }`, `409 { alreadyInvited: true }`, `4xx/5xx { error: string }`.

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/app/api/admin/invite-user/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { generateTempPassword } from "@/lib/auth/generate-temp-password";
import { getEmailFrom } from "@/lib/email/from";
import { createAdminClient } from "@/lib/supabase/admin";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function buildCredentialsEmail(fullName: string, email: string, password: string, loginUrl: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${NAVY};">You've been invited</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:0 36px 32px;">
        <p style="color:#374151;line-height:1.6;margin:16px 0;">Hi ${fullName},</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 24px;">You've been invited to Insight Academy. Here's how to log in:</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#f9fafb;border:1px solid ${BORDER};border-radius:8px 8px 0 0;font-size:13px;color:${MUTED};">Email</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 10px;border:1px solid ${BORDER};border-top:none;font-size:14px;font-weight:600;color:${NAVY};">${email}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#f9fafb;border:1px solid ${BORDER};border-top:none;font-size:13px;color:${MUTED};">Password</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 10px;border:1px solid ${BORDER};border-top:none;border-radius:0 0 8px 8px;font-size:14px;font-weight:600;color:${NAVY};font-family:monospace;">${password}</td>
          </tr>
        </table>
        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:${NAVY};color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
          Log in →
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:${MUTED};">For security, we recommend changing your password after logging in (Settings → Password).</p>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">If you weren't expecting this invitation, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendCredentialsEmail(fullName: string, email: string, password: string, origin: string) {
  if (!process.env.RESEND_API_KEY) {
    return { error: "Email not configured — cannot send invite." };
  }

  const resendClient = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resendClient.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: "Your Insight Academy login",
    html: buildCredentialsEmail(fullName, email, password, `${origin}/login`),
  });

  if (error) {
    return { error: "Failed to send invite email." };
  }

  return { error: null };
}

interface InviteUserState {
  auth_user_id: string;
  last_sign_in_at: string | null;
  password_set_at: string | null;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.toString().trim();
  const fullName = body.fullName?.toString().trim();
  const role = body.role?.toString().trim();

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["teacher", "student", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const isResend = body.resend === true;
  const origin = new URL(request.url).origin;
  const supabaseAdmin = createAdminClient();

  const { data: inviteState, error: rpcError } = await supabaseAdmin
    .rpc("get_invite_user_state", { p_email: email })
    .maybeSingle<InviteUserState>();

  if (rpcError) {
    return NextResponse.json({ error: "Failed to look up existing user." }, { status: 500 });
  }

  const isActive = Boolean(inviteState?.last_sign_in_at) || Boolean(inviteState?.password_set_at);

  if (inviteState && isActive) {
    return NextResponse.json(
      { alreadyActive: true, error: "This user already has an active account and can log in directly." },
      { status: 409 },
    );
  }

  if (inviteState && !isResend) {
    // Exists, never used — admin must explicitly confirm the resend action.
    return NextResponse.json({ alreadyInvited: true }, { status: 409 });
  }

  const password = generateTempPassword();

  if (inviteState) {
    // Never-used existing account — safe to regenerate credentials.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(inviteState.auth_user_id, {
      password,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message ?? "Failed to reset credentials." }, { status: 500 });
    }

    const { error: emailError } = await sendCredentialsEmail(fullName, email, password, origin);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 500 });
    }

    await supabaseAdmin
      .from("profiles")
      .update({ invite_sent_at: new Date().toISOString() })
      .eq("id", inviteState.auth_user_id);

    revalidateTag("admin-dashboard", "max");
    revalidateTag("dashboard", "max");

    return NextResponse.json({ userId: inviteState.auth_user_id, password });
  }

  // Brand-new user — create the account with a working password immediately.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Invite failed" }, { status: 500 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "Invite failed" }, { status: 500 });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: data.user.id,
      full_name: fullName,
      role,
      is_active: true,
      invite_sent_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return NextResponse.json(
      { error: "The account was created, but saving the profile failed. Please try inviting again." },
      { status: 500 },
    );
  }

  const { error: emailError } = await sendCredentialsEmail(fullName, email, password, origin);

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  if (emailError) {
    return NextResponse.json({ userId: data.user.id, password, emailError });
  }

  return NextResponse.json({ userId: data.user.id, password });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `.maybeSingle<InviteUserState>()` errors on the generic, drop the generic and instead cast: `(inviteState as InviteUserState | null)` — check the installed `@supabase/supabase-js@^2.105.4` types for `PostgrestFilterBuilder.maybeSingle` before deciding; both are equivalent at runtime.

- [ ] **Step 3: Manual verification (requires a dev server and Supabase project with `RESEND_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` configured)**

Run: `npm run dev`, then from the admin Users page:
1. Invite a brand-new email → expect a 200 response, an email containing a real password, and the ability to log in at `/login` immediately with those credentials.
2. Invite the same email again without `resend` → expect `409 { alreadyInvited: true }`.
3. Invite the same email again with `resend: true` → expect a 200 with a **different** password than step 1, and the old password no longer works for login.
4. Log in as the user from step 3, then repeat the invite for their email → expect `409 { alreadyActive: true }`, and confirm their password still works afterward (i.e. nothing was touched).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/invite-user/route.ts
git commit -m "feat: create invite accounts immediately with a generated password"
```

---

### Task 4: Rewrite onboarding status logic

**Files:**
- Modify: `src/lib/onboarding-status.ts` (full rewrite)
- Modify: `src/lib/onboarding-status.test.cjs` (full rewrite)

**Interfaces:**
- Produces: `getOnboardingStatus(user: OnboardingFields): OnboardingStatus` where `OnboardingFields = { password_set_at?: string | null; auth_last_sign_in_at?: string | null }` and `OnboardingStatus = { label: "Invite sent" | "Logged in (temp password)" | "Password changed"; variant: BadgeProps["variant"] }`. Tasks 5 and 8 consume this new shape (Task 5 supplies the fields via `ProfileRow`, Task 8's tables call `getOnboardingStatus` unchanged by name).

- [ ] **Step 1: Update the test file first**

Replace the entire contents of `src/lib/onboarding-status.test.cjs` with:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const {
  getOnboardingStatus,
} = require(path.join(__dirname, "onboarding-status.ts"));

test("marks a never-logged-in invitee as invite sent", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: null,
      auth_last_sign_in_at: null,
    }),
    {
      label: "Invite sent",
      variant: "gold",
    },
  );
});

test("marks a user who logged in but never changed their password as logged in with temp password", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: null,
      auth_last_sign_in_at: "2026-07-03T10:05:00Z",
    }),
    {
      label: "Logged in (temp password)",
      variant: "gold",
    },
  );
});

test("marks a user who changed their password as password changed", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: "2026-07-03T10:08:00Z",
      auth_last_sign_in_at: "2026-07-03T10:05:00Z",
    }),
    {
      label: "Password changed",
      variant: "default",
    },
  );
});

test("password_set_at takes priority even if auth_last_sign_in_at is somehow missing", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: "2026-07-03T10:08:00Z",
      auth_last_sign_in_at: null,
    }),
    {
      label: "Password changed",
      variant: "default",
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/onboarding-status.test.cjs`
Expected: FAIL — old `getOnboardingStatus` returns `"Ready"`/`"Needs password"` labels, not the new ones.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/lib/onboarding-status.ts` with:

```ts
import type { BadgeProps } from "@/components/ui/badge";

export interface OnboardingFields {
  password_set_at?: string | null;
  auth_last_sign_in_at?: string | null;
}

export interface OnboardingStatus {
  label: "Invite sent" | "Logged in (temp password)" | "Password changed";
  variant: BadgeProps["variant"];
}

export function getOnboardingStatus(user: OnboardingFields): OnboardingStatus {
  if (user.password_set_at) {
    return { label: "Password changed", variant: "default" };
  }

  if (user.auth_last_sign_in_at) {
    return { label: "Logged in (temp password)", variant: "gold" };
  }

  return { label: "Invite sent", variant: "gold" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/onboarding-status.test.cjs`
Expected: PASS (4 tests, 0 failures)

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expect new errors from `src/lib/dashboard-data.ts`, `src/components/admin/teachers-table.tsx`, and `src/components/admin/students-table.tsx` referencing the now-removed `invite_accepted_at`/old fields. That's expected — Tasks 5 and 8 fix them. Commit this task anyway; the repo will be inconsistent for one commit, which is normal mid-plan.

```bash
git add src/lib/onboarding-status.ts src/lib/onboarding-status.test.cjs
git commit -m "refactor: simplify onboarding status to invite-sent/logged-in/password-changed"
```

---

### Task 5: Update `dashboard-data.ts`

**Files:**
- Modify: `src/lib/dashboard-data.ts:22-34` (interface), `:47-51` (interface), `:114-216` (function body)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProfileRow` now has shape `{ id, full_name, email, is_active, invite_sent_at, password_set_at, auth_last_sign_in_at, created_at }` (dropped `invite_accepted_at`, `auth_invited_at`, `auth_email_confirmed_at`, `auth_has_password`; added `email`). Tasks 7 and 8 consume this — `TeachersTable`/`StudentsTable` props are typed as `ProfileRow[]` via `AdminDashboardProps` in `admin-dashboard.tsx` (unchanged, not part of this plan).

- [ ] **Step 1: Update the `ProfileRow` and `AuthUserOnboardingState` interfaces**

In `src/lib/dashboard-data.ts`, replace lines 22-34:

```ts
export interface ProfileRow {
  id: string;
  full_name: string;
  is_active: boolean;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  password_set_at: string | null;
  auth_invited_at: string | null;
  auth_email_confirmed_at: string | null;
  auth_last_sign_in_at: string | null;
  auth_has_password: boolean;
  created_at: string;
}
```

with:

```ts
interface RawProfileRow {
  id: string;
  full_name: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  created_at: string;
}

export interface ProfileRow extends RawProfileRow {
  email: string;
  auth_last_sign_in_at: string | null;
}
```

Then replace lines 47-51 (`AuthUserOnboardingState`):

```ts
interface AuthUserOnboardingState {
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}
```

with:

```ts
interface AuthUserOnboardingState {
  email: string | null;
  last_sign_in_at: string | null;
}
```

- [ ] **Step 2: Update `fetchAdminData`**

Replace the body of `fetchAdminData` (lines 114-216, from `const fetchAdminData = unstable_cache(` through the closing `);` before `export const getAdminDashboardData`) with:

```ts
const fetchAdminData = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [teachersResult, studentsResult, assignmentsResult, sessionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, is_active, invite_sent_at, password_set_at, created_at")
      .eq("role", "teacher")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, is_active, invite_sent_at, password_set_at, created_at")
      .eq("role", "student")
      .order("created_at", { ascending: false }),
    supabase
      .from("teacher_student_assignments")
      .select(
        "id, created_at, is_active, teacher:teacher_id (id, full_name), student:student_id (id, full_name), conversation:conversations (id)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select(
        "id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by, assignment:assignment_id (teacher:teacher_id (full_name), student:student_id (full_name))",
      )
      .order("scheduled_at", { ascending: true }),
  ]);

  const authUsersResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUsersById = new Map(
    (authUsersResult.data?.users ?? []).map((user) => [
      user.id,
      {
        email: user.email ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      } satisfies AuthUserOnboardingState,
    ]),
  );

  const withAuthOnboardingState = (rows: RawProfileRow[]) =>
    rows.map((row) => {
      const authUser = authUsersById.get(row.id);

      return {
        ...row,
        email: authUser?.email ?? "",
        auth_last_sign_in_at: authUser?.last_sign_in_at ?? null,
      } satisfies ProfileRow;
    });

  const teachers = withAuthOnboardingState((teachersResult.data ?? []) as RawProfileRow[]);
  const students = withAuthOnboardingState((studentsResult.data ?? []) as RawProfileRow[]);
  const assignments = (assignmentsResult.data ?? []).map((assignment) => {
    const teacher = Array.isArray(assignment.teacher)
      ? assignment.teacher[0]
      : assignment.teacher;
    const student = Array.isArray(assignment.student)
      ? assignment.student[0]
      : assignment.student;
    const rawConv = assignment.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    return {
      ...assignment,
      teacher,
      student,
      conversation,
    } as AdminAssignmentRow;
  });

  const sessions = (sessionsResult.data ?? []).map((s) => {
    const asgn = Array.isArray(s.assignment) ? s.assignment[0] : s.assignment;
    const teacher = Array.isArray(asgn?.teacher) ? asgn.teacher[0] : asgn?.teacher;
    const student = Array.isArray(asgn?.student) ? asgn.student[0] : asgn?.student;
    return {
      id: s.id,
      assignment_id: s.assignment_id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      notes: s.notes,
      status: s.status,
      proposed_by: s.proposed_by,
      teacherName: (teacher as { full_name: string } | null)?.full_name ?? "Teacher",
      studentName: (student as { full_name: string } | null)?.full_name ?? "Student",
    } as AdminSession;
  });

    return { teachers, students, assignments, sessions };
  },
  ["admin-dashboard"],
  { revalidate: 60, tags: ["dashboard", "admin-dashboard"] },
);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `src/components/admin/teachers-table.tsx` and `src/components/admin/students-table.tsx` (fixed in Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/lib/dashboard-data.ts
git commit -m "refactor: derive email and simplify onboarding fields in admin dashboard data"
```

---

### Task 6: Stamp `password_set_at` from the Settings page

**Files:**
- Modify: `src/components/settings/settings-page.tsx:186-198`

**Interfaces:**
- Consumes: existing `POST /api/user/onboarding` endpoint (`src/app/api/user/onboarding/route.ts`, unmodified — already accepts `{ event: "password_set" }` for any authenticated user).
- Produces: nothing new for other tasks; this closes the loop so `password_set_at` (read by Task 4's `getOnboardingStatus`) gets set when a user changes their password from Settings, not just from the old invite flow.

- [ ] **Step 1: Update `handlePasswordSave`**

In `src/components/settings/settings-page.tsx`, replace lines 186-198:

```ts
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess(true);
  };
```

with:

```ts
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordSaving(false);
      setPasswordError(error.message);
      return;
    }

    // Retry once — if this write is missed the admin dashboard shows the wrong
    // onboarding status, but never block the user since their password is
    // already saved.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "password_set" }),
      }).catch(() => null);
      if (response?.ok) break;
    }

    setPasswordSaving(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess(true);
  };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as any existing user, go to Settings → Password, submit a password change, and confirm (via the admin Users table after this plan's Task 8 lands, or directly via `select password_set_at from profiles where id = '<user id>'`) that `password_set_at` is now set.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-page.tsx
git commit -m "feat: stamp password_set_at when a user changes their password in Settings"
```

---

### Task 7: Show the generated password in the invite forms

**Files:**
- Modify: `src/components/admin/create-teacher-form.tsx` (full rewrite)
- Modify: `src/components/admin/create-student-form.tsx` (full rewrite)

**Interfaces:**
- Consumes: `POST /api/admin/invite-user` response shape from Task 3 (`{ userId, password }` on success; `{ alreadyActive, error }` / `{ alreadyInvited }` on 409).

- [ ] **Step 1: Replace `create-teacher-form.tsx`**

Replace the entire contents of `src/components/admin/create-teacher-form.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTeacherForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error">("success");
  const [pendingResend, setPendingResend] = useState<{ email: string; fullName: string } | null>(null);
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
      body: JSON.stringify({ fullName, email, role: "teacher" }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 409 && data.alreadyActive) {
      setStatusType("warning");
      setStatus(data.error ?? "This user already has an active account and can log in directly.");
      return;
    }

    if (response.status === 409 && data.alreadyInvited) {
      setPendingResend({ email, fullName });
      setStatusType("warning");
      setStatus("This user was invited but hasn't logged in yet.");
      return;
    }

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to invite teacher.");
      return;
    }

    setStatusType("success");
    setStatus("Account created and credentials emailed.");
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
      body: JSON.stringify({ ...pendingResend, role: "teacher", resend: true }),
    });

    const data = await response.json();
    setResendLoading(false);
    setPendingResend(null);

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    setStatusType("success");
    setStatus("Credentials resent.");
    setGeneratedPassword(data.password ?? null);
  };

  const statusColor = statusType === "error" ? "text-error" : statusType === "warning" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite teacher</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="teacher-name">Full name</Label>
            <Input
              id="teacher-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="teacher-email">Email</Label>
            <Input
              id="teacher-email"
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

- [ ] **Step 2: Replace `create-student-form.tsx`**

Replace the entire contents of `src/components/admin/create-student-form.tsx` with the same structure, role `"student"`, title, ids, and error copy swapped:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error">("success");
  const [pendingResend, setPendingResend] = useState<{ email: string; fullName: string } | null>(null);
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
      body: JSON.stringify({ fullName, email, role: "student" }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 409 && data.alreadyActive) {
      setStatusType("warning");
      setStatus(data.error ?? "This user already has an active account and can log in directly.");
      return;
    }

    if (response.status === 409 && data.alreadyInvited) {
      setPendingResend({ email, fullName });
      setStatusType("warning");
      setStatus("This user was invited but hasn't logged in yet.");
      return;
    }

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to invite student.");
      return;
    }

    setStatusType("success");
    setStatus("Account created and credentials emailed.");
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
      body: JSON.stringify({ ...pendingResend, role: "student", resend: true }),
    });

    const data = await response.json();
    setResendLoading(false);
    setPendingResend(null);

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    setStatusType("success");
    setStatus("Credentials resent.");
    setGeneratedPassword(data.password ?? null);
  };

  const statusColor = statusType === "error" ? "text-error" : statusType === "warning" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite student/parent</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
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

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors from these two files.

```bash
git add src/components/admin/create-teacher-form.tsx src/components/admin/create-student-form.tsx
git commit -m "feat: show generated password after inviting or resending credentials"
```

---

### Task 8: Add persistent "Resend credentials" action to the admin tables

**Files:**
- Modify: `src/components/admin/teachers-table.tsx` (full rewrite)
- Modify: `src/components/admin/students-table.tsx` (full rewrite)

**Interfaces:**
- Consumes: `ProfileRow` shape from Task 5 (`email`, `auth_last_sign_in_at`, no more `invite_accepted_at`); `getOnboardingStatus` from Task 4; `POST /api/admin/invite-user` (`resend: true`) from Task 3.

- [ ] **Step 1: Replace `teachers-table.tsx`**

Replace the entire contents of `src/components/admin/teachers-table.tsx` with:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  auth_last_sign_in_at: string | null;
  created_at: string;
}

interface TeachersTableProps {
  teachers: Teacher[];
}

export function TeachersTable({ teachers }: TeachersTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleUser = async (teacher: Teacher) => {
    setStatus(null);
    setLoadingId(teacher.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: teacher.id, isActive: !teacher.is_active }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Failed to update user.");
      setLoadingId(null);
      return;
    }

    setStatus("Updated user status.");
    setLoadingId(null);
    router.refresh();
  };

  const resendCredentials = async (teacher: Teacher) => {
    setStatus(null);
    setResendingId(teacher.id);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: teacher.email, fullName: teacher.full_name, role: "teacher", resend: true }),
    });

    const data = await response.json();
    setResendingId(null);

    if (!response.ok) {
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    setStatus(`Credentials resent to ${teacher.full_name}. New password: ${data.password}`);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Onboarding</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.length === 0 && (
            <tr><td colSpan={5} style={{ padding: "0", paddingTop: "8px" }}>
              <EmptyState icon={Users} title="No teachers yet" description="Invite a teacher to get started." />
            </td></tr>
          )}
          {teachers.map((teacher) => {
            const onboarding = getOnboardingStatus(teacher);

            return (
              <TableRow key={teacher.id}>
                <TableCell className="font-medium">{teacher.full_name}</TableCell>
                <TableCell>
                  <Badge variant={teacher.is_active ? "default" : "gold"}>
                    {teacher.is_active ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={onboarding.variant}>{onboarding.label}</Badge>
                </TableCell>
                {!isMobile && (
                  <TableCell>
                    {new Date(teacher.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    {onboarding.label !== "Password changed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resendCredentials(teacher)}
                        disabled={resendingId === teacher.id}
                      >
                        {resendingId === teacher.id ? "Resending..." : "Resend"}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleUser(teacher)}
                      disabled={loadingId === teacher.id}
                    >
                      {teacher.is_active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Replace `students-table.tsx`**

Replace the entire contents of `src/components/admin/students-table.tsx` with the same structure (role `"student"`, `Student`/`StudentsTableProps` names, `GraduationCap` icon):

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Student {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  auth_last_sign_in_at: string | null;
  created_at: string;
}

interface StudentsTableProps {
  students: Student[];
}

export function StudentsTable({ students }: StudentsTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleUser = async (student: Student) => {
    setStatus(null);
    setLoadingId(student.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: student.id, isActive: !student.is_active }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Failed to update user.");
      setLoadingId(null);
      return;
    }

    setStatus("Updated user status.");
    setLoadingId(null);
    router.refresh();
  };

  const resendCredentials = async (student: Student) => {
    setStatus(null);
    setResendingId(student.id);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: student.email, fullName: student.full_name, role: "student", resend: true }),
    });

    const data = await response.json();
    setResendingId(null);

    if (!response.ok) {
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    setStatus(`Credentials resent to ${student.full_name}. New password: ${data.password}`);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Onboarding</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.length === 0 && (
            <tr><td colSpan={5} style={{ padding: "0", paddingTop: "8px" }}>
              <EmptyState icon={GraduationCap} title="No students yet" description="Invite a student to get started." />
            </td></tr>
          )}
          {students.map((student) => {
            const onboarding = getOnboardingStatus(student);

            return (
              <TableRow key={student.id}>
                <TableCell className="font-medium">{student.full_name}</TableCell>
                <TableCell>
                  <Badge variant={student.is_active ? "default" : "gold"}>
                    {student.is_active ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={onboarding.variant}>{onboarding.label}</Badge>
                </TableCell>
                {!isMobile && (
                  <TableCell>
                    {new Date(student.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    {onboarding.label !== "Password changed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resendCredentials(student)}
                        disabled={resendingId === student.id}
                      >
                        {resendingId === student.id ? "Resending..." : "Resend"}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleUser(student)}
                      disabled={loadingId === student.id}
                    >
                      {student.is_active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/teachers-table.tsx src/components/admin/students-table.tsx
git commit -m "feat: add persistent resend-credentials action to admin user tables"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run all Node test files**

```bash
node src/lib/auth/generate-temp-password.test.cjs
node src/lib/onboarding-status.test.cjs
```

Expected: both PASS with 0 failures.

- [ ] **Step 2: Full type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors (warnings acceptable only if they pre-exist on `main`).

- [ ] **Step 4: End-to-end manual smoke test** (dev server + a real or local Supabase project with `RESEND_API_KEY` set)

1. Invite a brand-new teacher → receive email with real email+password → log in immediately at `/login` with those credentials → land on `/teacher`. Confirm the admin Users table shows "Invite sent" for this user immediately after inviting, then "Logged in (temp password)" after the login.
2. From Settings → Password, change the password using the temp password as "current password" → confirm success, and confirm the admin Users table now shows "Password changed" for this user (refresh the page — cache tag `admin-dashboard`/`dashboard` should already have been revalidated by `/api/user/onboarding`).
3. From the admin Users table, click "Resend" on a user still in "Invite sent" — confirm a new password is shown in the status line and the old password no longer logs in.
4. Try to invite the same email as an already-"Password changed" user — confirm `409` "already has an active account" and that their password still works afterward.
5. Confirm `/forgot-password` still works end-to-end unchanged (request reset → email → `/auth/callback?type=recovery` → `/set-password` → login with new password).

- [ ] **Step 5: Final commit (only if smoke testing surfaced fixes)**

If step 4 required any code changes, commit them individually with descriptive messages as usual. If no changes were needed, there is nothing to commit for this task.
