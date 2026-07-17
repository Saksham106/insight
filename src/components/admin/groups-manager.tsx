"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { suggestGroupTitle } from "@/lib/chat/group-derive";
import type { ChattableContact, ConversationSummary } from "@/lib/chat-types";

function lastActivity(c: ConversationSummary): string {
  if (!c.lastMessage) return "No messages yet";
  const body = c.lastMessage.body || (c.lastMessage.fileName ? `📎 ${c.lastMessage.fileName}` : "Attachment");
  return body;
}

export function GroupsManager() {
  const router = useRouter();
  const [groups, setGroups] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ChattableContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [managing, setManaging] = useState<ConversationSummary | null>(null);

  const load = useCallback(async () => {
    const [g, c] = await Promise.all([
      fetch(`/api/admin/groups?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/chat/contacts", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    setGroups((g.groups as ConversationSummary[]) ?? []);
    setContacts((c.contacts as ChattableContact[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <h2 className="text-lg font-semibold text-navy">Groups</h2>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus style={{ height: "16px", width: "16px", marginRight: "6px" }} />
          New group
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading groups…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group to start a conversation between teachers, students, and parents. You won't be added to it."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: "12px",
          }}
        >
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setManaging(g)}
              className="border border-border bg-surface"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                borderRadius: "12px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "var(--color-accent-soft)",
                    color: "var(--color-navy)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Users size={18} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="text-sm font-semibold text-navy" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.title}
                  </p>
                  <p className="text-xs text-muted">{g.members.length} {g.members.length === 1 ? "member" : "members"}</p>
                </div>
              </div>
              <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lastActivity(g)}
              </p>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewGroupModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await load();
          }}
        />
      )}

      {managing && (
        <ManageGroupModal
          group={managing}
          contacts={contacts}
          onClose={() => setManaging(null)}
          onChanged={async () => {
            setManaging(null);
            await load();
          }}
          onOpenChat={(id) => router.push(`/admin/chats?c=${id}`)}
        />
      )}
    </section>
  );
}

function NewGroupModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: ChattableContact[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nameById = useMemo(() => new Map(contacts.map((c) => [c.id, c.full_name])), [contacts]);
  const placeholder = useMemo(
    () => suggestGroupTitle([...selected].map((id) => nameById.get(id) ?? "").filter(Boolean)),
    [selected, nameById],
  );

  const create = async () => {
    setError(null);
    if (selected.size === 0) {
      setError("Add at least one person.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [...selected], title: name.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the group.");
      return;
    }
    await onCreated();
  };

  return (
    <Modal title="New group" description="Pick who's in the chat. You create it but aren't a member." onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input
          placeholder={selected.size > 0 ? placeholder : "Group name (optional)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <p className="text-xs text-muted">{selected.size} selected</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={creating || selected.size === 0}>
              {creating ? "Creating…" : "Create group"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ManageGroupModal({
  group,
  contacts,
  onClose,
  onChanged,
  onOpenChat,
}: {
  group: ConversationSummary;
  contacts: ChattableContact[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onOpenChat: (id: string) => void;
}) {
  const [name, setName] = useState(group.title);
  const [selected, setSelected] = useState<Set<string>>(new Set(group.members.map((m) => m.id)));
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
    if (selected.size === 0) {
      setError("A group needs at least one person.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/groups/${group.id}`, {
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
    const res = await fetch(`/api/admin/groups/${group.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not archive the group.");
      return;
    }
    await onChanged();
  };

  if (confirmArchive) {
    return (
      <Modal
        title="Archive group?"
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
    <Modal title="Manage group" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Button variant="outline" onClick={() => onOpenChat(group.id)} style={{ justifyContent: "center" }}>
            <MessageSquare size={15} style={{ marginRight: "6px" }} /> Open chat
          </Button>
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
      </div>
    </Modal>
  );
}
