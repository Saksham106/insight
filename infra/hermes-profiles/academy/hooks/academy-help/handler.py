"""Contact-safe help for the MyInsightAcademy WhatsApp profile."""


SWATI_WHATSAPP_USER_ID = "84917583553"
ACADEMY_HELP = """🐾 *Kitty can help with*

• Class scheduling, availability, reminders, and rescheduling
• Questions about MyInsightAcademy
• Tutoring and study-related questions
• Passing a message or request to Swati

Just write what you need in ordinary language—no commands are required.

Send *STOP* anytime to opt out."""


def handle(event_type, context):
    """Handle Academy help commands for external WhatsApp contacts."""
    del event_type
    if context.get("platform") != "whatsapp_cloud":
        return None
    if str(context.get("user_id", "")) == SWATI_WHATSAPP_USER_ID:
        return None
    return {"decision": "handled", "message": ACADEMY_HELP}
