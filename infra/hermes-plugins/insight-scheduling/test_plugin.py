import hashlib
import hmac
import importlib.util
import json
import os
import urllib.error
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


PLUGIN_DIR = Path(__file__).parent


class FakeResponse:
    def __init__(self, body=b'{"ok":true}'):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class PluginTests(unittest.TestCase):
    def setUp(self):
        tools_path = PLUGIN_DIR / "tools.py"
        self.assertTrue(tools_path.exists(), "plugin tools.py should exist")
        spec = importlib.util.spec_from_file_location("insight_scheduling_tools", tools_path)
        self.tools = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.tools)
        session = types.ModuleType("gateway.session_context")
        values = {
            "HERMES_SESSION_PLATFORM": "whatsapp_cloud",
            "HERMES_SESSION_CHAT_ID": "84917583553",
            "HERMES_SESSION_USER_ID": "84917583553",
        }
        session.get_session_env = lambda name, default="": values.get(name, default)
        gateway = types.ModuleType("gateway")
        gateway.session_context = session
        self.modules = patch.dict(sys.modules, {"gateway": gateway, "gateway.session_context": session})
        self.modules.start()

    def tearDown(self):
        self.modules.stop()

    def test_actor_comes_from_hermes_session_not_model_parameters(self):
        self.assertEqual(self.tools._session_actor(), {
            "platform": "whatsapp_cloud",
            "chatId": "84917583553",
            "userId": "84917583553",
        })

    def test_exposes_typed_freebusy_actions(self):
        self.assertIn("request_swati_freebusy", self.tools.ACTIONS)
        self.assertIn("get_workspace_job", self.tools.ACTIONS)

    def test_exposes_self_scoped_open_objective_lookup(self):
        self.assertIn("get_my_open_objectives", self.tools.ACTIONS)
        source = (PLUGIN_DIR / "__init__.py").read_text()
        self.assertIn("returned cycleId", source)
        self.assertIn("submit_lesson_report", source)

    def test_exposes_only_the_tutor_owned_financial_action(self):
        self.assertIn("submit_tutor_report", self.tools.ACTIONS)
        for action in ("start_settlement_cycle", "set_family_charges", "request_settlement_approval", "record_family_payment", "record_tutor_payout"):
            self.assertNotIn(action, self.tools.ACTIONS)

    def test_exposes_ledger_actions_but_leaves_permission_to_session_identity(self):
        for action in (
            "set_contact_relationship", "list_contact_relationships", "start_lesson_cycle",
            "get_lesson_cycle", "request_lesson_report", "submit_lesson_report",
            "import_swati_lessons", "confirm_lesson_report", "resolve_lesson_student",
            "get_student_lessons", "confirm_lesson_cycle", "reopen_lesson_cycle",
        ):
            self.assertIn(action, self.tools.ACTIONS)
        source = (PLUGIN_DIR / "__init__.py").read_text()
        self.assertIn("server-side session identity", source)
        self.assertIn("own collection", source)
        self.assertIn("reportedStudentName", source)
        self.assertIn("durationMinutes", source)

    def test_schema_documents_canonical_reschedule_contract(self):
        source = (PLUGIN_DIR / "__init__.py").read_text()

        self.assertIn("caseId", source)
        self.assertIn("request_reschedule", source)
        self.assertIn("notification", source)
        self.assertIn("Do not claim", source)

    def test_exposes_confirmation_first_class_change_actions(self):
        for action in ("find_my_classes", "find_my_pending_changes", "confirm_class_selection", "report_class_ambiguity", "request_class_change", "decide_class_change", "propose_replacement_time"):
            self.assertIn(action, self.tools.ACTIONS)
        source = (PLUGIN_DIR / "__init__.py").read_text()
        self.assertLess(source.index("find_my_classes"), source.index("confirm_class_selection"))
        self.assertIn("exact occurrence", source)

    def test_ambiguity_escalation_is_bounded_and_contains_no_free_text(self):
        self.assertIn("report_class_ambiguity", self.tools.CLASS_ACTIONS)
        source = (PLUGIN_DIR / "__init__.py").read_text()
        for required in ("1–5", "ambiguityKind", "class or scope", "Never include message text"):
            self.assertIn(required, source)
        self.assertNotIn("report_class_ambiguity={candidateOccurrenceIds,reason", source)

    def test_exposes_group_class_attendance_and_bounded_relay_actions(self):
        for action in (
            "record_class_attendance",
            "correct_class_attendance",
            "relay_class_update",
        ):
            self.assertIn(action, self.tools.ACTIONS)
            self.assertIn(action, self.tools.CLASS_ACTIONS)

        source = (PLUGIN_DIR / "__init__.py").read_text()
        for required in (
            "confirm the exact scope",
            "individual student",
            "whole class",
            "selectionToken",
            "enrollmentHandle",
            "preparationCategory",
        ):
            self.assertIn(required, source)
        self.assertNotIn("record_class_attendance={occurrenceId,enrollmentId", source)
        self.assertNotIn("relay_class_update={occurrenceId,enrollmentId", source)

    def test_pending_change_decision_payloads_are_request_bound(self):
        source = (PLUGIN_DIR / "__init__.py").read_text()

        self.assertIn(
            "decide_class_change={requestId,requestVersion,payloadDigest,decision,providerMessageId?,clientRequestId}",
            source,
        )
        self.assertIn(
            "propose_replacement_time={requestId,requestVersion,payloadDigest,proposedStartsAt,proposedEndsAt,proposedTimezone?,clientRequestId}",
            source,
        )
        self.assertIn("Reuse that exact clientRequestId", source)

    def test_request_signs_actor_and_payload_without_exposing_secret(self):
        with patch.dict(os.environ, {
            "INSIGHT_HERMES_TOOL_URL": "https://myinsightacademy.com/api/hermes/tools",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }), patch("urllib.request.urlopen", return_value=FakeResponse()) as urlopen:
            result = self.tools.call_insight("list_my_cases", {"actor": {"platform": "telegram"}})

        self.assertEqual(json.loads(result), {"ok": True})
        request = urlopen.call_args.args[0]
        body = request.data.decode()
        decoded = json.loads(body)
        self.assertEqual(decoded["actor"]["platform"], "whatsapp_cloud")
        self.assertEqual(decoded["actor"]["chatId"], "84917583553")
        self.assertEqual(decoded["payload"], {"actor": {"platform": "telegram"}})
        signed = f'{request.headers["X-hermes-timestamp"]}.{request.headers["X-hermes-request-id"]}.{body}'
        expected = hmac.new(b"secret", signed.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(request.headers["X-hermes-signature"], expected)

    def test_class_mutation_retries_with_same_business_id_and_fresh_transport_id(self):
        requests = []

        def respond(request, timeout):
            del timeout
            requests.append(request)
            if len(requests) == 1:
                raise urllib.error.URLError("response lost")
            return FakeResponse()

        payload = {
            "candidateOccurrenceIds": ["class-1"],
            "ambiguityKind": "class",
            "clientRequestId": "whatsapp-message-42:ambiguity",
        }
        with patch.dict(os.environ, {
            "INSIGHT_KITTY_CLASS_TOOL_URL": "https://myinsightacademy.com/api/hermes/class-tools",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }), patch("urllib.request.urlopen", side_effect=respond):
            result = self.tools.call_insight("report_class_ambiguity", payload)

        self.assertEqual(json.loads(result), {"ok": True})
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0].data, requests[1].data)
        self.assertNotEqual(requests[0].headers["X-hermes-request-id"], requests[1].headers["X-hermes-request-id"])
        self.assertEqual(json.loads(requests[0].data)["payload"]["clientRequestId"], payload["clientRequestId"])

    def test_class_mutation_requires_business_id(self):
        with patch.dict(os.environ, {
            "INSIGHT_KITTY_CLASS_TOOL_URL": "https://myinsightacademy.com/api/hermes/class-tools",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }):
            result = self.tools.call_insight("record_class_attendance", {"occurrenceId": "class-1"})
        self.assertEqual(json.loads(result), {"error": "clientRequestId is required for this class mutation"})


if __name__ == "__main__":
    unittest.main()
