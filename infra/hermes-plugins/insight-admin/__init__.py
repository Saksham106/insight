"""Register the default-profile MyInsightAcademy administrator tool."""

from .tools import ACTIONS, handle_insight_admin


PAYLOAD_GUIDANCE = (
    "Use exact camelCase payload fields. Common contracts: "
    "get_academy_info={topic: about|scheduling|privacy|ai_assistant|subjects|contact}; "
    "search_contacts={query}; get_contact={contactId}; "
    "create_case={title,tutorKind,timezone,participants:[{contactId,participantRole}]}; "
    "get_case={caseId}; list_cases={status?,contactId?,limit?}; "
    "send_message={contactId,caseId,intent,text?,templateData?,bodyParameters?,"
    "idempotencyKey,approvalId?}. Scheduling messages require a case and the recipient must be "
    "a participant. send_message sends synchronously from Insight to the WhatsApp Cloud API; it "
    "does not upload or queue work for the Academy profile. Outside the 24-hour service window, "
    "For class_reminder, use templateData={classDescription,scheduledDateTime}; Insight supplies the "
    "recipient name and exact approved template parameter order. bodyParameters is legacy-only. A corrected retry after "
    "a failed reserved send needs a new idempotencyKey. Do not claim delivery unless the tool reports it."
)


def register(ctx):
    ctx.register_tool(
        name="insight_admin",
        toolset="insight_admin",
        description="Manage MyInsightAcademy scheduling from Swati's verified iMessage session.",
        schema={
            "name": "insight_admin",
            "description": (
                "Use the shared Insight scheduling service as Swati. Identity comes from the current "
                "direct iMessage session. " + PAYLOAD_GUIDANCE
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": list(ACTIONS)},
                    "payload": {"type": "object", "description": PAYLOAD_GUIDANCE},
                },
                "required": ["action", "payload"],
                "additionalProperties": False,
            },
        },
        handler=handle_insight_admin,
    )
