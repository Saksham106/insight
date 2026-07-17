from pathlib import Path
import importlib.util
import unittest


PROFILE_DIR = Path(__file__).parent


class AcademyProfileTests(unittest.TestCase):
    def test_deployment_disables_generic_profile_onboarding(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn('profile_build: "off"', readme)

    def test_external_contacts_are_not_asked_for_broad_profiles(self):
        soul = (PROFILE_DIR / "SOUL.md").read_text()
        self.assertIn("Never ask an Academy contact to build a personal profile", soul)

    def test_whatsapp_commands_are_admin_only_for_swati(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn("whatsapp_cloud:", readme)
        self.assertIn('allow_admin_from: ["84917583553"]', readme)
        self.assertIn("user_allowed_commands: []", readme)

    def test_whatsapp_cloud_display_is_customer_quiet(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn("busy_ack_detail: false", readme)
        self.assertIn("busy_steer_ack_enabled: false", readme)
        self.assertIn("interim_assistant_messages: false", readme)
        self.assertIn("long_running_notifications: false", readme)
        self.assertIn('tool_progress: "off"', readme)

    def test_insight_is_the_single_inbound_contact_gate(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn("WHATSAPP_CLOUD_ALLOW_ALL_USERS=true", readme)
        self.assertIn("Meta callback must remain the signed Insight webhook", readme)
        self.assertIn("imported, active, consent-attested, classified", readme)
        self.assertIn("communication_policy=direct", readme)

    def test_whatsapp_approval_activation_is_fail_closed_and_reversible(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn("HERMES_WHATSAPP_APPROVALS_ENABLED=false", readme)
        self.assertIn("WHATSAPP_TEMPLATE_ADMIN_APPROVAL", readme)
        self.assertIn("APPROVE <CODE>", readme)
        self.assertIn("REJECT <CODE>", readme)
        self.assertIn("approved Utility template", readme)
        self.assertIn("wrong number", readme)
        self.assertIn("expired", readme)
        self.assertIn("replayed", readme)
        self.assertIn("/admin/hermes", readme)
        self.assertIn("rollback", readme)

    def test_academy_help_hook_is_registered_for_help_and_whoami(self):
        hook_dir = PROFILE_DIR / "hooks" / "academy-help"
        manifest = (hook_dir / "HOOK.yaml").read_text()
        self.assertIn("- command:help", manifest)
        self.assertIn("- command:whoami", manifest)

    def test_academy_help_hook_replaces_internal_help_only_for_external_whatsapp_contacts(self):
        handler_path = PROFILE_DIR / "hooks" / "academy-help" / "handler.py"
        spec = importlib.util.spec_from_file_location("academy_help_hook", handler_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        external = module.handle("command:help", {
            "platform": "whatsapp_cloud",
            "user_id": "16175950803",
        })
        self.assertEqual(external["decision"], "handled")
        self.assertIn("Class scheduling", external["message"])
        self.assertNotIn("Model:", external["message"])
        self.assertNotIn("/new", external["message"])

        self.assertIsNone(module.handle("command:help", {
            "platform": "whatsapp_cloud",
            "user_id": "84917583553",
        }))
        self.assertIsNone(module.handle("command:help", {
            "platform": "photon",
            "user_id": "16175950803",
        }))


if __name__ == "__main__":
    unittest.main()
