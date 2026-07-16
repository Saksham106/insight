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
        self.assertIn("non-imessage", source)
        self.assertIn("origin_platform=imessage", source)

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


if __name__ == "__main__":
    unittest.main()
