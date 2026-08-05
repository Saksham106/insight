export type PriorWhatsAppMessage = { status: string; updated_at?: string | null };

const SUCCESSFUL_STATES = new Set(["accepted", "sent", "delivered", "read"]);

export function priorWhatsAppDisposition(message: PriorWhatsAppMessage): "success" | "retry" | "in_flight" {
  if (SUCCESSFUL_STATES.has(message.status)) return "success";
  if (message.status === "failed") return "retry";
  // A pending row may already have been accepted by Meta before our durable
  // status update failed. Automatic resend would create a duplicate message;
  // leave it indeterminate for reconciliation instead.
  return "in_flight";
}
