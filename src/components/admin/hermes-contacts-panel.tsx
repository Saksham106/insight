"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Contact, Pencil, Search } from "lucide-react";

import { HermesContactImport } from "@/components/admin/hermes-contact-import";
import { HermesContactQuickAdd } from "@/components/admin/hermes-contact-quick-add";
import {
  Disclosure,
  Empty,
  PanelCard,
  type HermesAdminContact,
} from "@/components/admin/hermes-dashboard-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messagingName } from "@/lib/hermes/contact-name";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

/** What an empty input resets the contact to. */
function derivedDefault(contact: HermesAdminContact) {
  return messagingName({ display_name: contact.display_name, preferred_name: null });
}

/**
 * The name Kitty greets this contact by. Shown muted while it is still derived
 * from `display_name`, so a chosen name is distinguishable from a guess.
 */
function MessagingName({ contact }: { contact: HermesAdminContact }) {
  const router = useRouter();
  const resolved = messagingName(contact);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(resolved);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const trimmed = value.trim();

    try {
      const response = await fetch(`/api/admin/hermes/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredName: trimmed === "" ? null : trimmed }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The name was not saved.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("The name was not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className="text-xs text-muted" style={{ marginTop: "2px" }}>
        Messages as{" "}
        <span className={contact.preferred_name ? "font-semibold text-navy" : undefined}>
          {resolved}
        </span>{" "}
        <button
          type="button"
          onClick={() => {
            setValue(resolved);
            setError(null);
            setEditing(true);
          }}
          aria-label={`Edit the messaging name for ${contact.display_name}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: "var(--color-slate)",
            verticalAlign: "middle",
          }}
        >
          <Pencil size={12} />
        </button>
      </p>
    );
  }

  return (
    <form
      onSubmit={save}
      style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
    >
      <Input
        value={value}
        autoFocus
        maxLength={100}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Messaging name for ${contact.display_name}`}
        placeholder={derivedDefault(contact)}
        style={{ height: "32px", width: "160px" }}
      />
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </form>
  );
}

export function HermesContactsPanel({ contacts }: { contacts: HermesAdminContact[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return contacts;
    return contacts.filter(
      (contact) =>
        contact.display_name.toLowerCase().includes(needle) ||
        messagingName(contact).toLowerCase().includes(needle) ||
        contact.whatsapp_e164.toLowerCase().includes(needle),
    );
  }, [contacts, needle]);

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
        description={
          needle
            ? `${visible.length} of ${contacts.length} contacts`
            : `${contacts.length} active contacts`
        }
      >
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-muted)",
              pointerEvents: "none",
            }}
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts by name or number…"
            aria-label="Search contacts"
            style={{ paddingLeft: "32px" }}
          />
        </div>

        {contacts.length === 0 ? (
          <Empty>No contacts yet. Add one or import a contact file above.</Empty>
        ) : visible.length === 0 ? (
          <Empty>No contacts match that search.</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {visible.map((contact) => (
              <li
                key={contact.id}
                className="border border-border"
                style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="text-sm font-semibold text-navy">{contact.display_name}</p>
                  <p className="text-xs text-muted">{contact.whatsapp_e164}</p>
                  <MessagingName contact={contact} />
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
