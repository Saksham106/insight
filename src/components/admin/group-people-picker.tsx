"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ChattableContact } from "@/lib/chat-types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type RoleFilter = "all" | "teacher" | "student" | "parent";

const ROLE_TABS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "teacher", label: "Teachers" },
  { key: "student", label: "Students" },
  { key: "parent", label: "Parents" },
];

interface GroupPeoplePickerProps {
  contacts: ChattableContact[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

// Controlled people picker: search + role filter + removable chips of the
// current selection. Presentational — selection state lives in the parent.
export function GroupPeoplePicker({ contacts, selected, onToggle }: GroupPeoplePickerProps) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");

  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (role !== "all" && c.role !== role) return false;
      if (q && !c.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contacts, role, search]);

  const selectedContacts = [...selected].map((id) => byId.get(id)).filter(Boolean) as ChattableContact[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {selectedContacts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {selectedContacts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px 4px 10px",
                borderRadius: "9999px",
                border: "1px solid var(--color-navy)",
                background: "var(--color-accent-soft)",
                color: "var(--color-navy)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {c.full_name.split(" ")[0]}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
        <Input
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: "30px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {ROLE_TABS.map((tab) => {
          const active = role === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRole(tab.key)}
              style={{
                padding: "5px 12px",
                borderRadius: "9999px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--color-navy)" : "var(--color-border)"}`,
                background: active ? "var(--color-navy)" : "transparent",
                color: active ? "#fff" : "var(--color-muted)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted" style={{ padding: "8px" }}>No people found.</p>
        ) : (
          filtered.map((c) => {
            const checked = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: checked ? "var(--color-soft)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--color-accent-soft)",
                    color: "var(--color-navy)",
                    fontWeight: 700,
                    fontSize: "12px",
                    flexShrink: 0,
                  }}
                >
                  {initials(c.full_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-sm font-medium text-navy" style={{ margin: 0 }}>{c.full_name}</p>
                  <p className="text-xs text-muted" style={{ margin: 0, textTransform: "capitalize" }}>{c.role}</p>
                </div>
                <span
                  aria-hidden
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "5px",
                    border: `2px solid ${checked ? "var(--color-navy)" : "var(--color-border)"}`,
                    background: checked ? "var(--color-navy)" : "transparent",
                    flexShrink: 0,
                  }}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
