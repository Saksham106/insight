import { HermesAssistantDashboard } from "@/components/admin/hermes-assistant-dashboard";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function HermesAdminPage() {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const [contacts, cases, approvals, messages, settlements] = await Promise.all([
    supabase
      .from("hermes_contacts")
      .select("id, display_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at")
      .is("deleted_at", null)
      .order("display_name"),
    supabase
      .from("hermes_scheduling_cases")
      .select("id, title, status, human_takeover, updated_at")
      .not("status", "in", '("confirmed","cancelled")')
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("hermes_approvals")
      .select("id, action, status, requested_at, payload, proposal_version, case:case_id(id, title), settlement:settlement_cycle_id(id, period_start, currency)")
      .eq("status", "pending")
      .order("requested_at")
      .limit(20),
    supabase
      .from("hermes_messages")
      .select("id, direction, message_kind, status, occurred_at, contact:contact_id(display_name)")
      .order("occurred_at", { ascending: false })
      .limit(25),
    supabase
      .from("academy_settlement_cycles")
      .select("id, period_start, currency, status, updated_at, tutor_reports:academy_tutor_reports(status), family_invoices:academy_family_invoices(status), tutor_payouts:academy_tutor_payouts(status)")
      .order("period_start", { ascending: false })
      .limit(12),
  ]);

  return (
    <HermesAssistantDashboard
      contacts={contacts.data ?? []}
      cases={cases.data ?? []}
      approvals={approvals.data ?? []}
      messages={messages.data ?? []}
      settlements={settlements.data ?? []}
      loadError={contacts.error || cases.error || approvals.error || messages.error || settlements.error ? "Some Kitty information could not be loaded." : null}
    />
  );
}
