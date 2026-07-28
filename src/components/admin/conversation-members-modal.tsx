"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { MINIMUM_ROSTER, hasMinimumRoster } from "@/lib/chat/conversation-shape";
import type { ChattableContact, ConversationSummary } from "@/lib/chat-types";

export function ConversationMembersModal({
  conversation,
  contacts,
  onClose,
  onChanged,
  onArchived,
}: {
  conversation: ConversationSummary;
  contacts: ChattableContact[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onArchived: (id: string) => void;
}) {
  const [name, setName] = useState(conversation.isGroup ? conversation.title : "");
  const [selected, setSelected] = useState<Set<string>>(new Set(conversation.members.map((m) => m.id)));
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setError(null);
    if (!hasMinimumRoster(selected.size)) {
      setError(`A chat needs at least ${MINIMUM_ROSTER} people.`);
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: name.trim() || null, memberIds: [...selected] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save changes.");
      return;
    }
    await onChanged();
  };

  const archive = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/conversations/${conversation.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not archive the chat.");
      return;
    }
    onArchived(conversation.id);
  };

  if (confirmArchive) {
    return (
      <Modal
        title="Archive chat?"
        description="The conversation is hidden from everyone but its message history is kept. This can't be undone from here."
        onClose={() => setConfirmArchive(false)}
      >
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" disabled={saving} onClick={() => setConfirmArchive(false)}>Cancel</Button>
          <Button disabled={saving} onClick={archive} style={{ backgroundColor: "var(--color-error)", border: "none" }}>
            {saving ? "Archiving…" : "Yes, archive"}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Members"
      description="Adding a third person turns a one-to-one chat into a group. Everyone added can read the whole history."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input placeholder="Chat name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setConfirmArchive(true)}
            style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
          >
            Archive
          </Button>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
