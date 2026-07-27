import { NextResponse } from "next/server";

import { verifyServiceRequest } from "@/lib/hermes/auth";
import {
  buildTranscriptRows,
  buildWhatsAppDeliveryRows,
  parseTranscriptSyncRequest,
} from "@/lib/hermes/transcripts";
import { createAdminClient } from "@/lib/supabase/admin";

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.HERMES_TOOL_SHARED_SECRET;
  const auth = secret
    ? verifyServiceRequest(request, rawBody, secret)
    : null;
  if (!auth) {
    return failure("Unauthorized", 401);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return failure("Invalid transcript payload", 400);
  }

  const parsed = parseTranscriptSyncRequest(input);
  if (!parsed.ok) {
    return failure("Invalid transcript payload", 400);
  }
  const payload = parsed.value;

  try {
    const supabase = createAdminClient();
    const { error: replayError } = await supabase
      .from("hermes_audit_events")
      .insert({
        actor_type: "hermes",
        event_type: "transcript_sync_request",
        entity_type: "transcript_session",
        request_id: auth.requestId,
        metadata: {
          source:
            "source" in payload ? payload.source : "session",
          whatsappUserId: payload.whatsappUserId,
          messageCount: payload.messages.length,
        },
      });

    if (replayError) {
      return replayError.code === "23505"
        ? failure("Replay rejected", 409)
        : failure("Audit unavailable", 500);
    }

    const { data: contact, error: contactError } = await supabase
      .from("hermes_contacts")
      .select("id")
      .eq("whatsapp_e164", `+${payload.whatsappUserId}`)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (contactError) {
      return failure("Transcript sync failed", 500);
    }
    if (!contact) {
      return failure("Contact not found", 404);
    }

    if ("source" in payload) {
      const rows = buildWhatsAppDeliveryRows(payload, contact.id);
      const { error: upsertError } = await supabase
        .from("hermes_messages")
        .upsert(rows, {
          onConflict: "meta_message_id",
          ignoreDuplicates: true,
        });
      if (upsertError) {
        return failure("Transcript sync failed", 500);
      }
      return NextResponse.json({
        ok: true,
        acknowledgedMessageIds: payload.messages.map(
          (message) => message.messageId,
        ),
        accepted: payload.messages.length,
      });
    }

    const rows = buildTranscriptRows(payload, contact.id);
    const { error: upsertError } = await supabase
      .from("hermes_transcript_messages")
      .upsert(rows, {
        onConflict: "hermes_session_id,hermes_message_id",
        ignoreDuplicates: true,
      });
    if (upsertError) {
      return failure("Transcript sync failed", 500);
    }
    const highestMessageId =
      payload.messages[payload.messages.length - 1].messageId;
    return NextResponse.json({
      ok: true,
      highestMessageId,
      accepted: payload.messages.length,
    });
  } catch {
    return failure("Transcript sync failed", 500);
  }
}
