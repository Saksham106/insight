import hashlib
import hmac
import importlib.util
import json
import os
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
        spec = importlib.util.spec_from_file_location("insight_admin_tools", tools_path)
        self.tools = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.tools)
        self.session_values = {
            "HERMES_SESSION_PLATFORM": "photon",
            "HERMES_SESSION_CHAT_ID": "any;-;+84917583553",
            "HERMES_SESSION_USER_ID": "+84917583553",
        }
        session = types.ModuleType("gateway.session_context")
        session.get_session_env = lambda name, default="": self.session_values.get(name, default)
        gateway = types.ModuleType("gateway")
        gateway.session_context = session
        self.modules = patch.dict(sys.modules, {"gateway": gateway, "gateway.session_context": session})
        self.modules.start()

    def tearDown(self):
        self.modules.stop()

    def test_actor_comes_from_direct_imessage_session(self):
        self.assertEqual(self.tools._session_actor(), {
            "platform": "photon",
            "chatId": "any;-;+84917583553",
            "userId": "+84917583553",
        })

    def test_trusts_cron_cli_and_tui_without_phone_identity(self):
        for values, expected_source in (
            ({"HERMES_CRON_SESSION": "1"}, "cron"),
            ({"HERMES_SESSION_SOURCE": "cli"}, "cli"),
            ({"HERMES_SESSION_SOURCE": "tui"}, "tui"),
        ):
            with self.subTest(source=expected_source):
                self.session_values = values
                self.assertEqual(
                    self.tools._session_actor(),
                    {"platform": "hermes_local", "source": expected_source},
                )

    def test_exposes_typed_freebusy_actions(self):
        self.assertIn("request_swati_freebusy", self.tools.ACTIONS)
        self.assertIn("get_workspace_job", self.tools.ACTIONS)

    def test_exposes_admin_case_listing(self):
        self.assertIn("list_cases", self.tools.ACTIONS)

    def test_exposes_admin_settlement_and_exact_approval_actions(self):
        for action in (
            "start_settlement_cycle", "get_settlement_cycle", "set_family_charges",
            "request_settlement_approval", "decide_approval", "record_family_payment",
            "record_tutor_payout", "close_settlement_cycle",
        ):
            self.assertIn(action, self.tools.ACTIONS)

    def test_exposes_every_flexible_lesson_ledger_action(self):
        for action in (
            "set_contact_relationship", "list_contact_relationships", "start_lesson_cycle",
            "get_lesson_cycle", "request_lesson_report", "submit_lesson_report",
            "import_swati_lessons", "confirm_lesson_report", "resolve_lesson_student",
            "get_student_lessons", "confirm_lesson_cycle", "reopen_lesson_cycle",
        ):
            self.assertIn(action, self.tools.ACTIONS)

    def test_tool_schema_documents_direct_whatsapp_send_contract(self):
        source = (PLUGIN_DIR / "__init__.py").read_text()

        self.assertIn("sends synchronously", source)
        self.assertIn("does not upload or queue", source)
        self.assertIn("contactId", source)
        self.assertIn("caseId", source)
        self.assertIn("idempotencyKey", source)
        self.assertIn("templateData", source)
        self.assertIn("classDescription", source)
        self.assertIn("scheduledDateTime", source)
        self.assertIn("list_cases", source)
        self.assertIn("tutorContactIds", source)
        self.assertIn("reportedStudentName", source)
        self.assertIn("durationMinutes", source)
        self.assertIn("protected default-profile cron, CLI, or TUI", source)
        self.assertNotIn("actorId", source)

    def test_request_uses_admin_url_secret_and_session_actor(self):
        with patch.dict(os.environ, {
            "INSIGHT_HERMES_ADMIN_TOOL_URL": "https://myinsightacademy.com/api/hermes/admin-tools",
            "HERMES_ADMIN_TOOL_SHARED_SECRET": "admin-secret",
        }), patch("urllib.request.urlopen", return_value=FakeResponse()) as urlopen:
            result = self.tools.call_insight("create_case", {"actor": {"platform": "telegram"}})

        self.assertEqual(json.loads(result), {"ok": True})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://myinsightacademy.com/api/hermes/admin-tools")
        body = request.data.decode()
        decoded = json.loads(body)
        self.assertEqual(decoded["actor"]["platform"], "photon")
        self.assertEqual(decoded["actor"]["chatId"], "any;-;+84917583553")
        self.assertEqual(decoded["payload"], {"actor": {"platform": "telegram"}})
        signed = f'{request.headers["X-hermes-timestamp"]}.{request.headers["X-hermes-request-id"]}.{body}'
        expected = hmac.new(b"admin-secret", signed.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(request.headers["X-hermes-signature"], expected)

    def test_rejects_messaging_unknown_and_non_direct_sessions_before_http(self):
        rejected = (
            {"HERMES_SESSION_PLATFORM": "whatsapp_cloud"},
            {"HERMES_SESSION_PLATFORM": "telegram"},
            {"HERMES_SESSION_SOURCE": "desktop"},
            {"HERMES_SESSION_PLATFORM": "api_server"},
            {},
            {
                "HERMES_SESSION_PLATFORM": "photon",
                "HERMES_SESSION_CHAT_ID": "any;-;+84900000000",
                "HERMES_SESSION_USER_ID": "+84917583553",
            },
            {
                "HERMES_SESSION_PLATFORM": "photon",
                "HERMES_SESSION_CHAT_ID": "chat123;+;+84917583553",
                "HERMES_SESSION_USER_ID": "+84917583553",
            },
        )
        with patch("urllib.request.urlopen") as urlopen:
            for values in rejected:
                with self.subTest(values=values):
                    self.session_values = values
                    self.assertEqual(
                        json.loads(self.tools.call_insight("search_contacts", {"query": "Asha"})),
                        {"error": "This admin tool requires Swati's direct iMessage or protected local Hermes session"},
                    )
            urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
