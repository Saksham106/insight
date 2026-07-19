import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROFILE_DIR = Path(__file__).parent
LAUNCHER = PROFILE_DIR / "hermes-insight-test"


class InsightAdminCliLauncherTests(unittest.TestCase):
    def run_launcher(self, allowed_users: str, selected_user: str | None = None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile_home = root / "profile"
            profile_home.mkdir()
            (profile_home / ".env").write_text(
                f'PHOTON_ALLOWED_USERS="{allowed_users}"\n',
            )
            fake_hermes = root / "hermes"
            fake_hermes.write_text(
                "#!/bin/sh\n"
                "printf 'platform=%s\\n' \"$HERMES_SESSION_PLATFORM\"\n"
                "printf 'user=%s\\n' \"$HERMES_SESSION_USER_ID\"\n"
                "printf 'chat=%s\\n' \"$HERMES_SESSION_CHAT_ID\"\n"
                "printf 'home=%s\\n' \"$HERMES_HOME\"\n"
                "printf 'args=%s\\n' \"$*\"\n"
            )
            fake_hermes.chmod(0o755)
            environment = {
                **os.environ,
                "HERMES_PROFILE_HOME": str(profile_home),
                "HERMES_BIN": str(fake_hermes),
                "HERMES_PYTHON_BIN": sys.executable,
            }
            if selected_user is not None:
                environment["INSIGHT_TEST_ADMIN_E164"] = selected_user
            return subprocess.run(
                [str(LAUNCHER), "--cli"],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )

    def test_launches_cli_with_verified_photon_context_and_admin_toolset(self):
        result = self.run_launcher("+15551234567")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("platform=photon", result.stdout)
        self.assertIn("user=+15551234567", result.stdout)
        self.assertIn("chat=any;-;+15551234567", result.stdout)
        self.assertIn("args=-t hermes-cli,insight_admin --cli", result.stdout)

    def test_requires_explicit_selection_when_multiple_users_are_allowed(self):
        result = self.run_launcher("+15551234567,+15557654321")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("INSIGHT_TEST_ADMIN_E164", result.stderr)
        self.assertNotIn("+1555", result.stderr)

    def test_selected_user_must_be_in_photon_allowlist(self):
        result = self.run_launcher("+15551234567", "+15557654321")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not permitted", result.stderr)
        self.assertNotIn("+1555", result.stderr)


if __name__ == "__main__":
    unittest.main()
