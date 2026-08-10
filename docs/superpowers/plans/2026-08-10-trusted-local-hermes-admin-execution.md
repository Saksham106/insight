# Trusted Local Hermes Admin Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authorize default-profile Hermes cron, CLI, and TUI runs as Swati on the separately signed Insight admin endpoint while keeping Academy WhatsApp contacts restricted.

**Architecture:** The default-profile plugin classifies live session context into verified Photon, trusted local (`cli`/`tui`), trusted cron, or rejected. Trusted local runs send a canonical phone-free actor marker over the existing HMAC-signed admin endpoint; the server parses that marker only in `imessage_admin` mode and continues to derive WhatsApp actors exclusively through the WhatsApp parser.

**Tech Stack:** Python 3 `unittest`, TypeScript, Node test runner via `tsx`, Next.js route handlers, HMAC-authenticated Hermes tools.

## Global Constraints

- Preserve all existing uncommitted contact-import and lesson-cycle changes in the working tree.
- Do not change the Academy WhatsApp actor parser, endpoint secret, or contact authorization scopes.
- Do not manufacture or require Swati's phone identity for cron, CLI, or TUI.
- Treat unknown, messaging, API, desktop, and malformed surfaces as unauthorized unless separately specified.
- Remove the temporary `hermes-insight-test` launcher after ordinary local execution is covered.

---

### Task 1: Classify and sign trusted local plugin requests

**Files:**
- Modify: `infra/hermes-plugins/insight-admin/test_plugin.py`
- Modify: `infra/hermes-plugins/insight-admin/tools.py`

**Interfaces:**
- Consumes: Hermes `get_session_env(name, default)` values for `HERMES_SESSION_PLATFORM`, `HERMES_SESSION_SOURCE`, `HERMES_SESSION_CHAT_ID`, `HERMES_SESSION_USER_ID`, and `HERMES_CRON_SESSION`.
- Produces: `_session_actor() -> dict | None`, returning a verified Photon actor unchanged, `{"platform":"hermes_local","source":"cron|cli|tui"}` for trusted internal execution, and `None` for every other surface.

- [ ] **Step 1: Write failing plugin tests**

Add table-driven tests that set literal session values and assert:

```python
def test_trusts_cron_cli_and_tui_without_phone_identity(self):
    for values, expected_source in (
        ({"HERMES_CRON_SESSION": "1"}, "cron"),
        ({"HERMES_SESSION_SOURCE": "cli"}, "cli"),
        ({"HERMES_SESSION_SOURCE": "tui"}, "tui"),
    ):
        self.session_values = values
        self.assertEqual(
            self.tools._session_actor(),
            {"platform": "hermes_local", "source": expected_source},
        )
```

Also extend rejection coverage for `whatsapp_cloud`, `telegram`, `desktop`, `api_server`, and empty unknown context, and assert `urllib.request.urlopen` is not called for rejected surfaces. Keep the direct Photon test.

- [ ] **Step 2: Run the plugin test and verify RED**

Run: `python3 -m unittest infra/hermes-plugins/insight-admin/test_plugin.py -v`

Expected: FAIL because cron/CLI/TUI currently return an iMessage-only error instead of canonical internal actors.

- [ ] **Step 3: Implement minimal local classification**

Update `_session_actor()` to read the five session fields. Return the direct Photon actor only when its existing shape is valid; prefer `HERMES_CRON_SESSION=1` as `cron`; accept only source `cli` or `tui` when the platform is empty or `cli`; return `None` otherwise. Update `call_insight()` to reject `None` with `This admin tool requires Swati's direct iMessage or protected local Hermes session` and sign accepted actors unchanged.

- [ ] **Step 4: Run the plugin test and verify GREEN**

Run: `python3 -m unittest infra/hermes-plugins/insight-admin/test_plugin.py -v`

Expected: all tests PASS.

### Task 2: Accept bounded internal actors only on the signed admin route

**Files:**
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `src/lib/hermes/cases.ts`
- Modify: `src/app/api/hermes/tools/route.ts`

**Interfaces:**
- Consumes: actor marker `{"platform":"hermes_local","source":"cron|cli|tui"}`.
- Produces: `parseLocalHermesAdminActor(input: unknown): { source: "cron" | "cli" | "tui" } | null`.

- [ ] **Step 1: Write failing parser and route-boundary tests**

Add literal assertions:

```javascript
assert.deepEqual(parseLocalHermesAdminActor({ platform: "hermes_local", source: "cron" }), { source: "cron" });
assert.deepEqual(parseLocalHermesAdminActor({ platform: "hermes_local", source: "cli" }), { source: "cli" });
assert.deepEqual(parseLocalHermesAdminActor({ platform: "hermes_local", source: "tui" }), { source: "tui" });
for (const actor of [
  { platform: "hermes_local", source: "desktop" },
  { platform: "whatsapp_cloud", source: "cli" },
  { platform: "hermes_local", source: "cron", extra: "forged" },
]) assert.equal(parseLocalHermesAdminActor(actor), null);
```

