"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { suggestGroupTitle } from "@/lib/chat/group-derive";
import { MINIMUM_ROSTER, hasMinimumRoster } from "@/lib/chat/conversation-shape";
import type { ChattableContact } from "@/lib/chat-types";

export function NewConversationModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: ChattableContact[];
  onClose: () => void;
  onCreated: (conversationId: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when these exact people already had a chat, so nothing was created.
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  const toggle = (id: string) => {
    setDuplicateOf(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const nameById = useMemo(() => new Map(contacts.map((c) => [c.id, c.full_name])), [contacts]);
  const placeholder = useMemo(
    () => suggestGroupTitle([...selected].map((id) => nameById.get(id) ?? "").filter(Boolean)),
    [selected, nameById],
  );

  const create = async () => {
    setError(null);
    setDuplicateOf(null);
    if (!hasMinimumRoster(selected.size)) {
      setError(`Pick at least ${MINIMUM_ROSTER} people.`);
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [...selected], title: name.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the conversation.");
      return;
    }
    // These people already had a chat, so none was created. Say so and offer
    // to open it, rather than closing on a chat the admin didn't just make.
    if (data.existing) {
      setDuplicateOf(data.conversationId as string);
      return;
    }
    await onCreated(data.conversationId as string);
  };

  return (
    <Modal
      title="New chat"
      description="Pick who's in it. You create the chat but aren't a member, so you won't be able to send messages in it."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input
          placeholder={selected.size > 0 ? placeholder : "Chat name (optional)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        {duplicateOf && (
          <div
            className="border border-border"
            style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "8px", background: "var(--color-soft)" }}
          >
            <p className="text-sm text-navy">
              A chat with exactly these people already exists, so no new one was created.
            </p>
            <Button size="sm" onClick={() => onCreated(duplicateOf)} style={{ alignSelf: "flex-start" }}>
              Open it
            </Button>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <p className="text-xs text-muted">{selected.size} selected</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={creating || Boolean(duplicateOf) || !hasMinimumRoster(selected.size)}>
              {creating ? "Creating…" : "Create chat"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
