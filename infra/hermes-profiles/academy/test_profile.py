from pathlib import Path
import unittest


PROFILE_DIR = Path(__file__).parent


class AcademyProfileTests(unittest.TestCase):
    def test_deployment_disables_generic_profile_onboarding(self):
        readme = (PROFILE_DIR / "README.md").read_text()
        self.assertIn('profile_build: "off"', readme)

    def test_external_contacts_are_not_asked_for_broad_profiles(self):
        soul = (PROFILE_DIR / "SOUL.md").read_text()
        self.assertIn("Never ask an Academy contact to build a personal profile", soul)


if __name__ == "__main__":
    unittest.main()
