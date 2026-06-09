import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getEmailFrom } from "@/lib/email/from";
import { createClient } from "@/lib/supabase/server";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const profile = await getUserProfile();
  let senderEmail: string | null = null;

  if (profile) {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    senderEmail = authData.user?.email ?? null;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const category = clean((body as { category?: unknown }).category, 80);
  const message = clean((body as { message?: unknown }).message, 2000);
  const publicName = clean((body as { name?: unknown }).name, 120);
  const publicEmail = clean((body as { email?: unknown }).email, 254)?.toLowerCase() ?? null;

  if (!category || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!profile) {
    if (!publicName) {
      return NextResponse.json({ error: "Please include your name." }, { status: 400 });
    }

    if (!publicEmail) {
      return NextResponse.json({ error: "Please include your email address." }, { status: 400 });
    }

    if (!emailRegex.test(publicEmail)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    senderEmail = publicEmail;
  }

  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
    return NextResponse.json({ ok: true }); // silently succeed if not configured
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getEmailFrom();
  const senderName = profile ? profile.full_name : publicName;
  const senderRole = profile ? profile.role : "public visitor";
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${NAVY};">New message from a user</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 36px 32px;">
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;border:1px solid ${BORDER};">
          ${detailRow("From", `${senderName} (${senderRole})`)}
          ${senderEmail ? detailRow("Email", senderEmail) : ""}
          ${detailRow("Category", category)}
          <tr>
            <td style="padding:14px 18px;">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:6px;">Message</span>
              <span style="color:#111827;white-space:pre-wrap;">${safeMessage}</span>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">Sent via the Insight Academy ${profile ? "in-app feedback form" : "public contact form"}.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: process.env.ADMIN_EMAIL,
    replyTo: senderEmail ?? undefined,
    subject: `[Insight] ${category} from ${senderName}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
