# Insight Academy — The Next Big Thing

**Date:** 2026-07-24
**Author:** strategy review of myinsightacademy.com (code + live production data)
**Recommendation:** Build **The Money Loop** — verified hours → invoice → payment → tutor payout.

---

## 1. Where the business actually is

### What was reviewed

- The public site (`myinsightacademy.com`) and its positioning
- The full application source (`src/`), schema, and 40 migrations
- The **live production database** (Supabase project `gowmtxtlfvfawuapprcf`)

### The product today

An invite-only operations portal for a tutoring agency, with four roles (admin, teacher,
student, parent):

| Capability | State |
|---|---|
| Private in-platform chat, 1:1 and groups | Built. Contact-info blocking (`src/lib/validators/contact-info.ts`) stops phone/email exchange — an explicit anti-disintermediation control |
| Groups as the core unit; teaching pairs derived from membership | Built (2026-07) |
| Calendly-style tutor availability + booking + sessions | Built, single availability model |
| Timezone-aware scheduling, email reminders (24h/3h) | Built, cron-driven |
| "Kitty" — WhatsApp Cloud AI assistant for scheduling | Built, **approval-first, flag-disabled** |
| Settlement ledger: tutor reports → family invoices → tutor payouts | **Schema and logic built, flag-disabled, zero rows** |
| Any payment processing | **Does not exist anywhere in the codebase** |

Subjects offered: Maths, Chemistry, English, Spanish, Physics, Biology, Chinese.
18 of 21 tutors are subject-labelled.

### The numbers that matter (live, 2026-07-24)

| Metric | Value |
|---|---|
| Tutors / students / parents | 21 / 21 / 3 |
| Signed in at least once | 17 tutors, 16 students, 2 parents |
| Signed in within 30 days | 25 of 45 users |
| Tutors who set their availability | **21 of 21** |
| Teacher–student assignments | 11 |
| **Sessions ever booked** | **2** (0 confirmed, 0 upcoming) |
| Students who set availability | **1** |
| Messages ever sent | 33 (28 in the last 30 days) |
| Parent–student links | **0** |
| Settlement cycles / invoices / payouts | **0 / 0 / 0** |
| Inbound "request an invite" leads (since 7 Jun) | 12 |

### The diagnosis

**Supply is fully onboarded. Nothing transacts.**

Every single tutor painted their weekly availability — 180 rules. That is not apathy;
that is a supply side that showed up and did the work. And then two sessions were ever
booked, and thirty-three messages were ever sent.

The portal is a well-built room that nobody meets in. The agency's real operations run on
WhatsApp and in the founder's head — which is precisely *why* Kitty and the settlement
ledger were designed. The product has been competing with WhatsApp on WhatsApp's home turf
(chat, "what time works?") and losing, correctly, because for those two jobs WhatsApp is
genuinely better.

**The strategic question is therefore not "what feature next?" but "what job does this
platform own that WhatsApp physically cannot do?"**

There is exactly one good answer: **money**.

---

## 2. The opportunities, compared

Five candidates, scored 1–5 (5 = best) on the dimensions in the brief:

| # | Opportunity | Customer value | Revenue | Retention | Scalability | Differentiation | Cost/risk (5 = cheap & safe) | **Total** |
|---|---|---|---|---|---|---|---|---|
| **1** | **The Money Loop** — verified hours → invoice → payment → payout | 5 | 5 | 4 | 5 | 5 | 4 | **28** |
| 2 | Kitty (WhatsApp AI scheduler) to production | 4 | 2 | 3 | 4 | 3 | 2 | 18 |
| 3 | Learning record — session notes + parent progress reports | 4 | 2 | 5 | 3 | 3 | 4 | 21 |
| 4 | Multi-tenant SaaS — sell the portal to other agencies | 3 | 4 | 3 | 5 | 4 | 1 | 20 |
| 5 | Public marketplace / self-serve demand generation | 3 | 3 | 2 | 3 | 2 | 2 | 15 |

### Why each of the others loses *right now*

**#2 Kitty to production.** Genuinely valuable — it removes coordination load from the
founder and meets families where they already are. But it *deepens* the WhatsApp
dependence rather than resolving it, it carries the heaviest compliance surface in the
codebase (Meta template approval, opt-in/opt-out, an AI agent sending to real families),
and it produces no revenue and no defensibility on its own. **Kitty is a channel, not the
bet.** Its correct role is delivering the Money Loop's invoices and payment reminders —
which is exactly what the approved template list (`WHATSAPP_TEMPLATE_FAMILY_INVOICE`,
`PAYMENT_REMINDER`, `PAYMENT_RECEIVED`) was already built for.

