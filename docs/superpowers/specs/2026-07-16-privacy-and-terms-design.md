# MyInsightAcademy Privacy Policy and Terms Design

## Objective

Create public, mobile-friendly Privacy Policy and Terms of Service pages at
`/privacy` and `/terms` for MyInsightAcademy / Insight Academy. The documents
must accurately reflect the verified application and operating practices,
clearly disclose WhatsApp and AI processing, use placeholders only where a
publication-specific fact remains unavailable, and avoid claiming legal
certification or guaranteed security.

The pages are drafts until their wording is approved. They must not be deployed
or published as part of this work.

## Identity and Contact

- Service and brand: MyInsightAcademy / Insight Academy.
- Operator: Swati Goel, the owner and operator of the service.
- Contact: `hello@myinsightacademy.com`.
- Website: `https://myinsightacademy.com`.
- Primary operations: Vietnam.
- Remote tutoring may be provided from India and Singapore.
- No incorporated legal entity name or registered address has been verified.
  The documents will therefore identify the brand and operator without claiming
  a particular company form or registered office.
- The agency began operating in 2018. This is background only; it is not the
  effective date of either legal document.
- The displayed effective date for both documents is July 1, 2020. Because the
  current wording describes features and providers introduced or changed after
  that date, a qualified lawyer should confirm whether the pages should also
  display a separate "Last updated" date before publication.

## Verified Product and Data Audit

### Accounts and authentication

Supabase provides email/password authentication, invitation links, password
reset, and server-managed session cookies. Accounts may be created for admins,
tutors, students, and parents. Profile data includes name, role, active status,
avatar URL, timezone, reminder preferences, invitation/onboarding timestamps,
and account creation time. Email addresses are held by Supabase Auth.

### Tutoring and scheduling

The application stores tutor-student assignments, parent-student links,
availability rules and exceptions, booking preferences, session date and time,
duration, status, proposer/canceller identifiers, booking source, lesson notes,
reminder status, and related timestamps. Scheduling is timezone-aware.

### Chat and files

The application stores private conversation membership, message sender, message
body, timestamps, and attachment metadata. Supported uploads are PNG, JPEG, GIF,
WebP, and PDF files up to 10 MB. Images may be resized and converted to WebP in
the browser before upload. Supabase Storage stores chat attachments and avatars;
Supabase Realtime delivers chat and notification updates.

Conversation access is limited through row-level security to relevant students,
tutors, linked parents, and administrators. Storage policies limit chat file
access and upload to conversation participants and administrators. These are
security practices, not guarantees of absolute security.

### Contact, interest, and email

The public join-interest form collects role, name, email, phone number, and an
optional message. Join-interest records are stored in Supabase. Public and
in-app support forms collect contact details, category, subject, and message and
send them through Resend. Resend also processes invitations, password-related
messages, lesson reminders, and session-event emails.

### Browser and hosting data

Supabase session cookies are necessary for authentication. Local storage holds
a per-user, per-conversation last-read timestamp used to calculate unread
counts. No analytics, advertising, or behavioral-tracking service was found in
the repository. Vercel hosts the production website and may process standard
HTTP, device, diagnostic, security, and access-log information to deliver the
site.

### Account deletion and retention

The application has no self-service account deletion. Administrators can
deactivate and soft-delete an account, which prevents use and hides the account
from normal administrative lists but preserves tutoring records. Hard deletion
can cascade through related records, but it is not the implemented account
deletion flow.

No fixed retention schedule is implemented or verified. The Privacy Policy will
therefore use purpose-based criteria: information is retained while reasonably
needed to provide tutoring and platform services, administer accounts and
relationships, maintain safety and business records, resolve disputes, enforce
agreements, and meet legal obligations. It will explain that deletion requests
may be limited by legal obligations, the rights of other people, integrity of
shared tutoring records, fraud/security needs, and backup deletion cycles.

### Payments

No payment processor or online checkout exists in the repository. The operating
practice is to issue invoices at the end of each month. Amounts, payment method,
and due date are communicated separately or on the invoice. The Terms will not
invent card processing, automatic renewal, late fees, refunds, or tax terms.

### Minors and parental consent

The minimum user age will be 12. Users below the age of legal majority in their
location must use the service with the involvement and consent of a parent or
legal guardian. The current consent practice is agreement by phone or in person
before the student is taught or uses the service. The documents will not claim
that an automated age-verification or verifiable digital-consent system exists.

Because the service is used by middle- and high-school students, the documents
will tell parents and guardians to supervise minors, review uploads and
communications, and submit privacy requests on a child's behalf. The wording
will flag for legal review whether the existing verbal/in-person process is
sufficient in each country where students reside, particularly for users under
13.

### Cancellation and rescheduling