Update the route-boundary test to require the admin mode to consider `parseLocalHermesAdminActor`, while the WhatsApp branch continues to call only `parseWhatsAppToolActor`.

- [ ] **Step 2: Run the Hermes case tests and verify RED**

Run: `node --test src/lib/hermes/cases.test.cjs`

Expected: FAIL because `parseLocalHermesAdminActor` does not exist.

- [ ] **Step 3: Implement the minimal bounded parser and route branch**

Implement the exported parser with exact keys `platform` and `source`, reject arrays/additional keys, and allow only `cron`, `cli`, or `tui`. In `handleHermesToolPost`, parse it only when `mode === "imessage_admin"`; define admin as either a verified iMessage actor or a valid local actor. Leave the HMAC check before actor parsing and leave WhatsApp actor parsing unchanged.

- [ ] **Step 4: Run focused server tests and verify GREEN**

Run: `node --test src/lib/hermes/cases.test.cjs`

Expected: all tests PASS.

### Task 3: Remove the launcher and align operator instructions

**Files:**
- Delete: `infra/hermes-profiles/default-insight/hermes-insight-test`
- Delete: `infra/hermes-profiles/default-insight/test_cli_launcher.py`
- Modify: `infra/hermes-profiles/default-insight/README.md`
- Modify: `infra/hermes-profiles/default-insight/AGENTS.md`
- Modify: `infra/hermes-profiles/default-insight/test_profile.py`
- Modify: `infra/hermes-plugins/insight-admin/__init__.py`

**Interfaces:**
- Consumes: trusted local execution behavior from Tasks 1 and 2.
- Produces: operator documentation and tool descriptions that accurately name direct iMessage plus protected cron/CLI/TUI authorization.

- [ ] **Step 1: Write a failing profile behavior assertion**

Update `test_profile.py` so its maintained instruction assertions require `cron`, `CLI`, and `TUI` authorization language and no longer invoke or inspect the temporary launcher. Update the plugin schema behavior test to require the public tool description to mention protected local Hermes execution instead of claiming identity always comes from iMessage.

- [ ] **Step 2: Run profile/plugin tests and verify RED**

Run: `python3 -m unittest infra/hermes-profiles/default-insight/test_profile.py infra/hermes-plugins/insight-admin/test_plugin.py -v`

Expected: FAIL because the maintained instructions and schema still describe direct iMessage only.

- [ ] **Step 3: Remove launcher and update maintained guidance**

Delete both launcher files. Remove the temporary operator-launcher section from the README. Update README, AGENTS instructions, and plugin description to state that the signed admin endpoint accepts verified direct iMessage plus protected default-profile cron/CLI/TUI, that WhatsApp remains separate, and that a local authorization failure is not a Meta rejection.

- [ ] **Step 4: Run profile/plugin tests and verify GREEN**

Run: `python3 -m unittest infra/hermes-profiles/default-insight/test_profile.py infra/hermes-plugins/insight-admin/test_plugin.py -v`

Expected: all tests PASS.

### Task 4: Full regression verification

**Files:**
- Verify only; do not modify unrelated failures.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: fresh evidence that the complete authorization change and existing profile behavior pass together.

- [ ] **Step 1: Run all focused Python tests**

Run: `python3 -m unittest infra/hermes-plugins/insight-admin/test_plugin.py infra/hermes-profiles/default-insight/test_profile.py -v`

Expected: all tests PASS.

- [ ] **Step 2: Run focused Hermes TypeScript tests**

Run: `node --test src/lib/hermes/cases.test.cjs src/lib/hermes/lesson-ledger.test.cjs src/lib/hermes/lesson-cycle-index.test.cjs`

Expected: all tests PASS.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff --check && git status --short && git diff -- infra/hermes-plugins/insight-admin infra/hermes-profiles/default-insight src/lib/hermes/cases.ts src/lib/hermes/cases.test.cjs src/app/api/hermes/tools/route.ts docs/superpowers`

Expected: no whitespace errors; only intended authorization changes plus the pre-existing contact-import/lesson-cycle edits remain.

- [ ] **Step 4: Commit only the authorization implementation files**

Stage explicit paths for this feature, preserving unrelated dirty files. Where a file contains both changes, review and stage the combined file only because the user-owned edits must remain intact and will be included transparently in the final handoff.

Commit message: `fix: trust protected local Hermes admin sessions`
