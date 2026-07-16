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
```

Do not enable terminal, file, code execution, browser, delegation, cross-session search, general memory, or unrestricted Google Workspace tools for this profile. Keep the pilot `WHATSAPP_CLOUD_ALLOWED_USERS` list explicit until end-to-end testing passes.

The deployed Hermes revision must provide `gateway.session_context` backed by Python `ContextVar`, and its WhatsApp Cloud adapter must set equal DM `chat_id` and `user_id` values while rejecting group-shaped payloads. Fail the deployment if that integration probe or `hermes -p academy config check` fails.
