import { Resend } from "resend";

export type SessionEmailEvent =
  | "proposed"    // new session created — notify other party
  | "confirmed"   // session confirmed — notify proposer
  | "cancelled"   // session cancelled — notify other party
  | "rescheduled"; // session rescheduled — notify other party

interface SessionEmailOptions {
  event: SessionEmailEvent;
  recipientEmail: string;
  recipientName: string;
  actorName: string;       // the person who triggered the action
  scheduledAt: string;     // ISO string
  durationMinutes: number;
  notes?: string | null;
  role: "teacher" | "student"; // recipient's role (determines dashboard link)
  recipientTimezone?: string | null;
}

const NAVY = "#1b3560";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function formatDateTime(iso: string, timezone?: string | null) {
  const d = new Date(iso);
  const tz = timezone ?? "UTC";
  const date = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
  const tzAbbr = d.toLocaleTimeString("en-US", { timeZoneName: "short", timeZone: tz }).split(" ").pop() ?? tz;
  return { date, time: `${time} ${tzAbbr}` };
}

function sessionDetailsHtml(scheduledAt: string, durationMinutes: number, notes?: string | null, timezone?: string | null) {
  const { date, time } = formatDateTime(scheduledAt, timezone);
  return `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f9fafb;border-radius:8px;border:1px solid ${BORDER};">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
          <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">Date</span>
          <span style="color:${NAVY};font-weight:600;">${date}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
          <span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">Time</span>
          <span style="color:${NAVY};font-weight:600;">${time} · ${durationMinutes} min</span>
        </td>
      </tr>
      ${notes ? `<tr><td style="padding:14px 18px;"><span style="color:${MUTED};font-size:12px;display:block;margin-bottom:2px;">Notes</span><span style="color:#111827;">${notes}</span></td></tr>` : ""}
    </table>
  `;
}

function layout(title: string, preheader: string, body: string, dashboardPath: string, appUrl: string) {
  const APP_URL = appUrl;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table style="width:100%;max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};border-collapse:collapse;">
    <tr>
      <td style="padding:32px 36px 0;">
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${NAVY};">insight</p>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${NAVY};">${title}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:0 36px 32px;">
        ${body}
        <a href="${APP_URL}${dashboardPath}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:${NAVY};color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
          View in app →
        </a>
        <p style="margin:32px 0 0;font-size:12px;color:${MUTED};">You're receiving this because you have an account on insight.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const configs: Record<SessionEmailEvent, (o: SessionEmailOptions) => { subject: string; title: string; preheader: string; body: string }> = {
  proposed: (o) => ({
    subject: `New session proposed by ${o.actorName}`,
    title: "A session has been proposed",
    preheader: `${o.actorName} wants to schedule a session with you.`,
    body: `<p style="margin:16px 0;color:#374151;">Hi ${o.recipientName},</p>
           <p style="margin:0 0 4px;color:#374151;"><strong>${o.actorName}</strong> has proposed a tutoring session.</p>
           ${sessionDetailsHtml(o.scheduledAt, o.durationMinutes, o.notes, o.recipientTimezone)}
           <p style="color:#374151;">Please log in to confirm or suggest a different time.</p>`,
  }),
  confirmed: (o) => ({
    subject: `Session confirmed by ${o.actorName}`,
    title: "Your session has been confirmed",
    preheader: `${o.actorName} confirmed your session.`,
    body: `<p style="margin:16px 0;color:#374151;">Hi ${o.recipientName},</p>
           <p style="margin:0 0 4px;color:#374151;"><strong>${o.actorName}</strong> has confirmed your session.</p>
           ${sessionDetailsHtml(o.scheduledAt, o.durationMinutes, o.notes, o.recipientTimezone)}
           <p style="color:#374151;">The session is locked in. See you then!</p>`,
  }),
  cancelled: (o) => ({
    subject: `Session cancelled by ${o.actorName}`,
    title: "A session has been cancelled",
    preheader: `${o.actorName} cancelled a session.`,
    body: `<p style="margin:16px 0;color:#374151;">Hi ${o.recipientName},</p>
           <p style="margin:0 0 4px;color:#374151;"><strong>${o.actorName}</strong> has cancelled the following session.</p>
           ${sessionDetailsHtml(o.scheduledAt, o.durationMinutes, o.notes, o.recipientTimezone)}
           <p style="color:#374151;">You can log in to schedule a new session if needed.</p>`,
  }),
  rescheduled: (o) => ({
    subject: `Session rescheduled by ${o.actorName}`,
    title: "A session has been rescheduled",
    preheader: `${o.actorName} proposed a new time for your session.`,
    body: `<p style="margin:16px 0;color:#374151;">Hi ${o.recipientName},</p>
           <p style="margin:0 0 4px;color:#374151;"><strong>${o.actorName}</strong> has proposed a new time for your session.</p>
           ${sessionDetailsHtml(o.scheduledAt, o.durationMinutes, o.notes, o.recipientTimezone)}
           <p style="color:#374151;">Please log in to confirm or suggest a different time.</p>`,
  }),
};

interface ReminderEmailOptions {
  recipientEmail: string;
  recipientName: string;
  otherPartyName: string;
  scheduledAt: string;
  durationMinutes: number;
  hoursUntil: 24 | 3;
  role: "teacher" | "student";
  recipientTimezone?: string | null;
}

export async function sendReminderEmail(options: ReminderEmailOptions) {
  if (!process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const label = options.hoursUntil === 24 ? "tomorrow" : "in 3 hours";
  const subject = `Reminder: session ${label} with ${options.otherPartyName}`;
  const dashboardPath = options.role === "teacher" ? "/teacher" : "/student";

  const body = `<p style="margin:16px 0;color:#374151;">Hi ${options.recipientName},</p>
    <p style="margin:0 0 4px;color:#374151;">This is a reminder that you have a session with <strong>${options.otherPartyName}</strong> ${label}.</p>
    ${sessionDetailsHtml(options.scheduledAt, options.durationMinutes, null, options.recipientTimezone)}
    <p style="color:#374151;">We'll see you then!</p>`;

  await resend.emails.send({
    from: FROM,
    to: options.recipientEmail,
    subject,
    html: layout("Upcoming session reminder", subject, body, dashboardPath, APP_URL),
  });
}

export async function sendSessionEmail(options: SessionEmailOptions) {
  if (!process.env.RESEND_API_KEY) return; // silently skip if not configured

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const dashboardPath = options.role === "teacher" ? "/teacher" : "/student";
  const { subject, title, preheader, body } = configs[options.event](options);

  await resend.emails.send({
    from: FROM,
    to: options.recipientEmail,
    subject,
    html: layout(title, preheader, body, dashboardPath, APP_URL),
  });
}
