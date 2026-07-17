# Default-profile Insight intake

This procedure enables Swati's default Photon/iMessage profile to use the same Insight scheduling cases as the Academy WhatsApp profile. It does not share profile memory, Google Workspace authorization, secrets, or conversation history.

The endpoint is disabled by default. Deploy it with:

```dotenv
HERMES_IMESSAGE_INTAKE_ENABLED=false
HERMES_ADMIN_IMESSAGE_ID_SHA256=
HERMES_ADMIN_TOOL_SHARED_SECRET=
```

Do not copy `HERMES_ADMIN_TOOL_SHARED_SECRET`, the `insight-admin` plugin, or the default profile's Google Workspace files into the Academy profile.

## Safe activation

1. Apply `20260716150000_add_hermes_case_origin.sql` and deploy the application while `HERMES_IMESSAGE_INTAKE_ENABLED=false`.
2. Copy `infra/hermes-plugins/insight-admin` only into the default profile's plugins directory and enable only its `insight_admin` toolset for the iMessage platform.
3. In staging, send one direct iMessage from Swati and inspect only the Hermes session-context identifiers. Confirm `platform=imessage`, a non-empty `chatId`, and `chatId == userId`. Do not record message content, tokens, or unrelated session data.
4. Hash the verified stable ID locally:

   ```bash
   printf %s '<verified-stable-id>' | shasum -a 256
   ```

   Configure the result as `HERMES_ADMIN_IMESSAGE_ID_SHA256` on the Insight server. Do not put the raw identifier in source control.
5. Generate a new high-entropy `HERMES_ADMIN_TOOL_SHARED_SECRET`. Configure it on the Insight server and only in the default profile.
6. Set this only in the default profile:

   ```dotenv
   INSIGHT_HERMES_ADMIN_TOOL_URL=https://<insight-host>/api/hermes/admin-tools
   HERMES_ADMIN_TOOL_SHARED_SECRET=<separate-admin-secret>
   ```

7. Run the repository plugin tests and `hermes config check` for the default profile.
8. Set `HERMES_IMESSAGE_INTAKE_ENABLED=true` in staging.
9. From Swati's verified direct iMessage session, test contact search, case creation, and case read. Confirm the case and audit record use `origin_platform=imessage` and actor kind `admin`.
10. Attempt the tool from a non-iMessage session and from an iMessage session whose `chatId` and `userId` do not match. Both must fail without returning Academy data.
11. Enable production only after all staging checks pass. Keep the Academy profile, Meta callback, and `HERMES_TOOL_SHARED_SECRET` unchanged.

## Read-only Calendar free/busy worker

The `insight-workspace` plugin lets the default profile process typed Calendar free/busy jobs without sharing Google authorization across profiles. Insight holds the queue. The default profile claims a job over a separately authenticated HMAC endpoint, asks `gws` about the authenticated account's `primary` calendar, and returns only busy intervals. The Academy profile does not receive the worker secret, Google credentials, event titles, descriptions, attendees, locations, links, or conversation history.

Keep the server switch off initially:

```dotenv
HERMES_WORKSPACE_JOBS_ENABLED=false
HERMES_WORKSPACE_WORKER_SECRET=<separate-high-entropy-worker-secret>
```

Install `infra/hermes-plugins/insight-workspace` only in the default profile, then configure only that profile with:

```dotenv
INSIGHT_HERMES_WORKSPACE_URL=https://<insight-host>/api/hermes/workspace-jobs
HERMES_WORKSPACE_WORKER_SECRET=<same-separate-worker-secret>
HERMES_WORKSPACE_WORKER_ID=swati_default_01
```

The worker is a no-agent CLI; it does not register an LLM-callable tool. Verify `gws auth status` and the read-only Calendar/free-busy scope in staging. Then enable the Insight switch in staging and run:

```bash
hermes insight-workspace status
hermes insight-workspace run-once
```

Before automation, insert a synthetic job whose windows contain no private labels. Confirm the result contains only normalized busy intervals and `checkedAt`. Also confirm an abandoned lease becomes claimable after five minutes, a duplicated job is not executed twice, a worker with the wrong secret is rejected, and disabling `HERMES_WORKSPACE_JOBS_ENABLED` immediately stops claims.

The every-minute no-agent schedule remains paused until all staging probes pass. The intended operating-system cron entry is shown as a comment so copying this repository cannot activate it:

```cron
# * * * * * /absolute/path/to/hermes insight-workspace run-once
```

Do not use an agent cron for this worker. Do not enable Calendar event writes in this read-only phase.

## Private Calendar event writes

Calendar writes are a separate fail-closed capability. Keep this Insight server flag disabled until its staging probes pass:

```dotenv
HERMES_CALENDAR_WRITES_ENABLED=false
```

For an explicitly Swati-taught case, consuming her exact approval creates one typed `calendar_create_event` job. The worker derives `primary`, checks the deterministic event ID with `gws calendar events get`, performs a final free/busy check, and only then calls `gws calendar events insert`. The event is private and busy, has no attendees, description, reminders, recurrence, attachments, or conference data, and stores only opaque Insight identifiers in private extended properties. Kitty cannot send a participant confirmation until the Calendar job is ready.

In staging, upgrade the default profile's `gws` OAuth authorization to the minimum Calendar event-write scope. Create a synthetic Swati case with no real participant data, approve its exact time, and verify all of the following before enabling production:

1. The event appears once on the primary calendar with the expected private visibility and deterministic event ID.
2. Interrupt the worker after `events insert`, let the lease expire, and run it again. `events get` must recover the same event without a duplicate.
3. Add a conflicting Calendar event before the final check. The job must return `calendar_conflict`, the case must become stale/needs-attention, and no participant confirmation may be sent.
4. Inspect the queue, result, logs, and audit metadata for absence of Google response bodies, event descriptions, attendees, and chat content.
5. Disable `HERMES_CALENDAR_WRITES_ENABLED` and pause the no-agent schedule. New Swati confirmations must fail closed while other tutor cases remain usable.

Rollback is to disable the flag first, pause the worker, and leave jobs/audit rows intact. Calendar events already created are not deleted automatically; compare the server-only Calendar link to the event ID and perform manual cleanup in Google Calendar if the approved class is cancelled. Calendar update/cancel, Meet creation, and reminders are not included yet.

## Rollback

1. Set `HERMES_IMESSAGE_INTAKE_ENABLED=false` on Insight first.
2. Disable the default profile's `insight_admin` toolset.
3. Leave scheduling cases and audit rows intact for diagnosis.
4. For the Calendar worker, set `HERMES_WORKSPACE_JOBS_ENABLED=false`, remove or pause the operating-system schedule, and disable the `insight-workspace` plugin. Allow active five-minute leases to expire; do not delete queued jobs during rollback.

Rollback does not modify the Academy profile, its WhatsApp secret, or Meta's callback. Existing WhatsApp scheduling and `/admin/hermes` approvals continue operating normally.
