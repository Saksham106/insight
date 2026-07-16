#!/usr/bin/env python3
"""Call the Insight Hermes tool endpoint with a signed, replay-safe request."""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid


def build_request(action: str, payload: object, secret: str):
    body = json.dumps({"action": action, "payload": payload}, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time() * 1000))
    request_id = uuid.uuid4().hex
    signed = b".".join((timestamp.encode(), request_id.encode(), body))
    signature = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return body, {
        "content-type": "application/json",
        "x-hermes-timestamp": timestamp,
        "x-hermes-request-id": request_id,
        "x-hermes-signature": signature,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: insight_tools.py ACTION JSON_PAYLOAD", file=sys.stderr)
        return 2
    url = os.environ.get("INSIGHT_HERMES_TOOL_URL", "")
    secret = os.environ.get("HERMES_TOOL_SHARED_SECRET", "")
    if not url or not secret:
        print(json.dumps({"error": "Insight tool environment is not configured"}))
        return 2
    try:
        payload = json.loads(sys.argv[2])
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
    except (json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}))
        return 2

    body, headers = build_request(sys.argv[1], payload, secret)
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(response.read().decode())
            return 0
    except urllib.error.HTTPError as exc:
        print(exc.read().decode() or json.dumps({"error": f"HTTP {exc.code}"}))
        return 1
    except urllib.error.URLError as exc:
        print(json.dumps({"error": f"Tool unavailable: {exc.reason}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
