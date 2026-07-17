"""Session-bound MyInsightAcademy administrator tool for Swati's iMessage profile."""

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
import uuid


ACTIONS = (
    "get_academy_info",
    "search_contacts",
    "get_contact",
    "create_case",
    "get_case",
    "record_availability",
    "propose_times",
    "request_approval",
    "confirm_class",
    "send_message",
    "escalate_to_swati",
    "request_swati_freebusy",
    "get_workspace_job",
)


def _session_actor():
    from gateway.session_context import get_session_env

    return {
        "platform": get_session_env("HERMES_SESSION_PLATFORM", ""),
        "chatId": get_session_env("HERMES_SESSION_CHAT_ID", ""),
        "userId": get_session_env("HERMES_SESSION_USER_ID", ""),
    }


def call_insight(action, payload):
    if action not in ACTIONS:
        return json.dumps({"error": "Unsupported scheduling action"})
    actor = _session_actor()
    if (
        actor["platform"] != "imessage"
        or not actor["chatId"]
        or actor["userId"] != actor["chatId"]
    ):
        return json.dumps({"error": "This admin tool requires Swati's direct iMessage conversation"})
    url = os.environ.get("INSIGHT_HERMES_ADMIN_TOOL_URL", "")
    secret = os.environ.get("HERMES_ADMIN_TOOL_SHARED_SECRET", "")
    if not url or not secret:
        return json.dumps({"error": "Scheduling service is not configured"})

    body = json.dumps({"actor": actor, "action": action, "payload": payload or {}}, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    request_id = uuid.uuid4().hex
    signature = hmac.new(secret.encode(), f"{timestamp}.{request_id}.{body}".encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        url,
        data=body.encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Hermes-Timestamp": timestamp,
            "X-Hermes-Request-Id": request_id,
            "X-Hermes-Signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode()
    except urllib.error.HTTPError as error:
        try:
            safe = json.loads(error.read().decode())
            return json.dumps({"error": safe.get("error", "Scheduling request rejected"), "status": error.code})
        except Exception:
            return json.dumps({"error": "Scheduling request rejected", "status": error.code})
    except Exception:
        return json.dumps({"error": "Scheduling service is temporarily unavailable"})


def handle_insight_admin(params, **kwargs):
    del kwargs
    return call_insight(params.get("action", ""), params.get("payload", {}))
