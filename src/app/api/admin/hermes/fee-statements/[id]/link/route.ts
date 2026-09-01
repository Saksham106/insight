import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  feeStatementPublicUrl,
  feeStatementTokenHash,
} from "@/lib/hermes/fee-statement-link";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid statement." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_fee_statements")
    .select("client_request_id, public_token_hash, status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Could not retrieve this statement link." },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Statement not found." },
      { status: 404, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
  if (data.status === "void") {
    return NextResponse.json(
      { error: "Voided statements do not have an active payment link." },
      { status: 409, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }

  let link: ReturnType<typeof feeStatementPublicUrl>;
  try {
    link = feeStatementPublicUrl(data.client_request_id);
  } catch {
    return NextResponse.json(
      { error: "Statement links are temporarily unavailable." },
      { status: 503, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }

  if (feeStatementTokenHash(link.token) !== data.public_token_hash) {
    return NextResponse.json(
      { error: "This statement link cannot be recovered safely." },
      { status: 409, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }

  return NextResponse.json(
    { url: link.url },
    { headers: PRIVATE_RESPONSE_HEADERS },
  );
}
