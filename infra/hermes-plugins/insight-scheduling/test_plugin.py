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

    def test_exposes_only_the_tutor_owned_financial_action(self):
        self.assertIn("submit_tutor_report", self.tools.ACTIONS)
        for action in ("start_settlement_cycle", "set_family_charges", "request_settlement_approval", "record_family_payment", "record_tutor_payout"):
            self.assertNotIn(action, self.tools.ACTIONS)

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


if __name__ == "__main__":
    unittest.main()
