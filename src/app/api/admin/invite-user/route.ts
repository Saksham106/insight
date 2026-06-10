import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function buildInviteEmail(fullName: string, inviteLink: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${NAVY};">You've been invited</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:0 36px 32px;">
        <p style="color:#374151;line-height:1.6;margin:16px 0;">Hi ${fullName},</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 24px;">You have been invited to Insight Academy. Click the button below to set your password and access your account.</p>
        <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:${NAVY};color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
          Accept invite →
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:${MUTED};">If you weren't expecting this invitation, you can ignore this email.</p>
        <p style="margin:32px 0 0;font-size:12px;color:${MUTED};">You're receiving this because your coordinator set up an account for you on insight.</p>
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
  const email = body.email?.toString().trim();
  const fullName = body.fullName?.toString().trim();
  const role = body.role?.toString().trim();

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!['teacher', 'student', 'admin'].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const isResend = body.resend === true;
  const origin = new URL(request.url).origin;
  const supabaseAdmin = createAdminClient();

  // Explicit resend — admin already saw the warning and confirmed
  if (isResend) {
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${origin}/set-password` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: "Failed to regenerate invite link." }, { status: 500 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Email not configured — cannot resend invite." }, { status: 500 });
    }

    const resendClient = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

    const { error: emailError } = await resendClient.emails.send({
      from: FROM,
      to: email,
      subject: "Your Insight Academy invite",
      html: buildInviteEmail(fullName, linkData.properties.action_link),
    });

    if (emailError) {
      return NextResponse.json({ error: "Failed to send invite email." }, { status: 500 });
    }

    return NextResponse.json({ userId: linkData.user.id });
  }

  // Normal first-time invite
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/set-password`,
  });

  if (error) {
    const alreadyExists =
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("already been invited") ||
      error.status === 422;

    if (!alreadyExists) {
      return NextResponse.json({ error: error.message ?? "Invite failed" }, { status: 500 });
    }

    // auth schema isn't exposed via PostgREST — use the admin API instead
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("password_set_at")
        .eq("id", existingUser.id)
        .maybeSingle();

      if (userProfile?.password_set_at) {
        return NextResponse.json(
          { error: "This user already has an active account and can log in directly." },
          { status: 409 },
        );
      }
    }

    // Invited but hasn't finished — tell the frontend to show the resend prompt
    return NextResponse.json({ alreadyInvited: true }, { status: 409 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "Invite failed" }, { status: 500 });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    role,
    is_active: true,
    invite_sent_at: new Date().toISOString(),
  });

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 },
    );
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ userId: data.user.id });
}