**#3 Learning record / parent progress.** The strongest *second* bet, and the best pure
retention play — parents are the payer, and parents churn when they cannot see value. But
there are **zero parent–student links** in production today; the audience isn't wired up.
And it is a nice-to-have: unadopted content features quietly die, whereas nobody ignores
an invoice. Build it in phase 2, riding on the parent relationships that billing forces
into existence.

**#4 Multi-tenant SaaS pivot.** The right long-term ambition and probably where the real
enterprise value is. Fatal today: you would be selling a tutoring-operations product that
your own tutoring agency does not operate in. Two sessions. Do #1, run two real monthly
closes on it, and *then* this conversation becomes credible — with the billing module as
the thing agencies actually pay for.

**#5 Marketplace / demand generation.** 12 inbound leads in seven weeks says demand is not
the binding constraint; conversion and operations are. Worse, you cannot sensibly spend on
acquisition when you do not yet track revenue or margin per student — you would be buying
customers with unknown unit economics.

---

## 3. Why the Money Loop wins

**1. It is the only workflow WhatsApp cannot beat.** Chat loses to WhatsApp. "What time
suits you?" loses to WhatsApp. But reconciling 21 tutors' self-reported hours against
per-family rates, issuing invoices, chasing payment, and computing payouts *cannot* be
done in a chat thread. This is the one job where the platform is structurally superior to
the incumbent behaviour, which makes it the only place a durable moat can form.

**2. It fixes the adoption problem as a side effect.** Make attendance the billing event.
If the fastest path to getting paid is a portal-confirmed session, then sessions,
availability, and assignments populate themselves — no separate adoption campaign, no
nagging. Billing pulls scheduling adoption along behind it. That is how the "2 sessions
ever" number gets fixed causally rather than cosmetically.

**3. It is the only option with direct, measurable revenue impact.** Three distinct levers:
recovered billing leakage, faster cash collection, and (phase 3) prepaid packages.

**4. It removes the founder bottleneck — the actual scalability ceiling.** Today the
monthly close means chasing 21 tutors on WhatsApp, resolving name matches by hand,
computing family charges, chasing payment, and reconciling payouts. That workload scales
linearly with tutor count and is capped by one person's attention. It is the reason this
agency cannot go from 21 tutors to 60. Everything else on the list makes the business
nicer; this one raises its ceiling.

**5. It is the cheapest of the ambitious options, because most of it already exists.** The
ledger schema (`academy_settlement_cycles`, `academy_tutor_reports`,
`academy_tutor_report_lines`, `academy_family_invoices`, `academy_tutor_payouts`) is
designed with revisions, supersession, immutable snapshots, and an approval binding. The
logic skeleton is in `src/lib/hermes/settlements.ts`. The invoice and reminder templates
are specified. The audit table exists. **This is wiring, a payment rail, and one good
admin screen — not a new product.**

**6. It is the foundation for every other bet on the list.** Progress reports become worth
paying for once there is a bill they justify. The SaaS pivot becomes sellable once billing
is the module. Acquisition spend becomes rational once margin per student is visible.

### The honest counter-argument

The codebase currently contains a *deliberate* decision that money movement is out of
scope — `src/components/admin/hermes-assistant-dashboard.test.cjs:90` actively asserts
that no route mentions Stripe, transfers, banks, or PayPal, and the README states plainly
that these actions "track status only; no bank transfer or automatic money movement is
implemented."

That constraint was right for an AI agent with WhatsApp send rights. It is not right for
the admin portal operated by the owner. **This proposal deliberately reverses it for the
human-operated surface only** — Kitty may notify about money, but never move it. The
existing test stays green and stays meaningful.

---

## 4. The plan

### Target customer

Three parties, one loop:

- **Primary user and buyer — Swati (agency owner/admin).** Pain: the monthly close is a
  multi-day manual grind across WhatsApp threads and spreadsheets, with no reliable view
  of revenue, margin, or who owes what.
- **The payer — the parent/family.** Pain: opaque charges arriving as a chat message, no
  record of what was taught or when, awkward and informal payment.
