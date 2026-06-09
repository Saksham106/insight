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

## Future Improvements (Not Implemented)

- Admin conversation search and filters
- File attachments and lesson materials
- Scheduled session reminders
- Parent-only and student-only sub-roles
- Audit log for admin actions
