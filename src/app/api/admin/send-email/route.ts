import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function buildHtml(message: string) {
  const htmlBody = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 36px 32px;">
        <p style="color:#374151;line-height:1.6;margin:0 0 24px;">${htmlBody}</p>
        <p style="margin:32px 0 0;font-size:12px;color:${MUTED};">You're receiving this because you have an account on insight.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
  const rawEmails: string[] = Array.isArray(body.rawEmails) ? body.rawEmails : [];
  const subject: string = (body.subject ?? "").toString().trim();
  const message: string = (body.message ?? "").toString().trim();

  if (!userIds.length && !rawEmails.length) {
    return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  // Resolve user IDs to emails via auth
  const resolvedEmails: string[] = [...rawEmails];

  if (userIds.length > 0) {
    const supabaseAdmin = createAdminClient();
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    const idSet = new Set(userIds);
    for (const u of users) {
      if (idSet.has(u.id) && u.email) resolvedEmails.push(u.email);
    }
  }

  const targets = [...new Set(resolvedEmails)].filter(e => e);

  if (!targets.length) {
    return NextResponse.json({ error: "No valid recipients found" }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const html = buildHtml(message);

  const results = await Promise.allSettled(
    targets.map(email =>
      resend.emails.send({ from: FROM, to: email, subject, html })
    )
  );

  const failed = results.filter(r => r.status === "rejected").length;
  if (failed === targets.length) {
    return NextResponse.json({ error: "All emails failed to send" }, { status: 500 });
  }

  return NextResponse.json({ sent: targets.length - failed });
}
