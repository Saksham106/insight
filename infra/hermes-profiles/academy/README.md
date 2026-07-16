# Academy profile deployment

Create the profile from the current Hermes configuration, then restrict the WhatsApp-facing toolsets:

```yaml
platform_toolsets:
  whatsapp_cloud:
    - web
    - browser
    - file
    - vision
    - skills
    - todo
    - memory
    - session_search
    - insight_scheduling
    - clarify
    - cronjob

plugins:
  enabled:
    - insight-scheduling

onboarding:
  # Keep this quoted: Hermes expects the string "off", not YAML boolean false.
  profile_build: "off"

memory:
  user_profile_enabled: false

display:
  platforms:
    # The official Meta adapter uses the whatsapp_cloud platform key.
    whatsapp_cloud:
      busy_ack_detail: false
      busy_steer_ack_enabled: false
      interim_assistant_messages: false
      long_running_notifications: false
      tool_progress: "off"

gateway:
  platforms:
    whatsapp_cloud:
      # Hermes sender IDs contain digits only, without a leading plus sign.
      allow_admin_from: ["84917583553"]
      user_allowed_commands: []
```

The onboarding setting disables Hermes's generic first-contact request to build a personal user profile. The memory setting independently prevents `USER.md` profile loading for external contacts. It does not disable the general memory tool retained for the pilot. Keep `memory.mnemosyne.profile_isolation` enabled so Academy conversations cannot share Swati's private-profile memory. The display overrides keep customer-facing Cloud API chats limited to Kitty's final answer rather than internal progress or busy-state commentary. The WhatsApp Cloud command policy makes Swati the only slash-command administrator; ordinary contacts can still chat normally and use the Academy capabilities through natural language.

Copy `hooks/academy-help` to the profile's `hooks/academy-help` directory. This supported Hermes gateway hook replaces `/help` and `/whoami` output for non-admin WhatsApp contacts with the small Academy help message while leaving Swati's operator help intact.

## Inbound authorization boundary

Insight is the single contact-authorization gate. Set this in the Academy profile `.env`:

```dotenv
WHATSAPP_CLOUD_ALLOW_ALL_USERS=true
```

This setting removes Hermes's duplicate phone allowlist; it does not make the Academy publicly conversational. The Meta callback must remain the signed Insight webhook. Insight verifies Meta's signature and forwards only an imported, active, consent-attested, classified contact with `communication_policy=direct`. Unknown, unclassified, paused, guardian-only, approval-required, and opted-out contacts are recorded safely and are not forwarded to Kitty. Insight re-signs the filtered payload with the Meta app secret before sending it to the Academy Cloud adapter.

Keep the previous `WHATSAPP_CLOUD_ALLOWED_USERS` value as rollback data. If Meta's callback is ever restored directly to Hermes, set `WHATSAPP_CLOUD_ALLOW_ALL_USERS=false` before or at the same time so the explicit Hermes allowlist becomes authoritative again.

Do not enable terminal, code execution, image generation, computer control, delegation, TTS, or unrestricted Google Workspace credentials for this profile. The pilot intentionally retains web/browser, file, vision, skills, todo, memory, session search, clarification, and cron capabilities; revisit that broader set only after observing real usage.

The deployed Hermes revision must provide `gateway.session_context` backed by Python `ContextVar`, and its WhatsApp Cloud adapter must set equal DM `chat_id` and `user_id` values while rejecting group-shaped payloads. Fail the deployment if that integration probe or `hermes -p academy config check` fails.
