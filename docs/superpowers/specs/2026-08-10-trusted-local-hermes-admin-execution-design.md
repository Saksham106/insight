# Trusted Local Hermes Admin Execution Design

**Date:** 2026-08-10  
**Status:** Approved

## Objective

Allow Swati's default-profile Hermes cron jobs, CLI, and TUI to use the
MyInsightAcademy administrator tool without pretending to be a live Photon
conversation. Shell access to the tenant Machine is the authorization boundary
for these local execution surfaces.

The existing verified direct iMessage path remains supported. Academy WhatsApp
contacts remain restricted by their server-derived contact identity and do not
gain administrator access.

## Trust boundary

The default profile holds `HERMES_ADMIN_TOOL_SHARED_SECRET` and calls the
separate `/api/hermes/admin-tools` endpoint. That signed endpoint is the trust
boundary for local administrator requests.

The `insight_admin` plugin will classify these execution surfaces:

- a verified direct Photon/iMessage session is an administrator;
- a Hermes cron run marked by `HERMES_CRON_SESSION=1` is an administrator;
- a local Hermes `cli` or `tui` session is an administrator; and
- every messaging or unrecognized surface is rejected locally.

For cron, CLI, and TUI, the plugin sends a bounded internal actor marker rather
than manufacturing Swati's phone number. The admin-tools endpoint accepts that
marker only after validating its existing HMAC request signature. The Academy
WhatsApp endpoint uses a different secret and actor parser, so a WhatsApp
contact cannot select or spoof the local administrator marker.

## Data flow

1. Hermes starts a default-profile cron, CLI, TUI, or direct iMessage turn.
2. `insight_admin` derives the execution surface from Hermes session context.
3. The plugin rejects messaging and unknown surfaces before any network call.
4. For an allowed surface, the plugin signs the request with the existing
   default-profile administrator secret and includes either the verified
   Photon actor or a canonical internal actor marker.
5. `/api/hermes/admin-tools` verifies the signature and recognizes the actor as
   Swati/admin. Existing action authorization, audit, Insight validation, and
   Meta sending behavior then run unchanged.

## Removed compatibility launcher

The `hermes-insight-test` launcher is no longer necessary. Ordinary protected
operator CLI/TUI sessions now have the intended administrator behavior without
injecting Photon phone-number environment variables. Remove the launcher, its
tests, and the temporary-launcher documentation.

## Error handling

- A WhatsApp, group-message, or unknown execution surface returns a local
  administrator-tool authorization error and makes no Insight or Meta request.
- A malformed internal actor is rejected by the server.
- An invalid HMAC signature remains unauthorized regardless of actor contents.
- Agent instructions must distinguish a local authorization failure from a
  request that reached and was rejected by Meta.

## Testing

Plugin tests will prove that:

- verified direct Photon/iMessage remains allowed;
- cron, CLI, and TUI are allowed without a phone identity;
- WhatsApp, other messaging platforms, Photon groups, and unknown surfaces are
  rejected before the HTTP request; and
- internal requests contain only the canonical bounded actor marker.

Server tests will prove that:

- signed cron, CLI, and TUI actors are administrators on the admin endpoint;
- malformed internal actors and unsigned requests are rejected; and
- the WhatsApp endpoint cannot use the internal actor path.

Focused profile tests will verify the updated operator instructions and the
removal of the obsolete launcher. Existing Insight authorization and Hermes
profile test suites will run afterward for regression coverage.

## Rollback

Restore the direct-Photon-only plugin check and launcher if local internal
execution must be disabled. The API secret, Academy WhatsApp profile, contact
authorization rules, records, and audit history require no migration or data
rollback.
