import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Resend } from "resend";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { generateTempPassword } from "@/lib/auth/generate-temp-password";
import { getEmailFrom } from "@/lib/email/from";
import { createAdminClient } from "@/lib/supabase/admin";

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function buildCredentialsEmail(fullName: string, email: string, password: string, loginUrl: string) {
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
        <p style="color:#374151;line-height:1.6;margin:0 0 24px;">You've been invited to Insight Academy. Here's how to log in:</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#f9fafb;border:1px solid ${BORDER};border-radius:8px 8px 0 0;font-size:13px;color:${MUTED};">Email</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 10px;border:1px solid ${BORDER};border-top:none;font-size:14px;font-weight:600;color:${NAVY};">${email}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#f9fafb;border:1px solid ${BORDER};border-top:none;font-size:13px;color:${MUTED};">Password</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 10px;border:1px solid ${BORDER};border-top:none;border-radius:0 0 8px 8px;font-size:14px;font-weight:600;color:${NAVY};font-family:monospace;">${password}</td>
          </tr>
        </table>
        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:${NAVY};color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
          Log in →
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:${MUTED};">For security, we recommend changing your password after logging in (Settings → Password).</p>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">If you weren't expecting this invitation, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendCredentialsEmail(fullName: string, email: string, password: string, origin: string) {
  if (!process.env.RESEND_API_KEY) {
    return { error: "Email not configured — cannot send invite." };
  }

  const resendClient = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resendClient.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: "Your Insight Academy login",
    html: buildCredentialsEmail(fullName, email, password, `${origin}/login`),
  });

  if (error) {
    return { error: "Failed to send invite email." };
  }

  return { error: null };
}

interface InviteUserState {
  auth_user_id: string;
  last_sign_in_at: string | null;
  password_set_at: string | null;
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

  if (!["teacher", "student", "admin", "parent"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const isResend = body.resend === true;
  const origin = new URL(request.url).origin;
  const supabaseAdmin = createAdminClient();

  const { data: inviteState, error: rpcError } = await supabaseAdmin
    .rpc("get_invite_user_state", { p_email: email })
    .maybeSingle<InviteUserState>();

  if (rpcError) {
    return NextResponse.json({ error: "Failed to look up existing user." }, { status: 500 });
  }

  const isActive = Boolean(inviteState?.last_sign_in_at) || Boolean(inviteState?.password_set_at);

  if (inviteState && isActive) {
    return NextResponse.json(
      { alreadyActive: true, error: "This user already has an active account and can log in directly." },
      { status: 409 },
    );
  }

  if (inviteState && !isResend) {
    // Exists, never used — admin must explicitly confirm the resend action.
    return NextResponse.json({ alreadyInvited: true }, { status: 409 });
  }

  const password = generateTempPassword();

  if (inviteState) {
    // Never-used existing account — safe to regenerate credentials.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(inviteState.auth_user_id, {
      password,
      // Legacy magic-link invites left the email unconfirmed, which blocks password login.
      email_confirm: true,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message ?? "Failed to reset credentials." }, { status: 500 });
    }

    const { error: emailError } = await sendCredentialsEmail(fullName, email, password, origin);

    await supabaseAdmin
      .from("profiles")
      .update({ invite_sent_at: new Date().toISOString() })
      .eq("id", inviteState.auth_user_id);

    revalidateTag("admin-dashboard", "max");
    revalidateTag("dashboard", "max");

    if (emailError) {
      return NextResponse.json({ userId: inviteState.auth_user_id, password, emailError });
    }

    return NextResponse.json({ userId: inviteState.auth_user_id, password });
  }

  // Brand-new user — create the account with a working password immediately.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Invite failed" }, { status: 500 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "Invite failed" }, { status: 500 });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: data.user.id,
      full_name: fullName,
      role,
      is_active: true,
      invite_sent_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return NextResponse.json(
      { error: "The account was created, but saving the profile failed. Please try inviting again." },
      { status: 500 },
    );
  }

  const { error: emailError } = await sendCredentialsEmail(fullName, email, password, origin);

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  if (emailError) {
    return NextResponse.json({ userId: data.user.id, password, emailError });
  }

  return NextResponse.json({ userId: data.user.id, password });
}
