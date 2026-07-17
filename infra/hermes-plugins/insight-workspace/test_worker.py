import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch


PLUGIN_DIR = Path(__file__).parent


def load_worker():
    path = PLUGIN_DIR / "worker.py"
    spec = importlib.util.spec_from_file_location("insight_workspace_worker", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()
        self.payload = {
            "windows": [
                {"start": "2026-07-20T09:00:00.000Z", "end": "2026-07-20T10:00:00.000Z"},
                {"start": "2026-07-21T11:00:00.000Z", "end": "2026-07-21T12:00:00.000Z"},
            ],
            "timezone": "Asia/Ho_Chi_Minh",
        }
        self.event_payload = {
            "start": "2026-07-20T09:00:00.000Z",
            "end": "2026-07-20T10:00:00.000Z",
            "timezone": "Asia/Ho_Chi_Minh",
            "summary": "Insight class with Asha",
            "eventId": "insight0abc123",
            "proposalVersion": 2,
        }

    def test_freebusy_uses_exact_safe_gws_argv_and_minimizes_output(self):
        response = {
            "calendars": {"primary": {"busy": [
                {"start": "2026-07-20T09:15:00Z", "end": "2026-07-20T09:30:00Z", "summary": "private"},
            ], "errors": []}},
            "groups": {}, "kind": "calendar#freeBusy", "private": "drop",
        }
        completed = subprocess.CompletedProcess([], 0, stdout=json.dumps(response), stderr="private diagnostic")
        with patch.object(self.worker.subprocess, "run", return_value=completed) as run:
            result = self.worker.query_freebusy(self.payload, now=lambda: "2026-07-16T12:00:00.000Z")

        body = json.dumps({
            "timeMin": "2026-07-20T09:00:00.000Z",
            "timeMax": "2026-07-21T12:00:00.000Z",
            "timeZone": "Asia/Ho_Chi_Minh",
            "items": [{"id": "primary"}],
        }, sort_keys=True, separators=(",", ":"))
        run.assert_called_once_with(
            ["gws", "calendar", "freebusy", "query", "--json", body],
            shell=False, capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(result, {"busy": [{
            "start": "2026-07-20T09:15:00.000Z", "end": "2026-07-20T09:30:00.000Z",
        }], "checkedAt": "2026-07-16T12:00:00.000Z"})
        self.assertNotIn("private", json.dumps(result))

    def test_failure_classification_is_bounded_and_redacted(self):
        timeout = subprocess.TimeoutExpired(["gws"], 30, output="private", stderr="private")
        self.assertEqual(self.worker.classify_gws_failure(timeout), ("retryable_failed", "gws_timeout"))
        self.assertEqual(self.worker.classify_gws_failure(subprocess.CompletedProcess([], 2, "", "oauth token")), ("permanent_failed", "gws_auth"))
        self.assertEqual(self.worker.classify_gws_failure(subprocess.CompletedProcess([], 3, "", "bad schema")), ("permanent_failed", "gws_validation"))
        self.assertEqual(self.worker.classify_gws_failure(subprocess.CompletedProcess([], 4, "", "discovery")), ("retryable_failed", "gws_discovery"))
        for code in (429, 500, 503):
            failure = subprocess.CompletedProcess([], 1, json.dumps({"error": {"code": code, "message": "private"}}), "private")
            self.assertEqual(self.worker.classify_gws_failure(failure), ("retryable_failed", f"google_{code}"))
        self.assertEqual(self.worker.classify_gws_failure(subprocess.CompletedProcess([], 1, '{"error":{"code":403}}', "private")), ("permanent_failed", "google_403"))

    def test_embedded_calendar_errors_are_classified_without_exposing_details(self):
        response = {"calendars": {"primary": {"busy": [], "errors": [{"reason": "backendError", "message": "private"}]}}}
        completed = subprocess.CompletedProcess([], 0, stdout=json.dumps(response), stderr="private")
        with patch.object(self.worker.subprocess, "run", return_value=completed):
            with self.assertRaises(self.worker.WorkspaceWorkerError) as raised:
                self.worker.query_freebusy(self.payload)
        self.assertEqual((raised.exception.status, raised.exception.error_code), ("retryable_failed", "google_calendar_retryable"))

    def test_run_once_claims_at_most_five_and_completes_each_job(self):
        jobs = [{"id": "job-1", "jobType": "calendar_freebusy", "payload": self.payload}]
        with patch.object(self.worker, "workspace_request", side_effect=[{"jobs": jobs}, {"job": {"id": "job-1", "status": "succeeded"}}]) as request, patch.object(self.worker, "query_freebusy", return_value={"busy": [], "checkedAt": "2026-07-16T12:00:00.000Z"}):
            result = self.worker.run_once(worker_id="worker_123")
        self.assertEqual(request.call_args_list[0].args[0], {"action": "claim", "payload": {"workerId": "worker_123", "limit": 5}})
        completion = request.call_args_list[1].args[0]
        self.assertEqual(completion["payload"]["status"], "succeeded")
        self.assertEqual(completion["payload"]["jobType"], "calendar_freebusy")
        self.assertEqual(result, {"claimed": 1, "succeeded": 1, "failed": 0})

    def test_event_insert_uses_exact_private_primary_calendar_shape(self):
        missing = subprocess.CompletedProcess([], 1, stdout='{"error":{"code":404}}', stderr="private")
        free = subprocess.CompletedProcess([], 0, stdout=json.dumps({"calendars": {"primary": {"busy": [], "errors": []}}}), stderr="")
        inserted = subprocess.CompletedProcess([], 0, stdout=json.dumps({
            "id": "insight0abc123", "etag": '"etag-1"', "created": "2026-07-16T12:00:00Z",
            "summary": "private response", "attendees": [{"email": "drop@example.com"}],
        }), stderr="")
        with patch.object(self.worker.subprocess, "run", side_effect=[missing, free, inserted]) as run:
            result = self.worker.create_calendar_event("case-opaque-1", self.event_payload)

        get_params = self.worker.canonical_json({"calendarId": "primary", "eventId": "insight0abc123"})
        self.assertEqual(run.call_args_list[0].args[0], ["gws", "calendar", "events", "get", "--params", get_params])
        insert_params = self.worker.canonical_json({"calendarId": "primary", "sendUpdates": "none"})
        insert_argv = run.call_args_list[2].args[0]
        self.assertEqual(insert_argv[:6], ["gws", "calendar", "events", "insert", "--params", insert_params])
        self.assertEqual(insert_argv[6], "--json")
        body = json.loads(insert_argv[7])
        self.assertEqual(body, {
            "id": "insight0abc123",
            "summary": "Insight class with Asha",
            "start": {"dateTime": "2026-07-20T09:00:00.000Z", "timeZone": "Asia/Ho_Chi_Minh"},
            "end": {"dateTime": "2026-07-20T10:00:00.000Z", "timeZone": "Asia/Ho_Chi_Minh"},
            "visibility": "private",
            "transparency": "opaque",
            "extendedProperties": {"private": {"insightCaseId": "case-opaque-1", "insightProposalVersion": "2"}},
        })
        self.assertNotIn("attendees", body)
        self.assertEqual(result, {"eventId": "insight0abc123", "etag": '"etag-1"', "createdAt": "2026-07-16T12:00:00.000Z"})

    def test_existing_matching_event_is_recovered_without_conflict_check_or_insert(self):
        existing = subprocess.CompletedProcess([], 0, stdout=json.dumps({
            "id": "insight0abc123", "etag": '"etag-1"', "created": "2026-07-16T12:00:00Z",
            "start": {"dateTime": self.event_payload["start"]}, "end": {"dateTime": self.event_payload["end"]},
            "visibility": "private", "transparency": "opaque",
            "extendedProperties": {"private": {"insightCaseId": "case-opaque-1", "insightProposalVersion": "2"}},
        }), stderr="")
        with patch.object(self.worker.subprocess, "run", return_value=existing) as run:
            result = self.worker.create_calendar_event("case-opaque-1", self.event_payload)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(result["eventId"], "insight0abc123")

    def test_final_conflict_check_prevents_event_insert(self):
        missing = subprocess.CompletedProcess([], 1, stdout='{"error":{"code":404}}', stderr="")
        busy = subprocess.CompletedProcess([], 0, stdout=json.dumps({"calendars": {"primary": {"busy": [{"start": "2026-07-20T09:30:00Z", "end": "2026-07-20T09:45:00Z"}], "errors": []}}}), stderr="")
        with patch.object(self.worker.subprocess, "run", side_effect=[missing, busy]) as run:
            with self.assertRaises(self.worker.WorkspaceWorkerError) as raised:
                self.worker.create_calendar_event("case-opaque-1", self.event_payload)
        self.assertEqual((raised.exception.status, raised.exception.error_code), ("permanent_failed", "calendar_conflict"))
        self.assertEqual(run.call_count, 2)

    def test_uncertain_insert_is_retryable_and_next_attempt_recovers_same_id(self):
        missing = subprocess.CompletedProcess([], 1, stdout='{"error":{"code":404}}', stderr="")
        free = subprocess.CompletedProcess([], 0, stdout=json.dumps({"calendars": {"primary": {"busy": [], "errors": []}}}), stderr="")
        with patch.object(self.worker.subprocess, "run", side_effect=[missing, free, subprocess.TimeoutExpired(["gws"], 30)]):
            with self.assertRaises(self.worker.WorkspaceWorkerError) as raised:
                self.worker.create_calendar_event("case-opaque-1", self.event_payload)
        self.assertEqual((raised.exception.status, raised.exception.error_code), ("retryable_failed", "gws_timeout"))

        existing = subprocess.CompletedProcess([], 0, stdout=json.dumps({
            "id": "insight0abc123", "etag": '"etag-1"', "created": "2026-07-16T12:00:00Z",
            "start": {"dateTime": self.event_payload["start"]}, "end": {"dateTime": self.event_payload["end"]},
            "visibility": "private", "transparency": "opaque",
            "extendedProperties": {"private": {"insightCaseId": "case-opaque-1", "insightProposalVersion": "2"}},
        }), stderr="")
        with patch.object(self.worker.subprocess, "run", return_value=existing) as run:
            result = self.worker.create_calendar_event("case-opaque-1", self.event_payload)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(result["eventId"], self.event_payload["eventId"])

    def test_http_requests_are_signed_and_errors_never_expose_response_bodies(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"jobs":[]}'
        with patch.dict(os.environ, {
            "INSIGHT_HERMES_WORKSPACE_URL": "https://example.test/api/hermes/workspace-jobs",
            "HERMES_WORKSPACE_WORKER_SECRET": "worker-secret",
        }), patch.object(self.worker.urllib.request, "urlopen", return_value=response) as urlopen:
            self.assertEqual(self.worker.workspace_request({"action": "claim", "payload": {"workerId": "worker_123", "limit": 5}}), {"jobs": []})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.test/api/hermes/workspace-jobs")
        self.assertRegex(request.headers["X-hermes-signature"], r"^[a-f0-9]{64}$")

    def test_plugin_registers_cli_only_and_no_agent_tool(self):
        source = (PLUGIN_DIR / "__init__.py").read_text()
        manifest = (PLUGIN_DIR / "plugin.yaml").read_text()
        self.assertIn("register_cli_command", source)
        self.assertNotIn("register_tool", source)
        self.assertIn("INSIGHT_HERMES_WORKSPACE_URL", manifest)
        self.assertIn("HERMES_WORKSPACE_WORKER_SECRET", manifest)


if __name__ == "__main__":
    unittest.main()
