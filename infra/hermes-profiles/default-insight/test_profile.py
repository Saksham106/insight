from pathlib import Path
import unittest


PROFILE_DIR = Path(__file__).parent
ROOT = PROFILE_DIR.parents[2]


class DefaultInsightProfileTests(unittest.TestCase):
    def test_activation_and_rollback_are_documented(self):
        profile_readme = (PROFILE_DIR / "README.md").read_text()
        root_readme = (ROOT / "README.md").read_text()
        combined_docs = f"{root_readme}\n{profile_readme}"
        for required in (
            "HERMES_IMESSAGE_INTAKE_ENABLED=false",
            "HERMES_ADMIN_IMESSAGE_ID_SHA256",
            "HERMES_ADMIN_TOOL_SHARED_SECRET",
            "INSIGHT_HERMES_ADMIN_TOOL_URL",
            "hermes config check",
            "rollback",
        ):
            self.assertIn(required, combined_docs)
        self.assertIn("do not copy", combined_docs.lower())
        self.assertIn("academy", combined_docs.lower())

    def test_docs_require_staging_identity_and_authorization_probes(self):
        source = (PROFILE_DIR / "README.md").read_text().lower()
        self.assertIn("staging", source)
        self.assertIn("chatid", source)
        self.assertIn("userid", source)
        self.assertIn("external messaging platform", source)
        self.assertIn("academy whatsapp", source)
        self.assertIn("origin_platform=imessage", source)

    def test_docs_authorize_protected_local_cron_cli_and_tui_without_phone_identity(self):
        source = "\n".join([
            (PROFILE_DIR / "AGENTS.md").read_text(),
            (PROFILE_DIR / "README.md").read_text(),
        ]).lower()
        for required in ("cron", "cli", "tui", "protected local", "without a phone identity"):
            self.assertIn(required, source)
        self.assertIn("hermes_session_source=cli", source)
        self.assertIn("surface marker, not a user identity", source)
        self.assertIn("not a meta rejection", source)
        self.assertIn("academy whatsapp", source)

    def test_docs_keep_calendar_worker_paused_and_default_profile_only(self):
        source = (PROFILE_DIR / "README.md").read_text().lower()
        for required in (
            "insight-workspace run-once",
            "insight-workspace status",
            "hermes_workspace_jobs_enabled=false",
            "hmac",
            "no-agent",
            "primary",
            "busy intervals",
            "paused",
            "lease",
            "rollback",
        ):
            self.assertIn(required, source)
        self.assertIn("academy profile", source)
        self.assertIn("does not", source)

    def test_docs_keep_calendar_writes_disabled_until_idempotency_probes_pass(self):
        source = (PROFILE_DIR / "README.md").read_text().lower()
        for required in (
            "hermes_calendar_writes_enabled=false",
            "calendar_create_event",
            "deterministic event id",
            "events insert",
            "events get",
            "calendar_conflict",
            "manual cleanup",
            "confirmation",
        ):
            self.assertIn(required, source)

    def test_docs_distinguish_calendar_storage_from_automated_outreach(self):
        source = (PROFILE_DIR / "README.md").read_text().lower()
        self.assertIn("does not automatically", source)
        self.assertIn("whatsapp reminder", source)
        self.assertIn("separate approved workflow", source)
        self.assertIn("tutor report", source)

    def test_docs_cover_swatis_editable_lesson_ledger_workflow(self):
        source = "\n".join([
            (PROFILE_DIR / "AGENTS.md").read_text(),
            (PROFILE_DIR / "README.md").read_text(),
        ]).lower()
        for required in (
            "relationship edits", "teacher–student", "guardian–student", "selected tutors",
            "normalized sheet rows", "ambiguity", "consolidation", "final cycle confirmation",
            "corrections create revisions", "no currency conversion", "does not move money",
        ):
            self.assertIn(required, source)

    def test_swati_class_workflow_previews_before_saving(self):
        agents = (PROFILE_DIR / "AGENTS.md").read_text()
        skill = (ROOT / "infra" / "hermes-skills" / "kitty-classes" / "SKILL.md").read_text()
        combined = f"{agents}\n{skill}"
        for required in ("preview_class", "create_class", "list_classes", "edit_class", "override_class"):
            self.assertIn(required, combined)
        self.assertIn("wait for Swati", combined)
        self.assertIn("separate from Academy sessions", combined)

    def test_reminders_do_not_open_a_scheduling_case(self):
        """A reminder is one-way transport, not a coordination workflow.

        Instructing Kitty to open a case before every reminder left cases
        stuck in collecting_availability with nobody contacted, which the
        admin dashboard then showed as outstanding work.
        """
        agents = (PROFILE_DIR / "AGENTS.md").read_text()
        reminder_line = next(
            line for line in agents.splitlines() if "class reminder:" in line
        )
        self.assertNotIn("caseId", reminder_line)
        self.assertNotIn("create or retrieve a scheduling case", agents)
        self.assertIn("Do not create a scheduling case in order to send a reminder", agents)
        # Coordination messages must still require a case.
        self.assertIn("availability_request", agents)

    def test_coordination_workflow_still_requires_a_case(self):
        skill = (ROOT / "infra" / "hermes-skills" / "insight-scheduling" / "SKILL.md").read_text()
        self.assertIn("Create one scheduling case", skill)
        self.assertIn("never as a wrapper to carry a message", skill)


if __name__ == "__main__":
    unittest.main()
