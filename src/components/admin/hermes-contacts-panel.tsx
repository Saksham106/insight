import { Contact } from "lucide-react";

import { HermesContactImport } from "@/components/admin/hermes-contact-import";
import { HermesContactQuickAdd } from "@/components/admin/hermes-contact-quick-add";
import {
  Disclosure,
  Empty,
  PanelCard,
  type HermesAdminContact,
} from "@/components/admin/hermes-dashboard-shared";
import { Badge } from "@/components/ui/badge";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export function HermesContactsPanel({ contacts }: { contacts: HermesAdminContact[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Disclosure bare summary="Add a contact" hint="one WhatsApp number at a time">
        <HermesContactQuickAdd />
      </Disclosure>

      <Disclosure bare summary="Import a contact file" hint="upload an academy-only .vcf">
        <HermesContactImport />
      </Disclosure>

      <PanelCard
        icon={<Contact size={18} />}
        title="Contact directory"
        description={`${contacts.length} active contacts · Read-only`}
      >
        {contacts.length === 0 ? (
          <Empty>No contacts yet. Add one or import a contact file above.</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="border border-border"
                style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="text-sm font-semibold text-navy">{contact.display_name}</p>
                  <p className="text-xs text-muted">{contact.whatsapp_e164}</p>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  <Badge>{readable(contact.role)}</Badge>
                  <span className="text-xs text-muted">
                    Insight link: {readable(contact.profile_link_status)} · Messaging: {readable(contact.communication_policy)} · Consent: {readable(contact.consent_status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