Students or parents should contact the tutor as soon as reasonably possible when
they cannot attend. The parties ordinarily discuss and agree on a replacement
time. Rescheduling is subject to tutor availability. The Terms will not invent a
notice deadline, cancellation fee, refund entitlement, or guaranteed make-up
lesson. Any financial adjustment or make-up lesson is handled case by case and
should be reflected on the monthly invoice or otherwise confirmed by the agency.

## WhatsApp and AI Data Flow

MyInsightAcademy uses the WhatsApp Business Cloud API. A hosted Hermes AI agent
controlled by Swati Goel may process incoming WhatsApp interactions to prepare
or provide responses. Depending on what a person sends, this processing can
include phone number, profile and message metadata, text, voice notes, images,
documents, and relevant conversation history.

Hermes may send content to third-party model and infrastructure providers.
OpenAI (GPT models) and Anthropic (Claude models) are verified examples. The
provider may change and additional providers have not been identified. The
policy will therefore name OpenAI and Anthropic, describe other providers by
category, and state that users may contact MyInsightAcademy for the current
provider list. It will not claim that every interaction uses a particular model
or that providers never retain data.

WhatsApp interactions are additionally governed by applicable WhatsApp and Meta
terms and privacy policies. The policy will distinguish processing by
MyInsightAcademy/Hermes from processing independently controlled by Meta or
other providers.

The AI disclosure will state that:

- AI responses may be incomplete, inaccurate, or inappropriate.
- A human should verify important information.
- AI output is not professional, medical, legal, financial, safety, or emergency
  advice.
- Users must not rely on the AI for emergencies, high-risk decisions, academic
  misconduct, decisions about another person's rights, or automated decisions
  with legal or similarly significant effects.
- Users should avoid sending unnecessary sensitive information.

WhatsApp and AI deletion instructions will direct a person to email
`hello@myinsightacademy.com` from a connected email address or contact the
MyInsightAcademy WhatsApp number, identify the relevant phone number, and
specify whether they seek deletion of WhatsApp content, their platform account,
or both. The policy will explain that MyInsightAcademy will act subject to legal
exceptions and technical/provider limitations and that the user may separately
need to use WhatsApp account controls for data controlled by Meta.

## Verified Service Providers and Recipients

Only verified providers will be named:

- Supabase: authentication, database, realtime events, and file storage.
- Vercel: production website hosting and request delivery.
- Resend: transactional and support email delivery.
- Meta / WhatsApp: WhatsApp Business Cloud API and WhatsApp messaging.
- OpenAI: a possible AI model provider for Hermes.
- Anthropic: a possible AI model provider for Hermes.

Authorized tutors and administrators are recipients rather than infrastructure
subprocessors. They receive only the information reasonably needed for assigned
students, tutoring, scheduling, support, administration, and safety.

No analytics provider, advertising network, payment processor, or additional AI
provider will be named without further verification.

## International Processing

The Privacy Policy will explain that:

- MyInsightAcademy's primary operations and in-person tutoring are in Vietnam.
- Authorized online tutors may access assigned information from India and
  Singapore.
- Vercel, Resend, Meta, Supabase, OpenAI, Anthropic, and their subprocessors may
  process information in the United States and other infrastructure locations
  described in their current service terms.
- International destinations may have different data-protection rules.
- Where applicable, processing and transfer safeguards will be selected based
  on contract, consent, necessity to provide requested services, and legal
  requirements; the document will not claim that a particular transfer
  mechanism or certification covers all users without evidence.

## Legal Positioning

The drafting will be informed by, but will not claim certification under:

- Vietnam Personal Data Protection Law No. 91/2025/QH15, effective January 1,
  2026.
- Vietnam Decree 13/2023/NĐ-CP on personal data protection.
- Transparency principles in Articles 13 and 14 of the EU GDPR where applicable.
- Children's privacy requirements, including parental notice/consent concepts,
  where a country's rules apply.

The policy will present legal bases only where applicable: contract or steps
requested before a contract, consent, legitimate interests balanced against
individual rights, compliance with law, and protection of vital interests in an
emergency. It will map these bases to concrete purposes and will not say that
every basis applies in every country.

Vietnam will be identified as the intended governing law because it is the
service's primary place of operation. Disputes will first be raised informally
through `hello@myinsightacademy.com`; if not resolved, they may be brought before
a court of competent jurisdiction in Vietnam, subject to mandatory consumer and
other laws. This language requires lawyer review before publication.

The limitation-of-liability clause will exclude indirect, incidental, special,
consequential, and loss-of-data/profit damages only to the extent permitted by
law and only where reasonable. It will not invent a monetary cap. It will not
exclude liabilities that cannot legally be limited, including applicable
consumer rights, fraud, wilful misconduct, or death/personal injury caused by
negligence where such exclusions are prohibited.

