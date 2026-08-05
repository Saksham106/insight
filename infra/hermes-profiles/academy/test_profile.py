from pathlib import Path
import importlib.util
import unittest


PROFILE_DIR = Path(__file__).parent


class AcademyProfileTests(unittest.TestCase):
    def test_academy_model_and_lifecycle_are_profile_scoped_and_quiet(self):
        config = (PROFILE_DIR / "config.override.yaml").read_text()
        self.assertIn("deepseek/deepseek-v4-pro", config)
        self.assertIn("codex_gpt55_autoraise_notice: false", config)
        self.assertIn("idle_minutes: 240", config)
        self.assertIn("at_hour: 4", config)
        self.assertIn("notify: false", config)

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

    def test_monthly_settlement_workflow_is_bounded_and_tutor_report_driven(self):
        readme = (PROFILE_DIR / "README.md").read_text().lower()
        agents = (PROFILE_DIR / "AGENTS.md").read_text().lower()
        for required in (
            "tutor report is the financial source of truth",
            "family charges",
            "does not move money",
            "whatsapp_template_tutor_report_request",
            "whatsapp_template_family_invoice",
            "whatsapp_template_payment_reminder",
            "whatsapp_template_payment_received",
        ):
            self.assertIn(required, readme)
        self.assertIn("submit_tutor_report", agents)
        self.assertIn("never infer", agents)

    def test_lesson_ledger_requires_structured_teacher_confirmation_and_no_money(self):
        readme = (PROFILE_DIR / "README.md").read_text().lower()
        agents = (PROFILE_DIR / "AGENTS.md").read_text().lower()
        for required in (
            "natural lesson list", "normalized summary", "confirm", "exact pending revision",
            "corrections create a new revision", "own collection", "server-side session identity",
            "cycleid", "submit_lesson_report", "do not call `request_lesson_report`",
            "do not use `submit_tutor_report`",
        ):
            self.assertIn(required, agents)
        for required in (
            "hermes_lesson_ledger_enabled=false", "whatsapp_template_lesson_report_request",
            "does not calculate invoices", "does not move money",
        ):
            self.assertIn(required, readme)

    def test_external_turns_check_and_gently_redirect_to_open_objectives(self):
        agents = (PROFILE_DIR / "AGENTS.md").read_text().lower()
        skill = (
            PROFILE_DIR.parents[1]
            / "hermes-skills"
            / "insight-scheduling"
            / "SKILL.md"
        ).read_text().lower()
        for document in (agents, skill):
            for required in (
                "get_my_open_objectives",
                "every eligible external inbound whatsapp turn",
                "answer the immediate",
                "at most one",
                "visible recent",
                "awaiting_report",
                "awaiting_confirmation",
                "awaiting_payment",
                "do not guess",
                "stop",
            ):
                self.assertIn(required, document)
        self.assertIn("available actions", skill)
        for required in (
            "cycleid", "submit_lesson_report", "confirm_lesson_report",
            "do not call `request_lesson_report`", "do not use `submit_tutor_report`",
        ):
            self.assertIn(required, skill)

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

    def test_transcript_hook_is_incremental_private_and_non_blocking(self):
        hook_dir = PROFILE_DIR / "hooks" / "insight-transcript-sync"
        manifest = (hook_dir / "HOOK.yaml").read_text()
        handler = (hook_dir / "handler.py").read_text()

        self.assertIn("- agent:end", manifest)
        self.assertIn("- gateway:startup", manifest)
        self.assertIn("INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED", handler)
        self.assertIn("SessionDB(_hermes_home() / \"state.db\", read_only=True)", handler)
        self.assertIn('source="whatsapp_cloud"', handler)
        self.assertIn("_BACKGROUND_TASKS", handler)
        self.assertIn("tool_calls", handler)
        self.assertNotIn('"reasoning":', handler)

    def test_class_changes_confirm_the_exact_occurrence_before_notification(self):
        agents = (PROFILE_DIR / "AGENTS.md").read_text()
        skill = (PROFILE_DIR.parents[1] / "hermes-skills" / "kitty-classes" / "SKILL.md").read_text()
        combined = f"{agents}\n{skill}"
        for required in (
            "find_my_classes", "confirm_class_selection", "request_class_change",
            "decide_class_change", "propose_replacement_time",
        ):
            self.assertIn(required, combined)
        self.assertIn("exact occurrence", combined)
        self.assertIn("before any counterparty notification", combined)
        self.assertIn("cannot create", combined)
        self.assertIn("notification", combined)


if __name__ == "__main__":
    unittest.main()
