"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { HermesAdminContact } from "@/components/admin/hermes-dashboard-shared";
import {
  projectRelationshipsForContact,
  selectableLinkTargets,
  type RelationshipRow,
} from "@/lib/hermes/relationships";

/**
 * Children on a parent card, guardians on a student card.
 *
 * Removing a link deactivates it and keeps the history, and re-adding the same
 * pair reactivates the same row, so nothing here is destructive and nothing
 * needs a confirmation prompt.
 */
export function HermesContactLinks({
  contact,
  contacts,
  relationships,
}: {
  contact: HermesAdminContact;
  contacts: HermesAdminContact[];
  relationships: RelationshipRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState("");

  const isParent = contact.role === "parent";
  const view = useMemo(
    () => projectRelationshipsForContact({ contactId: contact.id, relationships, contacts }),
    [contact.id, contacts, relationships],
  );
  const linked = isParent ? view.children : view.guardians;
  const options = useMemo(
    () =>
      selectableLinkTargets({
        contactId: contact.id,
        wantedRole: isParent ? "student" : "parent",
        contacts,
        alreadyLinkedIds: linked.map((person) => person.contactId),
      }),
    [contact.id, contacts, isParent, linked],
  );

  async function send(otherContactId: string, active: boolean) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/hermes/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentContactId: isParent ? contact.id : otherContactId,
        studentContactId: isParent ? otherContactId : contact.id,
        active,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Could not update the link.");
      return;
    }
    setChoice("");
    router.refresh();
  }

  const label = isParent ? "Children" : "Parents and guardians";
  const selectId = `link-select-${contact.id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      <p className="text-xs font-semibold text-navy">{label}</p>

      {linked.length === 0 ? (
        <p className="text-xs text-muted">
          {isParent
            ? "No children linked yet. Link one so Kitty knows who this parent is for."
            : "No guardian linked yet. Link one so Kitty can reach a parent when this student should not be messaged directly."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {linked.map((person) => (
            <li
              key={person.relationshipId}
              className="border border-border"
              style={{ borderRadius: "999px", padding: "2px 4px 2px 10px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <span className="text-xs">{person.displayName}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Remove the link to ${person.displayName}`}
                onClick={() => void send(person.contactId, false)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      {options.length > 0 ? (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor={selectId} className="text-xs text-muted">
            {isParent ? "Add a child" : "Add a guardian"}
          </label>
          <select
            id={selectId}
            value={choice}
            disabled={busy}
            onChange={(event) => setChoice(event.target.value)}
            className="text-xs"
            style={{
              minHeight: "32px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "inherit",
              padding: "0 8px",
            }}
          >
            <option value="">Choose a {isParent ? "student" : "parent"}…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.display_name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || choice === ""}
            onClick={() => void send(choice, true)}
          >
            Link
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          No eligible {isParent ? "student" : "parent"} contacts are available to link.
        </p>
      )}

      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
