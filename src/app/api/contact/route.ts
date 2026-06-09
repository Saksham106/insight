import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getEmailFrom } from "@/lib/email/from";
import { createClient } from "@/lib/supabase/server";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const senderEmail = authData.user?.email ?? null;

  const body = await request.json();
  const { category, message } = body;

  if (!category || !message?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
    return NextResponse.json({ ok: true }); // silently succeed if not configured
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getEmailFrom();

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
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">From</span>
              <span style="color:${NAVY};font-weight:600;">${profile.full_name} (${profile.role})</span>
            </td>
          </tr>
          ${senderEmail ? `<tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">Email</span>
              <a href="mailto:${senderEmail}" style="color:${NAVY};font-weight:600;">${senderEmail}</a>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">Category</span>
              <span style="color:${NAVY};font-weight:600;">${category}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px;">
              <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:6px;">Message</span>
              <span style="color:#111827;white-space:pre-wrap;">${message.trim()}</span>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">Sent via the Insight Academy in-app feedback form.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: process.env.ADMIN_EMAIL,
    replyTo: senderEmail ?? undefined,
    subject: `[Insight] ${category} from ${profile.full_name}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
