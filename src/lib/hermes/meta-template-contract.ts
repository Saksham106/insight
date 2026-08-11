export type MetaTemplateContract = {
  name: string;
  status: "APPROVED";
  language: string;
  body: string;
};

export const CLASS_REMINDER_TEMPLATE_CONTRACT: MetaTemplateContract = {
  name: "",
  status: "APPROVED",
  language: "en_US",
  body: "Hi {{1}}! Just a reminder that your {{2}} is {{3}}. If anything changes, please tell me and I’ll notify the relevant person.",
};

export type MetaTemplateHealth = { ok: true; checkedAt: string } | { ok: false; checkedAt: string; reason: string };

type LiveTemplate = {
  name?: unknown;
  status?: unknown;
  language?: unknown;
  components?: unknown;
};

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function compareMetaTemplateContract(live: LiveTemplate, expected: MetaTemplateContract) {
  if (live.name !== expected.name) return { ok: false as const, reason: "name_mismatch" };
  if (live.status !== expected.status) return { ok: false as const, reason: "status_mismatch" };
  if (live.language !== expected.language) return { ok: false as const, reason: "language_mismatch" };
  if (!Array.isArray(live.components) || live.components.length !== 1) return { ok: false as const, reason: "components_mismatch" };
  const component = live.components[0];
  if (!component || typeof component !== "object" || String((component as Record<string, unknown>).type).toUpperCase() !== "BODY") {
    return { ok: false as const, reason: "components_mismatch" };
  }
  if (normalizedText((component as Record<string, unknown>).text) !== normalizedText(expected.body)) {
    return { ok: false as const, reason: "component_text_mismatch" };
  }
  return { ok: true as const };
}

type TemplateEnvironment = Partial<Record<
  | "WHATSAPP_BUSINESS_ACCOUNT_ID"
  | "WHATSAPP_CLOUD_ACCESS_TOKEN"
  | "WHATSAPP_TEMPLATE_CLASS_REMINDER"
  | "WHATSAPP_TEMPLATE_LOCALE"
  | "WHATSAPP_CLOUD_API_VERSION",
  string
>>;

type HealthFetch = (url: string, init: { headers: { Authorization: string } }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export async function fetchMetaTemplateHealth(
  fetchImpl: HealthFetch,
  env: TemplateEnvironment,
  now = Date.now(),
): Promise<MetaTemplateHealth> {
  const checkedAt = new Date(now).toISOString();
  const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const name = env.WHATSAPP_TEMPLATE_CLASS_REMINDER?.trim();
  const language = env.WHATSAPP_TEMPLATE_LOCALE?.trim() || "en_US";
  const version = env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";
  if (!wabaId || !accessToken || !name) return { ok: false, checkedAt, reason: "configuration_unavailable" };

  const query = new URLSearchParams({ name, fields: "name,status,language,components" });
  let response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/message_templates?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, checkedAt, reason: "provider_unavailable" };
  }
  if (!response.ok) return { ok: false, checkedAt, reason: "provider_unavailable" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, checkedAt, reason: "provider_response_invalid" };
  }
  const data = payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
    ? (payload as { data: LiveTemplate[] }).data
    : [];
  const live = data.find((item) => item.name === name && item.language === language);
  if (!live) return { ok: false, checkedAt, reason: "template_unavailable" };
  const comparison = compareMetaTemplateContract(live, { ...CLASS_REMINDER_TEMPLATE_CONTRACT, name, language });
  return comparison.ok ? { ok: true, checkedAt } : { ok: false, checkedAt, reason: comparison.reason };
}

let cachedHealth: { key: string; expiresAt: number; value: MetaTemplateHealth } | null = null;

export async function getClassReminderTemplateHealth(
  fetchImpl: HealthFetch,
  env: TemplateEnvironment,
  now = Date.now(),
) {
  const key = [env.WHATSAPP_BUSINESS_ACCOUNT_ID, env.WHATSAPP_TEMPLATE_CLASS_REMINDER, env.WHATSAPP_TEMPLATE_LOCALE, env.WHATSAPP_CLOUD_API_VERSION].join("|");
  if (cachedHealth?.key === key && cachedHealth.expiresAt > now) return cachedHealth.value;
  const value = await fetchMetaTemplateHealth(fetchImpl, env, now);
  cachedHealth = { key, expiresAt: now + 5 * 60_000, value };
  return value;
}
