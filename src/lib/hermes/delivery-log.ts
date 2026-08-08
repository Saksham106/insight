/**
 * Turning a hermes_messages row into a line Swati can read.
 *
 * The page has always joined each message to its contact, but the log rendered
 * "outbound template · delivered" and dropped the relation, so the one thing
 * that makes a delivery meaningful — who it was to — never reached the screen.
 *
 * Everything here is a projection: it selects and relabels, and deliberately
 * carries no error detail, external message id, idempotency key, or raw
 * webhook payload, so a field added to the table upstream cannot leak into the
 * admin UI by default.
 */

/** Enough to recognise a message, short enough to keep one row on one line. */
export const DELIVERY_LOG_PREVIEW_LIMIT = 80;

/** The delivery log stays deliberately short; it is a recent-activity feed. */
export const DELIVERY_LOG_ROW_LIMIT = 25;

type ContactRelation =
  | { display_name?: string | null }
  | Array<{ display_name?: string | null }>
  | null
  | undefined;

export interface DeliveryLogMessage {
  id: string;
  direction: string;
  message_kind: string;
  intent?: string | null;
  template_name?: string | null;
  body?: string | null;
  status: string;
  error_code?: string | null;
  occurred_at: string;
  contact?: ContactRelation;
}

export interface DeliveryLogRow {
  id: string;
  /** "To Priya" / "From Priya" — the whole point of the row. */
  who: string;
  contactName: string;
  /** Null when the kind would tell the reader nothing. */
  kind: string | null;
  status: string;
  occurredAt: string;
  preview: string | null;
  /** True when the delivery can be retried or reconciled. */
  failed: boolean;
  errorCode: string | null;
}

/** A contact row can be missing entirely once the contact is removed. */
const UNKNOWN_CONTACT = "a removed contact";

function contactName(relation: ContactRelation): string {
  const record = Array.isArray(relation) ? relation[0] : relation;
  const name = record?.display_name?.trim();
  return name ? name : UNKNOWN_CONTACT;
}

/** "some_new_state" -> "Some new state". Keeps unknown values readable. */
function humanize(value: string): string {
  const words = value.replaceAll("_", " ").trim();
  if (words === "") return "";
  return words[0].toUpperCase() + words.slice(1).toLowerCase();
}

function describeKind(message: DeliveryLogMessage): string | null {
  // An intent says why the message was sent, which beats how it was encoded.
  const intent = message.intent?.trim();
  if (intent) return humanize(intent);

  const template = message.template_name?.trim();
  if (template) return `Template: ${humanize(template)}`;

  // "text" restates what a body preview already shows.
  if (message.message_kind === "text" || message.message_kind === "unknown") return null;
  return humanize(message.message_kind);
}

function describePreview(body: string | null | undefined): string | null {
  const flattened = body?.replace(/\s+/g, " ").trim();
  if (!flattened) return null;
  return flattened.length > DELIVERY_LOG_PREVIEW_LIMIT
    ? `${flattened.slice(0, DELIVERY_LOG_PREVIEW_LIMIT)}…`
    : flattened;
}

export function projectDeliveryLogRow(message: DeliveryLogMessage): DeliveryLogRow {
  const name = contactName(message.contact);
  const failed = message.status === "failed";
  return {
    id: message.id,
    who: `${message.direction === "inbound" ? "From" : "To"} ${name}`,
    contactName: name,
    kind: describeKind(message),
    status: humanize(message.status),
    occurredAt: message.occurred_at,
    preview: describePreview(message.body),
    failed,
    // Only the bounded code, never error_detail — that can carry internals.
    errorCode: failed ? (message.error_code?.trim() || null) : null,
  };
}

export function projectDeliveryLog(
  messages: readonly DeliveryLogMessage[],
  limit = DELIVERY_LOG_ROW_LIMIT,
): DeliveryLogRow[] {
  return messages.slice(0, limit).map(projectDeliveryLogRow);
}
