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
                "For a tutor's requested lesson ledger, first call get_my_open_objectives={} and use the "
                "returned cycleId. Lesson reports use submit_lesson_report={cycleId,lessons:[{reportedStudentName,"
                "studentContactId?,lessonDate,durationMinutes,subject?,note?}]} and "
                "confirm_lesson_report={reportId}. The server-side session identity decides permission: an "
                "external tutor can read, submit, and confirm only their own collection, while relationship, "
                "cycle, resolution, import, and request actions remain Swati-only. Never supply an actor, role, "
                "phone number, or channel in payload. "
                "The response includes notification status. Do not claim Swati was notified unless it reports "
                "accepted, sent, delivered, read, or duplicate of one of those states."
                " For Kitty class attendance, relays, cancellation, or rescheduling, first use "
                "find_my_classes={referenceDate,query?}; identify the individual student or whole class when relevant; "
                "ask the sender to confirm the exact occurrence and confirm the exact scope; then use "
                "confirm_class_selection={occurrenceId,occurrenceVersion}. It returns only the sender's represented "
                "students with opaque enrollmentHandle values. Only after that confirmation use its returned selectionToken. "
                "Attendance actions are record_class_attendance={occurrenceId,enrollmentHandle?,status,estimatedAt?,"
                "note?,selectionToken,clientRequestId?} and correct_class_attendance={attendanceId,occurrenceId,enrollmentHandle?,"
                "status,estimatedAt?,note?,selectionToken,clientRequestId?}. A bounded operational relay uses "
                "relay_class_update={occurrenceId,enrollmentHandle?,intent,estimatedAt?,mode?,locationLabel?,preparationCategory?,"
                "selectionToken,clientRequestId?}. A change request uses request_class_change={occurrenceId,occurrenceVersion,"
                "selectionToken,changeType,scope,enrollmentHandle?,proposedStartsAt?,proposedEndsAt?,proposedTimezone?,clientRequestId?}. "
                "The service notifies only the configured class contacts."
                " For replies about an existing request, call find_my_pending_changes={referenceCode?} before deciding;"
                " never infer an internal request ID from the short reference code. Use "
                "decide_class_change={requestId,requestVersion,payloadDigest,decision,providerMessageId?,clientRequestId?} "
                "or propose_replacement_time={requestId,requestVersion,payloadDigest,proposedStartsAt,proposedEndsAt,proposedTimezone?,clientRequestId?}. "
                "Those request-bound actions do not accept an occurrence ID."
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