- **The supply — the tutor.** Pain: reports hours from memory, has no visibility into when
  or whether payment is coming.

### Problem being solved

Hours are self-reported in free text. Invoices are computed by hand. Payment is chased in
a chat thread. Payouts are reconciled from memory. The result is revenue that leaks, cash
that arrives late, tutors who don't trust the process, families who can't see what they
paid for, and a founder who is the single point of failure for the entire month-end.

### Proposed solution

**Verified Hours → Invoice → Payment → Payout.** One monthly close loop where the portal
is the system of record.

1. **Attendance is the billing event.** After a session, the tutor taps "attended" (or
   files a variance) from the reminder they already receive. The session becomes a
   verified, billable line with a duration and a named student.
2. **Rate cards live on the assignment.** Family rate and tutor pay rate per
   student–tutor pairing. Margin is computed, not guessed.
3. **One close screen.** Draft family invoices and draft tutor payouts for the cycle, with
   variances surfaced first: unverified hours, unmatched student names, missing rates,
   reported-vs-scheduled deltas.
4. **One approval.** Swati approves the cycle; invoices go out by email (and WhatsApp
   template) carrying a **bank-transfer QR code and a unique reference code**. Payments are
   recorded against the reference; payouts flip to eligible.
5. **Reminders run themselves.** Overdue invoices chase automatically on a schedule.
6. **The owner dashboard** shows five numbers for the first time: billed, collected,
   outstanding, tutor cost, gross margin — sliceable by student and by tutor.

### A real architectural fork to decide in week one

The existing settlement tables bill against **`hermes_contacts`** (the WhatsApp contact
directory), not against **`profiles`** and `teacher_student_assignments` (the portal
identity). Keeping it that way forks your customer record permanently: the person you
teach and the person you bill become two different rows that drift apart.

**Recommendation: bill against `profiles`/assignments, and treat `hermes_contacts` as a
messaging-channel identity linked to a profile.** This is a modest migration now and an
expensive one in a year. Note this must be done without disturbing `/admin/hermes`
behaviour, which is a hard project constraint.

### Business impact

Their actual rates are not in the system, so these are **planning assumptions to be
replaced with real figures in week one of the baseline audit** — not forecasts:

| Lever | Mechanism | Planning assumption |
|---|---|---|
| Leakage recovery | Memory-based reporting reliably under-reports | 3–7% of taught hours currently unbilled → ~2–6 sessions/month recovered at present volume, and it scales linearly with headcount |
| Cash cycle | Payment link + automated reminders vs. chasing in chat | DSO from a typical 20–40 days down to under 12 |
| Founder time | Automated close vs. manual reconciliation | 1–3 days/month → under 1 hour |
| Retention (phase 3) | Prepaid packages — the strongest retention mechanic in tutoring | Cash collected up front; families finish what they've paid for |
| Scalability | Close cost stops scaling with tutor count | The 21 → 60 tutor path becomes viable without a hire |
| Differentiation | A tutoring-specific verified-hours ledger | Not replicable by Calendly + WhatsApp + a spreadsheet |

The most under-rated line here is the last one in the impact column of "founder time":
this is the difference between a business that can grow and one that cannot.

### Required resources

- **Engineering:** one full-stack developer, roughly 8–10 focused weeks across the 90 days.
  No new stack — Next.js, Supabase, Resend, and the existing WhatsApp sender all stay.
- **Founder:** ~6 hours in week one for the baseline audit, then ~2 hours per close cycle
  during the parallel-run phase.
- **Payment rail:** **none to procure.** Vietnamese and Indian bank transfer means VietQR
  and UPI QR — both are free, instant, 24/7, and native to how these families already pay.
  Needs only the receiving bank account details and the business entity details for
  invoicing. No merchant account, no processor fees, no PCI surface.
- **Accountant:** ~2 hours, once, to sanity-check invoice format, tax treatment, and
  record retention *before* the first real invoice leaves the building.
- **Meta:** template approvals for the invoice and payment-reminder templates already
  named in `.env.example`.

### Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Chicken-and-egg**: billing wants verified sessions; sessions aren't in the portal | High | The MVP accepts tutor-entered lines exactly as today, *and* auto-fills from portal sessions where they exist, showing the delta. Never gate the close on adoption — earn it by paying portal-confirmed lines first |
| **Reconciling incoming transfers to invoices** — the real hard part now that the rail is bank transfer | High | Every invoice carries a unique reference code the payer types into the transfer memo. MVP is manual mark-paid against that reference (entirely tractable at 21 students). Phase 3 automates it via bank-statement CSV import, or a Vietnamese incoming-transfer webhook service (Casso/SePay) which pushes a notification per credit |
| **Payers omit or mistype the reference code** | Medium | The QR code embeds the reference automatically, so a scanned payment always carries it. Manual transfers get a fuzzy-match queue on amount + payer name + date, surfaced in the same variance queue as everything else |
| **VND has zero decimal places; INR has two** | Medium | `amount_minor` as `bigint` is correct for both, but every formatting, rounding, and QR-encoding path must read decimals from the currency, not assume 2. Get this wrong and every VND invoice is off by 100× — write the test first |
| **A money bug destroys trust irreversibly** | High | Append-only ledger with revisions and supersession (the schema already does this); one explicit approval gate; **no automatic sends for the first two cycles**; full audit trail via `hermes_audit_events`; run the first cycle in parallel with the manual process and reconcile to the penny |
| **Tax/regulatory exposure on real invoices** | Medium | The accountant's two hours, before the first send. Correct entity, correct tax treatment, correct retention |
| **Tutor resistance to confirming attendance** | Medium | One tap from the reminder they already get. Tie it to payout speed, not to policing |
| **Scope creep into building an accounting system** | Medium | Hard line: this *exports to* accounting, it never *becomes* accounting. No chart of accounts, no journals, no reconciliation engine |
| **Regression in `/admin/hermes`** | Medium | Hermes tables and routes are a hard no-touch constraint; the billing identity migration must be additive and behind its own flag |
| **Card data handling** | **Eliminated** | Bank transfer only. No card data exists anywhere in the system |

### Validation — before writing significant code

Run this in week one. It is cheap and it is falsifiable.

1. **Baseline audit.** Reconstruct the last two months of billing by hand from Swati's
   records. Measure four things: hours reported vs. hours actually taught, invoice-to-cash
   days, hours spent closing, and disputes raised.
2. **Interviews.** Five families and five tutors. Families: how would you prefer to pay,
   and what would you want to see on the invoice? Tutors: what would make you confirm a
   session within 24 hours?
3. **Paper prototype.** Walk Swati through the close screen using real July data before a
   line of it is built. If she can't complete a close on paper, the screen is wrong.

**Kill criteria — if all three hold, do not build this.** If leakage is under 2%, DSO is
already under 10 days, and the close takes under 3 hours, then the money loop is not the
constraint. In that case pivot to opportunity #3, the learning record and parent progress
layer, and revisit billing at 40+ students.

### MVP scope

**In:**
- Rate cards (family rate + tutor rate) on `teacher_student_assignments`
- Attendance confirmation on a session, one tap, from email/WhatsApp or the portal
- Monthly close screen: draft invoices + draft payouts + a variance queue
- Invoice document (HTML + PDF) and email delivery
- Payment instructions on every invoice: **VietQR (VND) and UPI QR (INR)** encoding the
  account, amount, and unique reference code — plus manual mark-paid and partial payments
- Tutor payout statement and mark-paid
- Owner dashboard: billed, collected, outstanding, tutor cost, gross margin

**Explicitly out:**
- Automatic bank transfers or automated payouts (status tracking only, as today)
- Prepaid packages and credits — phase 3, deliberately
- Refunds, credit notes, FX conversion between VND and INR, a tax/VAT engine
- Automated bank reconciliation (phase 3) — manual mark-paid against a reference is
  entirely adequate at this volume
- **Multi-tenancy.** Agency-only, per the decision below. Do not build a tenant boundary
- Kitty autonomously negotiating or amending invoices
- Tutor self-serve rate changes
- Accounting-software integrations beyond a CSV export

---

## 5. The 30/60/90-day roadmap

### Days 1–30 — Truth, then the ledger spine

*Goal: know the real numbers, and produce a correct close in private.*

- Baseline audit and the ten interviews (week 1). Replace every planning assumption above
  with a real figure.
