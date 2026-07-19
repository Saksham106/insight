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

    def test_exposes_typed_freebusy_actions(self):
        self.assertIn("request_swati_freebusy", self.tools.ACTIONS)
        self.assertIn("get_workspace_job", self.tools.ACTIONS)

    def test_exposes_admin_settlement_and_exact_approval_actions(self):
        for action in (
            "start_settlement_cycle", "get_settlement_cycle", "set_family_charges",
            "request_settlement_approval", "decide_approval", "record_family_payment",
            "record_tutor_payout", "close_settlement_cycle",
        ):
            self.assertIn(action, self.tools.ACTIONS)

    def test_tool_schema_documents_direct_whatsapp_send_contract(self):
        source = (PLUGIN_DIR / "__init__.py").read_text()

        self.assertIn("sends synchronously", source)
        self.assertIn("does not upload or queue", source)
        self.assertIn("contactId", source)
        self.assertIn("caseId", source)
        self.assertIn("idempotencyKey", source)
        self.assertIn("bodyParameters", source)
        self.assertIn("recipient name, class description, scheduled date/time with timezone", source)

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

    def test_rejects_non_photon_and_non_direct_sessions(self):
        self.session_values["HERMES_SESSION_PLATFORM"] = "whatsapp_cloud"
        self.assertEqual(
            json.loads(self.tools.call_insight("search_contacts", {"query": "Asha"})),
            {"error": "This admin tool requires Swati's direct iMessage conversation"},
        )
        self.session_values["HERMES_SESSION_PLATFORM"] = "photon"
        self.session_values["HERMES_SESSION_CHAT_ID"] = "any;-;+84900000000"
        self.assertEqual(
            json.loads(self.tools.call_insight("search_contacts", {"query": "Asha"})),
            {"error": "This admin tool requires Swati's direct iMessage conversation"},
        )
        self.session_values["HERMES_SESSION_CHAT_ID"] = "chat123;+;+84917583553"
        self.assertEqual(
            json.loads(self.tools.call_insight("search_contacts", {"query": "Asha"})),
            {"error": "This admin tool requires Swati's direct iMessage conversation"},
        )


if __name__ == "__main__":
    unittest.main()
