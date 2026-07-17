"""Register the default-profile MyInsightAcademy administrator tool."""

from .tools import ACTIONS, handle_insight_admin


def register(ctx):
    ctx.register_tool(
        name="insight_admin",
        toolset="insight_admin",
        description="Manage MyInsightAcademy scheduling from Swati's verified iMessage session.",
        schema={
            "name": "insight_admin",
            "description": (
                "Use the shared Insight scheduling service as Swati. Identity comes from the current "
                "direct iMessage session."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": list(ACTIONS)},
                    "payload": {"type": "object"},
                },
                "required": ["action", "payload"],
                "additionalProperties": False,
            },
        },
        handler=handle_insight_admin,
    )