- Decide and execute the billing-identity fork: bill against `profiles`/assignments.
- Rate cards on assignments; admin UI to set them.
- Attendance confirmation on sessions, with tutor-entered lines as the fallback path.
- Internal-only close screen: generate July's draft invoices and payouts.
- **Run the August close inside the portal in parallel with the existing manual process
  and reconcile the two.** Nothing customer-facing sends this month.

**Exit criteria:** the portal's August close matches the manual close to the penny;
leakage and DSO baselines are documented numbers, not guesses.

### Days 31–60 — Real invoices, real money

*Goal: every family is invoiced from the portal, and pays through it.*

- Invoice document and email delivery, live — VND and INR formatted correctly (see the
  zero-decimal risk above; write that test first).
- **VietQR and UPI QR generation** on every invoice, embedding account, amount, and
  reference code. Both are pure client-side string encoding into a QR — no API, no
  processor, no account to open.
- Unique reference code per invoice; manual mark-paid against it; a fuzzy-match queue for
  transfers that arrive without one.
- Partial payments and outstanding balances.
- Automated overdue reminders — email first, WhatsApp template second.
- Tutor payout statements delivered; payouts marked paid.
- **Run the September close for real**, with Swati approving every send.

**Exit criteria:** 100% of families invoiced from the portal; DSO measured against
baseline; zero billing disputes traced to a system error.

### Days 61–90 — Cash, compounding, and the asset

*Goal: turn the loop into a retention engine and a sellable module.*

- **Prepaid packages and credits** — buy 10 sessions, draw down on attendance. This is the
  retention play and the cash-flow play in one.
- Owner dashboard: margin per student and per tutor, visible for the first time.
- Reminders and invoice delivery routed through Kitty on WhatsApp, notification-only.
- **Automated bank reconciliation**, if manual marking has become a chore by now: bank
  statement CSV import matched on reference code, or a Vietnamese incoming-transfer
  webhook service (Casso/SePay) that pushes a notification per credit. Do this only if the
  pain is real — at 21 students it may never be.
- Accounting export (CSV, then Xero/QuickBooks if the accountant asks for it).
- Two clean closes on the record → open the phase-2 conversation: the learning record for
  parents (opportunity #3), and the first exploratory conversations about selling the
  billing module to peer agencies (opportunity #4).

**Exit criteria:** at least one family on a prepaid package; margin per student known;
close time under one hour.

### Metrics to hold this to

| Metric | Today | 90-day target |
|---|---|---|
| Share of billed hours originating from a portal-verified session | 0% | 80% |
| Days sales outstanding | unknown (measure in week 1) | under 12 |
| Hours to close the month | 1–3 days | under 1 hour |
| Billing disputes per cycle | unknown | under 1 |
| Tutors confirming attendance in-portal monthly | 0 | 18 of 21 |
| Gross margin per student | **not measurable** | visible on a dashboard |
| Sessions booked per month | 1 | 60+ |

---

## 6. Decisions taken (2026-07-24)

**1. Payment rail: Vietnamese and Indian bank transfer, mixed international base.**

This is materially better news than a card rail, and it simplifies the 31–60 day block
rather than complicating it:

- **VietQR** (NAPAS 247) and **UPI QR** are both national QR standards that encode account,
  amount, and a memo/reference directly into the code. The family scans it in the banking
  app they already use. Transfers settle instantly, 24/7.
- **Nothing to procure and nothing to integrate.** Generating either QR is client-side
  string encoding into a standard QR image — no merchant account, no processor, no API
  dependency, no per-transaction fee, no PCI scope, no card data.
- Both are the *default* way families in these markets pay. This is lower friction than a
  card checkout would have been, not higher.

The engineering problem therefore moves from *collecting* payment to *reconciling* it.
That is handled by a unique reference code per invoice — embedded automatically in the QR,
manually marked off at this volume, and optionally automated in phase 3.

**2. Scope: agency-only. Do not build multi-tenancy.**

No tenant boundary in the rate card or invoice models. Retrofit later if and when selling
to peer agencies becomes a live opportunity — which it only does after two clean closes on
Insight's own books.

### Remaining unknowns, to resolve in the week-one audit

- Which currency is each family billed in, and are any billed in one currency while their
  tutor is paid in another? If so, an FX policy is needed earlier than phase 3 — decide
  who absorbs the spread before the first invoice, not after.
- Which receiving bank accounts exist in Vietnam and India, and whose name are they in?
  This determines what the invoice can legally state as the payee.
