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

This phase provides shared case intake only. It does not add the Calendar worker, Calendar event creation, Google Sheets access, or WhatsApp approval replies.

## Rollback

1. Set `HERMES_IMESSAGE_INTAKE_ENABLED=false` on Insight first.
2. Disable the default profile's `insight_admin` toolset.
3. Leave scheduling cases and audit rows intact for diagnosis.

Rollback does not modify the Academy profile, its WhatsApp secret, or Meta's callback. Existing WhatsApp scheduling and `/admin/hermes` approvals continue operating normally.
