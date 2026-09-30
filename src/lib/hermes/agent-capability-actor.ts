import { parseIMessageAdminActor, parseLocalHermesAdminActor, parseWhatsAppToolActor } from "./cases";
import { verifyServiceRequest } from "./auth";

type CapabilityIdentity =
  | { kind: "imessage"; stableId: string; requestId: string }
  | { kind: "profile"; source: "cron" | "cli" | "tui" | "desktop"; requestId: string }
  | { kind: "whatsapp"; e164: string; requestId: string };

// The actor label selects which key must authenticate the exact body; it is not
// authority on its own. The admin key is installed only in Swati's profile.
export function authenticateCapabilityActor(
  request: Request,
  raw: string,
  actor: unknown,
  config: { adminSecret?: string; contactSecret?: string; adminIMessageDigest?: string },
  now?: number,
): CapabilityIdentity | null {
  const imessage = parseIMessageAdminActor(actor, config.adminIMessageDigest);
  const profile = parseLocalHermesAdminActor(actor);
  const whatsapp = parseWhatsAppToolActor(actor);
  const secret = imessage || profile ? config.adminSecret : whatsapp ? config.contactSecret : undefined;
  const verified = secret ? verifyServiceRequest(request, raw, secret, now) : null;
  if (!verified) return null;
  if (imessage) return { kind: "imessage", stableId: imessage.stableId, requestId: verified.requestId };
  if (profile) return { kind: "profile", source: profile.source, requestId: verified.requestId };
  if (whatsapp) return { kind: "whatsapp", e164: whatsapp.e164, requestId: verified.requestId };
  return null;
}
