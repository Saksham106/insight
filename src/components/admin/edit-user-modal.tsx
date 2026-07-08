"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

export interface LabelOption {
  id: string;
  name: string;
  color: string | null;
}

export interface UserOption {
  id: string;
  full_name: string;
}

interface EditUserModalProps {
  user: { id: string; full_name: string };
  role: "teacher" | "student" | "parent";
  // Teacher: manage labels.
  allLabels?: LabelOption[];
  initialLabelIds?: string[];
  // Parent: manage linked children. Student: manage linked parents.
  relationTitle?: string;
  relationOptions?: UserOption[];
  initialRelationIds?: string[];
  onClose: () => void;
}

export function EditUserModal({
  user,
  role,
  allLabels = [],
  initialLabelIds = [],
  relationTitle,
  relationOptions = [],
  initialRelationIds = [],
  onClose,
}: EditUserModalProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.full_name);
  const [labels, setLabels] = useState<LabelOption[]>(allLabels);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set(initialLabelIds));
  const [selectedRelationIds, setSelectedRelationIds] = useState<Set<string>>(new Set(initialRelationIds));
  const [newLabelName, setNewLabelName] = useState("");
  const [relationSearch, setRelationSearch] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showLabels = role === "teacher";
  const showRelations = role === "parent" || role === "student";

  const filteredRelations = useMemo(() => {
    const q = relationSearch.trim().toLowerCase();
    if (!q) return relationOptions;
    return relationOptions.filter((o) => o.full_name.toLowerCase().includes(q));
  }, [relationOptions, relationSearch]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const handleCreateLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    setCreatingLabel(true);
    setError(null);

    const res = await fetch("/api/admin/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCreatingLabel(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to create label.");
      return;
    }

    const label = data.label as LabelOption;
    setLabels((prev) => (prev.some((l) => l.id === label.id) ? prev : [...prev, label]));
    setSelectedLabelIds((prev) => new Set(prev).add(label.id));
    setNewLabelName("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = { userId: user.id, role, fullName };
    if (showLabels) payload.labelIds = [...selectedLabelIds];
    if (role === "parent") payload.studentIds = [...selectedRelationIds];
    if (role === "student") payload.parentIds = [...selectedRelationIds];

    const res = await fetch("/api/admin/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to save changes.");
      return;
    }

    onClose();
    router.refresh();
  };

  return (
    <Modal title="Edit user" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="edit-full-name">Full name</Label>
          <Input
            id="edit-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        {showLabels && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label>Labels</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {labels.length === 0 && <p className="text-sm text-muted">No labels yet — create one below.</p>}
              {labels.map((label) => {
                const selected = selectedLabelIds.has(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => setSelectedLabelIds((prev) => toggle(prev, label.id))}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      borderRadius: "9999px",
                      border: `1px solid ${selected ? "var(--color-navy)" : "var(--color-border)"}`,
                      backgroundColor: selected ? "var(--color-navy)" : "var(--color-surface)",
                      color: selected ? "#ffffff" : "var(--color-foreground)",
                      padding: "5px 12px",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {selected && <Check size={13} />}
                    {label.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <Input
                placeholder="New label name"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateLabel();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCreateLabel}
                disabled={creatingLabel || !newLabelName.trim()}
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}
              >
                <Plus size={14} />
                Add
              </Button>
            </div>
          </div>
        )}

        {showRelations && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label>{relationTitle ?? "Linked accounts"}</Label>
            <Input
              placeholder="Search…"
              value={relationSearch}
              onChange={(e) => setRelationSearch(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxHeight: "200px",
                overflowY: "auto",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
              }}
            >
              {filteredRelations.length === 0 ? (
                <p className="text-sm text-muted" style={{ padding: "12px 14px" }}>No matches.</p>
              ) : (
                filteredRelations.map((option) => {
                  const selected = selectedRelationIds.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedRelationIds((prev) => toggle(prev, option.id))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        padding: "10px 14px",
                        background: "none",
                        border: "none",
                        borderBottom: "1px solid var(--color-border)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "14px",
                        color: "var(--color-foreground)",
                      }}
                    >
                      <span>{option.full_name}</span>
                      {selected && <Check size={15} color="var(--color-navy)" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button type="button" variant="outline" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <X size={14} />
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !fullName.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
