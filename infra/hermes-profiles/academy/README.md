# Academy profile deployment

Create the profile from the current Hermes configuration, then restrict the WhatsApp-facing toolsets:

```yaml
platform_toolsets:
  whatsapp:
    - insight_scheduling
    - clarify

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

The onboarding setting disables Hermes's generic first-contact request to build a personal user profile. The memory setting independently prevents `USER.md` profile loading for external contacts. The display overrides keep customer-facing Cloud API chats limited to Kitty's final answer rather than internal progress or busy-state commentary. The WhatsApp Cloud command policy makes Swati the only slash-command administrator; ordinary contacts can still chat normally and use the Academy capabilities through natural language.

Copy `hooks/academy-help` to the profile's `hooks/academy-help` directory. This supported Hermes gateway hook replaces `/help` and `/whoami` output for non-admin WhatsApp contacts with the small Academy help message while leaving Swati's operator help intact.

Do not enable terminal, file, code execution, browser, delegation, cross-session search, general memory, or unrestricted Google Workspace tools for this profile. Keep the pilot `WHATSAPP_CLOUD_ALLOWED_USERS` list explicit until end-to-end testing passes.

The deployed Hermes revision must provide `gateway.session_context` backed by Python `ContextVar`, and its WhatsApp Cloud adapter must set equal DM `chat_id` and `user_id` values while rejecting group-shaped payloads. Fail the deployment if that integration probe or `hermes -p academy config check` fails.
