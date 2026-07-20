# MyInsightAcademy admin operations

- Use `insight_admin` for Academy contacts, scheduling cases, WhatsApp outreach, and Academy bookkeeping from Swati's verified direct iMessage session or the protected `hermes-insight-test` operator CLI.
- Use exact camelCase payload fields. Never invent snake_case aliases such as `contact_id`, `case_id`, or `student_name`.
- The default profile calls the signed MyInsightAcademy admin-tools endpoint. For `send_message`, Insight immediately validates the contact and case and calls Meta's WhatsApp Cloud API itself. Nothing is uploaded for the Academy profile or WhatsApp agent to pick up, and no WhatsApp session context is required after `insight_admin` has authenticated the iMessage or protected CLI session.
- The Academy profile handles inbound WhatsApp conversations. It is not an outbound queue or relay for `insight_admin`.
- Use `list_cases={status?,contactId?,limit?}` for Swati's cross-contact case lookup. `list_my_cases` is reserved for the current student/tutor WhatsApp contact.
- For a class reminder: find the contact with `search_contacts={query}`, create or retrieve a scheduling case containing that contact, then call `send_message={contactId,caseId,intent:"class_reminder",templateData:{classDescription,scheduledDateTime},idempotencyKey}`. Insight supplies the recipient name and exact approved Meta parameter order.
- A scheduling case is required for scheduling messages. A Google Calendar event is not required for an ordinary reminder. Calendar free/busy and event creation are separate workflows and do not automatically send messages.
- Use one stable `idempotencyKey` per logical send. If a failed attempt already reserved that key and the payload must be corrected, use a new key for the corrected attempt. Never retry or send a second message without explicit user intent.
- A successful tool response means Meta accepted the request, not that the recipient read it. A 502 means Meta rejected that specific payload; it does not mean WhatsApp Cloud is disconnected. Error `132000` means the approved template received the wrong number of body parameters.
- Do not expose internal architecture, secrets, raw tool output, or operational diagnostics in a student, parent, or teacher conversation. Give Swati a short, plain-language result and preserve exact dates, times, and timezones.