Indemnification will be narrow and apply only to adult users and tutors for
third-party claims resulting from their unlawful content, infringement, or
material breach. It will not apply to minors and will remain subject to
applicable law.

## Privacy Policy Content

The page will include the following sections in this order:

1. Introduction and operator identity.
2. Scope and WhatsApp/Meta notice.
3. Information users provide.
4. Accounts, profiles, and parent/student relationships.
5. Tutoring, scheduling, reminders, messages, and uploaded files.
6. WhatsApp and Hermes AI information, including voice notes, media, documents,
   metadata, phone numbers, and conversation context.
7. Automatically collected device, cookie, local-storage, and log data.
8. How and why information is used.
9. Legal bases where applicable.
10. Disclosure to tutors, parents, administrators, providers, and authorities.
11. Named service providers.
12. International processing and transfers.
13. AI-output limitations and high-risk-use warning.
14. Retention criteria.
15. Security practices and limitations.
16. Privacy rights and identity verification.
17. Platform account and WhatsApp-data deletion instructions.
18. Children, minimum age 12, and parental involvement/consent.
19. Third-party links and services.
20. Policy changes.
21. Contact details.

## Terms of Service Content

The page will include the following sections in this order:

1. Acceptance and identification of the operator.
2. Eligibility, minimum age 12, and parental authority.
3. Student, parent, and tutor account responsibilities.
4. Account credentials and security.
5. Tutoring relationships and role boundaries.
6. Scheduling, attendance, cancellation, and case-by-case rescheduling.
7. Monthly invoices and separately communicated payment terms.
8. Private chat, file uploads, and contact-information restrictions.
9. Acceptable use and prohibited conduct.
10. User-content ownership and a limited operational license.
11. MyInsightAcademy intellectual property.
12. WhatsApp messaging consent, opt-out, and Meta terms.
13. Hermes/AI disclosure, accuracy limits, and prohibited high-risk reliance.
14. Third-party services.
15. Service availability, maintenance, and modifications.
16. Suspension, deactivation, and termination.
17. Disclaimers that preserve mandatory consumer rights.
18. Reasonable limitation of liability without an invented monetary cap.
19. Narrow adult-user/tutor indemnification.
20. Vietnam governing law and informal-then-court dispute process.
21. Changes and contact details.

## Page Architecture and Visual Design

Use static App Router Server Components with no new runtime dependency:

- `src/app/(public)/privacy/page.tsx`: Privacy Policy content and route metadata.
- `src/app/(public)/terms/page.tsx`: Terms content and route metadata.
- `src/components/legal/legal-page.tsx`: shared legal document shell, public
  navigation, title area, effective-date presentation, table of contents,
  section spacing, lawyer-review notice, and public footer.
- `src/components/legal/legal-page.css`: focused responsive styles where inline
  styles or existing utilities are insufficient.
- `src/app/(public)/page.tsx`: add visible Privacy and Terms links to the existing
  footer.
- `src/app/legal-pages.test.cjs`: test route existence, required metadata,
  canonical URLs, heading hierarchy/content markers, contact information,
  placeholders, and landing-footer links.

The legal shell will match the existing Geist typography, navy/slate/gold color
tokens, sticky 60-pixel public navigation, `72rem` outer width, bordered white
surfaces, and responsive spacing. The readable document column will be narrower
than the landing page. On wider screens, a compact table of contents may sit
beside the document; on mobile it will become an in-flow navigation block. The
page will preserve native links and headings and will not require JavaScript.

Each route will export Next.js metadata with:

- A descriptive title.
- A concise description.
- An absolute canonical URL under `https://myinsightacademy.com`.

Heading hierarchy will contain one `h1`, followed by ordered `h2` sections and
`h3` subsections only when necessary.

## Testing and Verification

Implementation will follow a red-green-refactor cycle:

1. Add a failing test for route files, metadata, required disclosures, and
   public footer links.
2. Run the test and confirm failure is due to missing legal pages/links.
3. Add the shared shell and Privacy Policy.
4. Run the test and resolve only Privacy-related failures.
5. Add the Terms page and landing-footer links.
6. Run the test suite and refactor shared presentation while keeping it green.

Before completion, run fresh verification:

- All Node test files under `src/**/*.test.cjs`.
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- Start the production server locally and verify `/privacy` and `/terms` return
  HTTP 200 without authentication.
- Browser-check both routes at a desktop width and a mobile width, including
  navigation, overflow, readable line length, focusable links, footer, metadata,
  and heading hierarchy.

## Publication Gate and Legal Review

The implementation is a legal draft, not legal advice. The final handoff must
state that both documents require review by a qualified lawyer familiar with
Vietnamese law and relevant international privacy, consumer, education, and
children's-privacy rules.

No deployment or publication is authorized. The July 1, 2020 effective date and
the possible need for a separate "Last updated" date must be confirmed during
wording and legal review.
