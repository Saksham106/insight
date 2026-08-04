"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { MINIMUM_ROSTER, hasMinimumRoster } from "@/lib/chat/conversation-shape";
import type { ChattableContact, ConversationSummary } from "@/lib/chat-types";

// Every control an admin has over an existing chat, in one place: its name, who
// is in it, and deleting it. These all existed before but lived behind a button
// labelled "Members", where nothing suggested rename and delete were also in
// there — so they may as well not have existed.
export function ManageChatModal({
  conversation,
  contacts,
  onClose,
  onChanged,
  onDeleted,
}: {
  conversation: ConversationSummary;
  contacts: ChattableContact[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onDeleted: (id: string) => void;
}) {
  // Seeded from customTitle, never the resolved title — that may be a
  // synthesized roster string that was never stored, and saving it back would
  // turn a display fallback into real data.
  const [name, setName] = useState(conversation.customTitle ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(conversation.members.map((m) => m.id)));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const remove = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/conversations/${conversation.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete the chat.");
      return;
    }
    onDeleted(conversation.id);
  };

  if (confirmDelete) {
    return (
      <Modal
        title="Delete chat?"
        description="The chat disappears for everyone in it. Its message history stays in the database and isn't shown anywhere — but you can't undo this from here."
        onClose={() => setConfirmDelete(false)}
      >
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" disabled={saving} onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button disabled={saving} onClick={remove} style={{ backgroundColor: "var(--color-error)", border: "none" }}>
            {saving ? "Deleting…" : "Yes, delete"}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Manage chat"
      description="Rename this chat, change who's in it, or delete it."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="manage-chat-name">Chat name</Label>
          <Input
            id="manage-chat-name"
            placeholder="Optional — otherwise the members' names are used"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label>Members</Label>
          <p className="text-xs text-muted">
            Tap to add or remove. Adding a third person turns a one-to-one chat into a group, and
            everyone added can read the whole history.
          </p>
          <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--color-border)" }}>
          <Label>Delete chat</Label>
          <p className="text-xs text-muted">
            Removes the chat for everyone in it. Message history is kept in the database.
          </p>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
            style={{ alignSelf: "flex-start", color: "var(--color-error)", borderColor: "var(--color-error)" }}
          >
            Delete chat
          </Button>
        </div>
      </div>
    </Modal>
  );
}
