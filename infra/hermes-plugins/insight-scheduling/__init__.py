"""Register the restricted MyInsightAcademy scheduling tool."""

from .tools import ACTIONS, handle_insight_scheduling


def register(ctx):
    ctx.register_tool(
        name="insight_scheduling",
        toolset="insight_scheduling",
        description="Perform a permission-checked MyInsightAcademy scheduling action for the current WhatsApp contact.",
        schema={
            "name": "insight_scheduling",
            "description": (
                "Use the MyInsightAcademy scheduling service. The service automatically identifies the current "
                "WhatsApp sender and rejects actions or records they are not allowed to access. Use canonical "
                "camelCase fields. request_reschedule={caseId,reason} and escalate_to_swati={caseId,reason}. "
                "The response includes notification status. Do not claim Swati was notified unless it reports "
                "accepted, sent, delivered, read, or duplicate of one of those states."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": list(ACTIONS)},
                    "payload": {"type": "object", "description": "Structured parameters for the selected action."},
                },
                "required": ["action", "payload"],
                "additionalProperties": False,
            },
        },
        handler=handle_insight_scheduling,
    )
