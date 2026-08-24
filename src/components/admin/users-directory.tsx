"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Pencil, Search, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { AdminUserCard } from "@/components/admin/admin-user-card";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { EditUserModal, type LabelOption, type UserOption } from "@/components/admin/edit-user-modal";
import { ReassignRoleButton } from "@/components/admin/reassign-role-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import { useMediaQuery } from "@/lib/use-media-query";
import type { Label, ProfileRow, TeacherRow } from "@/lib/dashboard-data";

type DirectoryRole = "teacher" | "student" | "parent";
type RoleFilter = "all" | DirectoryRole;

type DirectoryPerson = ProfileRow & {
  role: DirectoryRole;
  labels: Label[];
  relationIds: string[];
  relationNames: string[];
};

const roleConfig = {
  teacher: { singular: "Teacher", plural: "Teachers", icon: UserRound, tone: "var(--color-navy)" },
  student: { singular: "Student", plural: "Students", icon: GraduationCap, tone: "var(--color-success)" },
  parent: { singular: "Parent", plural: "Parents", icon: Users, tone: "var(--color-warning)" },
} satisfies Record<DirectoryRole, { singular: string; plural: string; icon: typeof UserRound; tone: string }>;

const filters: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "teacher", label: "Teachers" },
  { value: "student", label: "Students" },
  { value: "parent", label: "Parents" },
];

interface UsersDirectoryProps {
  teachers: TeacherRow[];
  students: (ProfileRow & { parentIds: string[] })[];
  parents: (ProfileRow & { childIds: string[] })[];
  allLabels: LabelOption[];
  studentOptions: UserOption[];
  parentOptions: UserOption[];
}

