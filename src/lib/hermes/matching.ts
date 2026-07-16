export interface MatchableProfile {
  id: string;
  full_name: string;
  role: string;
  timezone: string | null;
}

export interface ProfileMatchSuggestion {
  profileId: string;
  fullName: string;
  role: string;
  timezone: string | null;
  confidence: "exact";
}

export function normalizePersonName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function suggestProfileMatches(
  displayName: string,
  profiles: MatchableProfile[],
): ProfileMatchSuggestion[] {
  const normalized = normalizePersonName(displayName);
  if (!normalized) return [];

  return profiles
    .filter((profile) => normalizePersonName(profile.full_name) === normalized)
    .map((profile) => ({
      profileId: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      timezone: profile.timezone,
      confidence: "exact" as const,
    }));
}
