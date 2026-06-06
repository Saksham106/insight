import { NextResponse } from "next/server";
import { Resend } from "resend";

import { createAdminClient } from "@/lib/supabase/admin";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s().-]{7,40}$/;

function clean(value: unknown, maxLength: number) {
  const text = value?.toString().trim() ?? "";
  return text ? text.slice(0, maxLength) : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function detailRow(label: string, value: string) {
  return `<tr>
    <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
      <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">${label}</span>
      <span style="color:${NAVY};font-weight:600;">${escapeHtml(value)}</span>
    </td>
  </tr>`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const role = clean((body as { role?: unknown }).role, 20);
  const fullName = clean((body as { fullName?: unknown }).fullName, 120);
  const email = clean((body as { email?: unknown }).email, 254)?.toLowerCase() ?? null;
  const phone = clean((body as { phone?: unknown }).phone, 40);
  const message = clean((body as { message?: unknown }).message, 1000);

  if (role !== "student" && role !== "teacher") {
    return NextResponse.json({ error: "Please choose student or teacher." }, { status: 400 });
  }

  if (!email && !phone) {
    return NextResponse.json({ error: "Please include an email address or phone number." }, { status: 400 });
  }

  if (email && !emailRegex.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (phone && !phoneRegex.test(phone)) {
    return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
  }

  let requestId = "";

  try {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("join_interest_requests")
      .insert({
        full_name: fullName,
        role,
        email,
        phone,
        message,
        source: "landing_page",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to save your request." }, { status: 500 });
    }

    requestId = data.id as string;
  } catch {
    return NextResponse.json({ error: "Interest requests are not configured yet." }, { status: 503 });
  }

  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const roleLabel = role === "teacher" ? "Teacher" : "Student or parent";
    const safeMessage = message ? escapeHtml(message).replaceAll("\n", "<br>") : null;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${NAVY};">New join interest request</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 36px 32px;">
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;border:1px solid ${BORDER};">
          ${detailRow("Role", roleLabel)}
          ${fullName ? detailRow("Name", fullName) : ""}
          ${email ? detailRow("Email", email) : ""}
          ${phone ? detailRow("Phone", phone) : ""}
          ${safeMessage ? `<tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:6px;">Note</span>
              <span style="color:#111827;white-space:pre-wrap;">${safeMessage}</span>
            </td>
          </tr>` : ""}
          ${detailRow("Request ID", requestId)}
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">Saved in the join_interest_requests table.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await resend.emails.send({
        from,
        to: process.env.ADMIN_EMAIL,
        replyTo: email ?? undefined,
        subject: `[Insight] Join interest from ${fullName ?? roleLabel}`,
        html,
      });
    } catch {
      // The request is already saved; do not make the public form fail because email delivery is down.
    }
  }

  return NextResponse.json({ ok: true });
}
