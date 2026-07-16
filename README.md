# Insight Tutors MVP

Private, role-based communication for a tutoring agency. Teachers and students (or parents) message inside the platform, while the admin manages assignments and oversight.

## Stack

- Next.js (App Router) + TypeScript
- Supabase Auth + Postgres + Realtime
- Tailwind CSS + shadcn/ui

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Supabase setup

Pick one of the following:

**Option A: Supabase Cloud**

1. Create a Supabase project.
2. Run the SQL in supabase/schema.sql in the Supabase SQL editor.
3. Enable Realtime for the messages table (Database -> Replication).
4. In Supabase Auth settings, add the following redirect URLs:
	- http://localhost:3000/auth/callback
	- http://localhost:3000/set-password

**Option B: Supabase Local**

1. Install the Supabase CLI.
2. Start local Supabase:
	```bash
	supabase start
	```
3. Apply schema:
	```bash
	supabase db push
	```

### 3) Environment variables

Create a .env.local file from .env.example and fill in the values.

```bash
cp .env.example .env.local
```

### 4) Run the app

```bash
npm run dev
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Yes | Supabase project URL. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Supabase anon key (public). |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Supabase service role key (server-only). |
| RESEND_API_KEY | Yes | Resend API key for app-sent email. |
| EMAIL_FROM | Yes | Sender email address for app-sent email. |
| EMAIL_FROM_NAME | No | Sender display name. Defaults to Insight Academy. |
| ADMIN_EMAIL | Yes | Admin notification recipient. |
| NEXT_PUBLIC_DEV_BYPASS_AUTH | No | Set to true to bypass auth in dev only. |
| NEXT_PUBLIC_DEV_BYPASS_ROLE | No | Role to use with auth bypass: admin, teacher, student. |
| WHATSAPP_CLOUD_ACCESS_TOKEN | For WhatsApp | Permanent Meta system-user token; server-only. |
| WHATSAPP_CLOUD_PHONE_NUMBER_ID | For WhatsApp | Meta phone-number ID, not the visible phone number. |
| WHATSAPP_CLOUD_APP_SECRET | For WhatsApp | Meta app secret used to verify raw webhook signatures. |
| WHATSAPP_CLOUD_VERIFY_TOKEN | For WhatsApp | Random callback verification token shared with Meta. |
| WHATSAPP_CLOUD_API_VERSION | No | Pinned Graph API version. |
| HERMES_FORWARD_URL | For WhatsApp | Existing Hermes Cloud API webhook URL used after Insight policy checks. |
| HERMES_TOOL_SHARED_SECRET | For WhatsApp | Random HMAC secret shared only by Insight and Hermes. |
| HERMES_ADMIN_WHATSAPP_E164 | For WhatsApp | Swati's verified WhatsApp number in E.164 format; this is the only scheduling administrator. |
| WHATSAPP_SENDER_SHARED_SECRET | For WhatsApp | Separate random HMAC secret used only for Insight's private sender dispatch. Never install it on Hermes. |
| HERMES_IMPORT_SIGNING_SECRET | For WhatsApp | Random server-only secret for short-lived import previews. |
| WHATSAPP_TEMPLATE_LOCALE | No | Approved template locale, normally `en_US`. |
| WHATSAPP_TEMPLATE_PERMISSION_REQUEST | For first contact | Approved fixed opt-in/opt-out introduction template name. |
| WHATSAPP_TEMPLATE_AVAILABILITY_REQUEST | For proactive outreach | Approved Meta template name. |
| WHATSAPP_TEMPLATE_TIME_PROPOSAL | For proactive outreach | Approved Meta template name. |
| WHATSAPP_TEMPLATE_CLASS_CONFIRMATION | For proactive outreach | Approved Meta template name. |
| WHATSAPP_TEMPLATE_RESCHEDULE_REQUEST | For proactive outreach | Approved Meta template name. |
| WHATSAPP_TEMPLATE_CLASS_REMINDER | For proactive outreach | Approved Meta template name. |
| WHATSAPP_TEMPLATE_HUMAN_ATTENTION | For proactive outreach | Approved Meta template name. |

Note: Do not commit .env.local. Share secrets out of band.

## First Admin Creation

1. Create a user in Supabase Auth (email/password).
2. Insert a profile row for the admin user:
	```sql
	insert into public.profiles (id, full_name, role, is_active)
	values ('<auth-user-uuid>', 'Admin Name', 'admin', true);
	```

## Invite Flow

Admins invite teachers and students (parents) from the /admin page. Invited users receive an email link, set their password at /set-password, and then log in.

## Workflow Test

1. Log in as admin.
2. Invite a teacher and a student.
3. Assign the student to the teacher.
4. Log in as teacher and open the chat.
5. Log in as student and open the chat.
6. Exchange messages and confirm realtime updates.
7. Try sending a phone number or email address and confirm it is blocked.
8. Confirm unrelated teachers/students cannot access each other.

## Hermes WhatsApp Operations

The `/admin/hermes` area is a separate academy contact directory inside the existing Supabase project. It does not create Auth users or modify portal records unless Swati explicitly confirms a suggested exact-name match.

### Import contacts

1. On Swati's iPhone, export only the academy contacts as a `.vcf` file.
2. Upload it at `/admin/hermes`. The preview retains only names and phone numbers.
3. Resolve duplicate or invalid numbers. Confirm any portal match explicitly; first-name-only matches are never linked.
4. Classify unmatched people as teacher, student, parent, employee, or other.
5. Attest that the selected contacts consented to academy WhatsApp messages, then commit the import.

Imported contacts default to direct communication after that attestation and can message Kitty immediately; no second Fly allowlist update is required. Insight is the single inbound authorization gate and forwards only imported, active, consent-attested, classified contacts whose communication policy is `direct`. Use an individual contact's policy to require approval, contact a guardian only, pause messages, or opt out. An inbound `STOP` also opts the contact out immediately.

### Meta templates

Create fixed-purpose Utility templates in WhatsApp Manager for availability requests, proposed times, confirmations, rescheduling, reminders, and human-attention notices. Put only approved template names in the matching environment variables. Do not let Hermes generate template names or categories. A recipient outside their own 24-hour service window can receive only one of these approved templates.

### Approval-first pilot

Keep the first rollout approval-first: Hermes may collect availability and propose times, but it must create a pending approval before class confirmation. Swati approves or rejects it in `/admin/hermes`. Unknown, unclassified, paused, guardian-only, approval-required, and opted-out contacts fail closed. Hermes receives no Supabase service key or Meta access token.

### Swati's two Hermes channels

Swati's default Photon/iMessage profile remains her private personal assistant and keeps its Google Workspace access. The `academy` WhatsApp Cloud profile is the business-facing assistant for imported teachers, students, parents, and employees. For the initial pilot, Swati should start Academy scheduling work by messaging Kitty on WhatsApp; iMessage instructions do not yet create an Insight scheduling case automatically.

The repository now includes a disabled-by-default first phase of shared iMessage intake. It is not active merely because the application is deployed. Follow `infra/hermes-profiles/default-insight/README.md`, keep `HERMES_IMESSAGE_INTAKE_ENABLED=false` until the staging identity probes pass, and do not copy the default profile's `HERMES_ADMIN_TOOL_SHARED_SECRET` or `insight-admin` plugin into the Academy profile.

Keep profile memories isolated. In particular, do not set `memory.mnemosyne.profile_isolation` to `false`: an external Academy conversation must not read, influence, or retrieve Swati's private-profile memory. Cross-channel coordination belongs in the guarded `hermes_*` scheduling tables and narrow Insight tool API, not in shared conversational memory.

### Deployment and activation

1. Apply `supabase/migrations/20260716131103_add_hermes_assistant.sql` and run Supabase security/performance advisors.
2. Deploy Insight with all server secrets, while leaving Meta's current callback unchanged.
3. Create the `academy` profile from the current model/WhatsApp configuration, copy `infra/hermes-plugins/insight-scheduling` into that profile's `plugins` directory, and enable it with `--no-allow-tool-override`.
4. Configure `platform_toolsets.whatsapp_cloud` for the business-facing profile. Disable terminal, code execution, image generation, computer control, delegation, and TTS. Retain the pilot-useful web/browser, file, vision, skills, todo, memory, session-search, clarification, cron, and `insight_scheduling` toolsets. Copy `infra/hermes-profiles/academy/SOUL.md` to the profile root and `AGENTS.md` to its working directory.
5. Keep Meta's callback on Insight and set `WHATSAPP_CLOUD_ALLOW_ALL_USERS=true` only in the Academy profile. Insight verifies Meta signatures and filters contacts before re-signing eligible payloads for Hermes. Keep the old explicit allowlist value for rollback.
6. Run `hermes -p academy config check` and `hermes -p academy tools list --platform whatsapp_cloud`. Confirm that the six disallowed toolsets are disabled and `insight_scheduling` is enabled before activating the profile.
7. Verify the Insight webhook GET challenge, signed tool calls, admin import, approval controls, and a test Meta send.
8. Change Meta's callback last to `https://<insight-host>/api/whatsapp/webhook` and subscribe to `messages`.

Useful endpoints are `/api/whatsapp/webhook` (Meta callback), `/api/whatsapp/send` (signed internal sender), `/api/hermes/tools` (signed Hermes actions), and `/admin/hermes` (human operations). Do not call either signed API from a browser or expose its shared secret.

### Rollback

If inbound handling fails, first set `WHATSAPP_CLOUD_ALLOW_ALL_USERS=false` on the Academy profile so its preserved explicit allowlist becomes authoritative, then restore Meta's callback to the exact URL stored in `HERMES_FORWARD_URL`; no database rollback is required. Keep the Insight tables for audit and delivery diagnosis. If outbound handling fails, pause affected contacts or remove the approved template environment variables, which makes proactive outreach fail closed. Never delete message or audit rows during incident response.

## Future Improvements (Not Implemented)

- Admin conversation search and filters
- File attachments and lesson materials
- Scheduled session reminders
- Production activation of the feature-flagged default-profile/iMessage intake after the Photon identity probe
- WhatsApp approval notifications and approve/reject replies for Swati
- Parent-only and student-only sub-roles
- Audit log for admin actions
