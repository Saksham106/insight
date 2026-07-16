"""Deterministic, default-profile-only Google Calendar workspace worker."""

from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import uuid


class WorkspaceWorkerError(Exception):
    def __init__(self, status, error_code):
        super().__init__(error_code)
        self.status = status
        self.error_code = error_code


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _iso(value):
    if not isinstance(value, str):
        raise ValueError("invalid_datetime")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("invalid_datetime")
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _error_http_status(completed):
    for raw in (completed.stdout, completed.stderr):
        try:
            value = json.loads(raw or "")
            code = value.get("error", {}).get("code")
            if isinstance(code, int) and 400 <= code <= 599:
                return code
        except (AttributeError, TypeError, ValueError):
            continue
    return None


def classify_gws_failure(failure):
    if isinstance(failure, subprocess.TimeoutExpired):
        return "retryable_failed", "gws_timeout"
    if failure.returncode == 2:
        return "permanent_failed", "gws_auth"
    if failure.returncode == 3:
        return "permanent_failed", "gws_validation"
    if failure.returncode == 4:
        return "retryable_failed", "gws_discovery"
    if failure.returncode == 5:
        return "retryable_failed", "gws_internal"
    status = _error_http_status(failure)
    if status == 429 or (status is not None and status >= 500):
        return "retryable_failed", f"google_{status}"
    if status is not None:
        return "permanent_failed", f"google_{status}"
    return "retryable_failed", "google_api_error"


def query_freebusy(payload, now=_utc_now):
    windows = payload.get("windows") if isinstance(payload, dict) else None
    if not isinstance(windows, list) or not windows or len(windows) > 50:
        raise WorkspaceWorkerError("permanent_failed", "invalid_job_payload")
    try:
        starts = [_iso(window["start"]) for window in windows]
        ends = [_iso(window["end"]) for window in windows]
        if any(end <= start for start, end in zip(starts, ends)):
            raise ValueError("invalid_window")
        request_body = {
            "timeMin": min(starts),
            "timeMax": max(ends),
            "timeZone": payload.get("timezone") or "UTC",
            "items": [{"id": "primary"}],
        }
    except (KeyError, TypeError, ValueError):
        raise WorkspaceWorkerError("permanent_failed", "invalid_job_payload") from None
    try:
        completed = subprocess.run(
            ["gws", "calendar", "freebusy", "query", "--json", canonical_json(request_body)],
            shell=False,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        status, error_code = classify_gws_failure(error)
        raise WorkspaceWorkerError(status, error_code) from None
    if completed.returncode != 0:
        status, error_code = classify_gws_failure(completed)
        raise WorkspaceWorkerError(status, error_code)
    try:
        decoded = json.loads(completed.stdout)
        primary = decoded["calendars"]["primary"]
        errors = primary.get("errors") or []
        if errors:
            reasons = {item.get("reason") for item in errors if isinstance(item, dict)}
            retryable = {"backendError", "rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"}
            if reasons & retryable:
                raise WorkspaceWorkerError("retryable_failed", "google_calendar_retryable")
            raise WorkspaceWorkerError("permanent_failed", "google_calendar_error")
        busy = [{"start": _iso(item["start"]), "end": _iso(item["end"])} for item in primary["busy"]]
        if len(busy) > 200 or any(item["end"] <= item["start"] for item in busy):
            raise ValueError("invalid_busy")
    except WorkspaceWorkerError:
        raise
    except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise WorkspaceWorkerError("permanent_failed", "invalid_google_response") from None
    return {"busy": busy, "checkedAt": _iso(now())}


def workspace_request(message):
    url = os.environ.get("INSIGHT_HERMES_WORKSPACE_URL", "")
    secret = os.environ.get("HERMES_WORKSPACE_WORKER_SECRET", "")
    if not url or not secret:
        raise WorkspaceWorkerError("permanent_failed", "worker_not_configured")
    body = canonical_json(message)
    timestamp = str(int(time.time() * 1000))
    request_id = uuid.uuid4().hex
    signature = hmac.new(secret.encode(), f"{timestamp}.{request_id}.{body}".encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(url, data=body.encode(), method="POST", headers={
        "Content-Type": "application/json",
        "X-Hermes-Timestamp": timestamp,
        "X-Hermes-Request-Id": request_id,
        "X-Hermes-Signature": signature,
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            decoded = json.loads(response.read().decode())
            if not isinstance(decoded, dict):
                raise ValueError("invalid_response")
            return decoded
    except urllib.error.HTTPError as error:
        code = "workspace_auth" if error.code in (401, 403) else "workspace_http_error"
        status = "permanent_failed" if error.code in (400, 401, 403, 404) else "retryable_failed"
        raise WorkspaceWorkerError(status, code) from None
    except (OSError, ValueError, json.JSONDecodeError):
        raise WorkspaceWorkerError("retryable_failed", "workspace_unavailable") from None


def run_once(worker_id=None):
    worker_id = worker_id or os.environ.get("HERMES_WORKSPACE_WORKER_ID", "")
    claimed = workspace_request({"action": "claim", "payload": {"workerId": worker_id, "limit": 5}}).get("jobs", [])
    summary = {"claimed": len(claimed), "succeeded": 0, "failed": 0}
    for job in claimed:
        try:
            if job.get("jobType") != "calendar_freebusy":
                raise WorkspaceWorkerError("permanent_failed", "unsupported_job_type")
            result = query_freebusy(job.get("payload"))
            completion = {"workerId": worker_id, "jobId": job["id"], "status": "succeeded", "result": result}
            summary["succeeded"] += 1
        except WorkspaceWorkerError as error:
            completion = {"workerId": worker_id, "jobId": job.get("id", "invalid"), "status": error.status, "errorCode": error.error_code}
            summary["failed"] += 1
        workspace_request({"action": "complete", "payload": completion})
    return summary


def status():
    worker_id = os.environ.get("HERMES_WORKSPACE_WORKER_ID", "")
    return workspace_request({"action": "status", "payload": {"workerId": worker_id}})


def command(args):
    if args.workspace_command == "run-once":
        print(canonical_json(run_once()))
        return 0
    if args.workspace_command == "status":
        print(canonical_json(status()))
        return 0
    raise SystemExit("Choose run-once or status")


def setup_argparse(subparser):
    commands = subparser.add_subparsers(dest="workspace_command")
    commands.add_parser("run-once", help="Claim and process up to five Calendar jobs")
    commands.add_parser("status", help="Show queue counts without job payloads")
    subparser.set_defaults(func=command)