export function UsersDirectory({ teachers, students, parents, allLabels, studentOptions, parentOptions }: UsersDirectoryProps) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [editing, setEditing] = useState<DirectoryPerson | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const studentName = useMemo(() => new Map(studentOptions.map((person) => [person.id, person.full_name])), [studentOptions]);
  const parentName = useMemo(() => new Map(parentOptions.map((person) => [person.id, person.full_name])), [parentOptions]);

  const people = useMemo<DirectoryPerson[]>(() => [
    ...teachers.map((person) => ({ ...person, role: "teacher" as const, relationIds: [], relationNames: [] })),
    ...students.map((person) => ({
      ...person,
      role: "student" as const,
      labels: [],
      relationIds: person.parentIds,
      relationNames: person.parentIds.map((id) => parentName.get(id)).filter((name): name is string => Boolean(name)),
    })),
    ...parents.map((person) => ({
      ...person,
      role: "parent" as const,
      labels: [],
      relationIds: person.childIds,
      relationNames: person.childIds.map((id) => studentName.get(id)).filter((name): name is string => Boolean(name)),
    })),
  ].sort((a, b) => a.full_name.localeCompare(b.full_name)), [teachers, students, parents, parentName, studentName]);

  const visiblePeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return people.filter((person) => {
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      if (!normalized) return true;
      return [
        person.full_name,
        person.email,
        roleConfig[person.role].singular,
        ...person.labels.map((label) => label.name),
        ...person.relationNames,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [people, query, roleFilter]);

  const toggleUser = async (person: DirectoryPerson) => {
    setLoadingId(person.id);
    setStatus(null);
    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: person.id, isActive: !person.is_active }),
    });
    const result = await response.json().catch(() => ({}));
    setLoadingId(null);
    if (!response.ok) return setStatus((result as { error?: string }).error ?? "Could not update this person.");
    setStatus("User status updated.");
    router.refresh();
  };

  const resendCredentials = async (person: DirectoryPerson) => {
    setResendingId(person.id);
    setStatus(null);
    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: person.email, fullName: person.full_name, role: person.role, resend: true }),
    });
    const result = await response.json().catch(() => ({}));
    setResendingId(null);
    if (!response.ok) return setStatus((result as { error?: string }).error ?? "Could not resend credentials.");
    setStatus((result as { emailError?: string }).emailError
      ? `Password reset for ${person.full_name}, but the email failed to send.`
      : `Credentials resent to ${person.full_name}.`);
    router.refresh();
  };

  const actions = (person: DirectoryPerson) => {
    const onboarding = getOnboardingStatus(person);
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setEditing(person)} aria-label={`Edit ${person.full_name}`} style={{ padding: "0 10px" }}>
          <Pencil size={14} />
        </Button>
        <ReassignRoleButton user={{ id: person.id, full_name: person.full_name }} currentRole={person.role} />
        {onboarding.label === "Invite sent" && (
          <Button variant="outline" size="sm" onClick={() => void resendCredentials(person)} disabled={resendingId === person.id}>
            {resendingId === person.id ? "Resending…" : "Resend"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void toggleUser(person)} disabled={loadingId === person.id}>
          {person.is_active ? "Disable" : "Enable"}
        </Button>
        <DeleteUserButton userId={person.id} userName={person.full_name} onError={setStatus} onDeleted={setStatus} />
      </>
    );
  };

  const detail = (person: DirectoryPerson) => {
    if (person.role === "teacher") return person.labels.length ? person.labels.map((label) => label.name).join(", ") : "No labels";
    if (person.role === "student") return person.relationNames.length ? `Parents: ${person.relationNames.join(", ")}` : "No linked parents";
    return person.relationNames.length ? `Children: ${person.relationNames.join(", ")}` : "No linked children";
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "440px" }}>
          <Search size={16} aria-hidden="true" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <Input placeholder="Search people by name, email, label, or relation…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ paddingLeft: "38px", width: "100%" }} />
        </div>
        <div aria-label="Filter people by role" style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
          {filters.map((filter) => (
            <button key={filter.value} type="button" onClick={() => setRoleFilter(filter.value)} aria-pressed={roleFilter === filter.value} style={{ minHeight: "40px", padding: "0 13px", borderRadius: "9px", border: "1px solid var(--color-border)", background: roleFilter === filter.value ? "var(--color-navy)" : "var(--color-surface)", color: roleFilter === filter.value ? "white" : "var(--color-foreground)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>{filter.label}</button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted" style={{ margin: 0 }}>{visiblePeople.length} of {people.length} people</p>
      {status && <p className="text-sm text-muted" style={{ margin: 0 }}>{status}</p>}

      {visiblePeople.length === 0 ? (
        <EmptyState icon={Users} title="No people found" description="Try another name, role, label, or relationship." />
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visiblePeople.map((person) => {
            const config = roleConfig[person.role];
            const RoleIcon = config.icon;
            const onboarding = getOnboardingStatus(person);
            return (
              <AdminUserCard key={person.id} name={person.full_name} active={person.is_active} status={<Badge variant={onboarding.variant}>{onboarding.label}</Badge>} meta={<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: config.tone, fontSize: "12px", fontWeight: 700 }}><RoleIcon size={14} />{config.singular}</span><span className="text-xs text-muted">{detail(person)}</span></div>} actions={actions(person)} />
            );
          })}
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead>Details</TableHead><TableHead>Onboarding</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{visiblePeople.map((person) => {
            const config = roleConfig[person.role];
            const RoleIcon = config.icon;
            const onboarding = getOnboardingStatus(person);
            return <TableRow key={person.id} style={person.is_active ? undefined : { opacity: 0.55 }}><TableCell><p className="font-medium" style={{ margin: 0 }}>{person.full_name}</p><p className="text-xs text-muted" style={{ margin: "2px 0 0" }}>{person.email}</p></TableCell><TableCell><span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: config.tone, fontSize: "13px", fontWeight: 700 }}><RoleIcon size={15} />{config.singular}</span></TableCell><TableCell className="text-sm text-muted">{detail(person)}</TableCell><TableCell><Badge variant={onboarding.variant}>{onboarding.label}</Badge></TableCell><TableCell>{new Date(person.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell><TableCell><div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>{actions(person)}</div></TableCell></TableRow>;
          })}</TableBody>
        </Table>
      )}

      {editing && <EditUserModal user={{ id: editing.id, full_name: editing.full_name }} role={editing.role} allLabels={editing.role === "teacher" ? allLabels : undefined} initialLabelIds={editing.role === "teacher" ? editing.labels.map((label) => label.id) : undefined} relationTitle={editing.role === "student" ? "Linked parents" : editing.role === "parent" ? "Linked children" : undefined} relationOptions={editing.role === "student" ? parentOptions : editing.role === "parent" ? studentOptions : undefined} initialRelationIds={editing.role === "teacher" ? undefined : editing.relationIds} onClose={() => setEditing(null)} />}
    </section>
  );
}
