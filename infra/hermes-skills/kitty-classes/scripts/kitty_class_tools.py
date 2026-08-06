#!/usr/bin/env python3
"""Call the isolated Kitty class endpoint from a verified Hermes session."""

import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid


ADMIN_ACTIONS = frozenset(("preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class"))
CONTACT_ACTIONS = frozenset(("find_my_classes", "confirm_class_selection", "request_class_change", "decide_class_change", "propose_replacement_time"))


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ADMIN_ACTIONS | CONTACT_ACTIONS:
        print("usage: kitty_class_tools.py ACTION JSON_PAYLOAD", file=sys.stderr)
        return 2
    url = os.environ.get("INSIGHT_KITTY_CLASS_TOOL_URL", "")
    platform = os.environ.get("HERMES_SESSION_PLATFORM", "")
    chat_id = os.environ.get("HERMES_SESSION_CHAT_ID", "")
    user_id = os.environ.get("HERMES_SESSION_USER_ID", "")
    secret_name = "HERMES_ADMIN_TOOL_SHARED_SECRET" if sys.argv[1] in ADMIN_ACTIONS else "HERMES_TOOL_SHARED_SECRET"
    secret = os.environ.get(secret_name, "")
    direct_imessage = platform == "photon" and re.fullmatch(r"\+[1-9]\d{7,14}", user_id) and chat_id == f"any;-;{user_id}"
    direct_whatsapp = platform == "whatsapp_cloud" and re.fullmatch(r"[1-9]\d{7,14}", user_id) and chat_id == user_id
    if not url or not secret or (sys.argv[1] in ADMIN_ACTIONS and not direct_imessage) or (sys.argv[1] in CONTACT_ACTIONS and not direct_whatsapp):
        print(json.dumps({"error": "Verified Kitty class session is not configured"}))
        return 2
    try:
        payload = json.loads(sys.argv[2])
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
    except (json.JSONDecodeError, ValueError) as error:
        print(json.dumps({"error": str(error)}))
        return 2
    actor = {"platform": platform, "chatId": chat_id, "userId": user_id}
    body = json.dumps({"actor": actor, "action": sys.argv[1], "payload": payload}, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    request_id = uuid.uuid4().hex
    signature = hmac.new(secret.encode(), f"{timestamp}.{request_id}.{body}".encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(url, data=body.encode(), method="POST", headers={
        "Content-Type": "application/json", "X-Hermes-Timestamp": timestamp,
        "X-Hermes-Request-Id": request_id, "X-Hermes-Signature": signature,
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(response.read().decode())
            return 0
    except urllib.error.HTTPError as error:
        print(error.read().decode() or json.dumps({"error": f"HTTP {error.code}"}))
        return 1
    except urllib.error.URLError:
        print(json.dumps({"error": "Kitty class service unavailable"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
