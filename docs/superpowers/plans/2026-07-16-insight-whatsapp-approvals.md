# Insight WhatsApp Approval Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Notify only Swati of a pending class approval on WhatsApp and allow her to approve or reject that exact pending approval with an unambiguous, replay-safe reply.

**Architecture:** Insight creates a short-lived server-only approval code bound one-to-one to an existing approval row. When enabled, it sends an approved utility template to Swati's configured WhatsApp number with Approve and Reject quick replies. The signed Meta webhook recognizes replies only from that exact number, resolves only an active code, and decides the same approval row under the existing database lock. The admin dashboard remains a fully supported fallback and races safely because only one pending decision can win.

**Primary references:** Meta's WhatsApp Cloud API supports reply buttons with unique backend IDs and returns button identifiers in message webhooks. Business-initiated messages outside the service window require an approved template, so production activation depends on an externally approved utility template.

**Global constraints:**

- Keep `HERMES_WHATSAPP_APPROVALS_ENABLED=false` by default.
- Only `HERMES_ADMIN_WHATSAPP_E164` may decide approvals through this path.
- Never infer a decision from `yes`, `ok`, emoji, or button titles.
- Accept only exact `APPROVE <CODE>`, `REJECT <CODE>`, or an exact generated button payload.
- Bind each code to one approval, expire it after 48 hours, and consume it once.
- Store no WhatsApp transcript in approval or audit metadata.
- Preserve Meta signature verification and event idempotency.
- Do not forward a recognized approval command to Kitty after it is handled.
- Keep `/admin/hermes` approval controls as the fallback; exactly one surface may win.
- Do not attempt to create or submit a Meta template from code.

### Task 1: Add server-only WhatsApp approval bindings and atomic decision RPC

- Create `supabase/migrations/20260716153000_add_whatsapp_approval_replies.sql`.
- Add `hermes_whatsapp_approval_bindings` with unique approval/code, expiry, notification message ID, decision message ID, and consumed time.
- Enable RLS; revoke browser roles; grant service role only.
- Add `decide_hermes_approval_by_whatsapp` that locks the approval, binding, and case, verifies pending/unconsumed/unexpired state, records the decision, consumes the binding, cancels sibling codes, and audits without message content.
- Add schema contract tests for race and authorization invariants.

### Task 2: Build exact reply parsing and minimized template payloads

- Create `src/lib/hermes/whatsapp-approvals.ts` and tests.
- Add cryptographically random non-ambiguous codes, exact text/button parsers, a minimized approval summary, and the fixed Meta utility-template payload with two quick-reply payloads.
- Reject extra words, generic affirmation, malformed codes, expired input, and arbitrary payload fields.

### Task 3: Send the approval notification after a pending approval is created

- Extend `request_approval` in the tool route behind the feature flag.
- Upsert one binding, send only to the configured admin number, record only Meta's message ID, and return a safe notification status.
- Failure to notify must leave the approval pending and visible in the admin dashboard.
- Add `.env.example` settings for the feature flag and approved template name.

### Task 4: Handle exact Swati replies before normal contact forwarding

- Extend webhook event projection for interactive reply IDs and template-button payloads.
- In the signed webhook, branch only when sender E.164 exactly matches the configured admin number and the message is an exact approval command.
- Reserve the Meta message ID through replay-protected audit insertion, resolve the active code, call the atomic RPC, and do not forward recognized commands.
- Record safe accepted/rejected/stale outcomes without raw reply text.

### Task 5: Document external activation and run the full gate

- Document the required Meta utility template, two quick replies, staging probes, expiry, dashboard race, wrong-number denial, replay, rollback, and template fallback.
- Keep all production switches false because template approval and a real signed webhook probe are external operations.
- Run all Hermes/UI Node tests, plugin/profile tests, focused lint, TypeScript, and the production build.

## Phase 4 Stop Gate

Do not enable until Meta has approved the exact utility template and staging proves signed delivery, button/text decisions, wrong-number denial, replay rejection, expiry, dashboard/button race behavior, no forwarding of handled commands, and immediate rollback by feature flag. Automatic reminders and Google Meet creation remain later work.
