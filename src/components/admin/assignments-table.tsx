"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";

import { ChatDrawer } from "@/components/chat/chat-drawer";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AssignmentRow {
  id: string;
  created_at: string;
  is_active: boolean;
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
}

interface AssignmentsTableProps {
  assignments: AssignmentRow[];
}

export function AssignmentsTable({ assignments }: AssignmentsTableProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [selected, setSelected] = useState<AssignmentRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatContactName, setChatContactName] = useState("");
  const [chatTeacherId, setChatTeacherId] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const closeModal = () => {
    setSelected(null);
    setConfirmDelete(false);
    setError(null);
  };

  const handleToggleActive = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/assignment/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !selected.is_active }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed to update."); return; }
    closeModal();
    router.refresh();
  };

  const handleDelete = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/assignment/${selected.id}`, { method: "DELETE" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed to delete."); return; }
    closeModal();
    router.refresh();
  };

  const teacherName = selected?.teacher?.full_name ?? "Teacher";
  const studentName = selected?.student?.full_name ?? "Student";

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Teacher</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Conversation</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.length === 0 && (
            <tr><td colSpan={isMobile ? 3 : 4} style={{ padding: "0", paddingTop: "8px" }}>
              <EmptyState icon={Unlink} title="No assignments yet" description="Assign a student to a teacher to get started." />
            </td></tr>
          )}
          {assignments.map((assignment) => {
            const conversationId = assignment.conversation?.[0]?.id;
            return (
              <TableRow
                key={assignment.id}
                onClick={() => { setSelected(assignment); setConfirmDelete(false); setError(null); }}
                style={{
                  cursor: "pointer",
                  opacity: assignment.is_active ? 1 : 0.4,
                }}
              >
                  <TableCell className="font-medium">
                    {assignment.teacher?.full_name ?? "-"}
                  </TableCell>
                  <TableCell>{assignment.student?.full_name ?? "-"}</TableCell>
                  <TableCell>
                    {conversationId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatConversationId(conversationId);
                          setChatTeacherId(assignment.teacher?.id ?? "");
                          setChatContactName(`${assignment.teacher?.full_name ?? "Teacher"} & ${assignment.student?.full_name ?? "Student"}`);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 12px",
                          borderRadius: "9999px",
                          border: "1px solid var(--color-navy)",
                          color: "var(--color-navy)",
                          fontSize: "13px",
                          fontWeight: 500,
                          background: "none",
                          cursor: "pointer",
                        }}
                      >
                        <MessageCircle size={13} />
                        View
                      </button>
                    ) : (
                      <Badge variant="gold">Pending</Badge>
                    )}
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      {new Date(assignment.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                  )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Actions modal */}
      {selected && !confirmDelete && (
        <Modal
          title={`${teacherName} & ${studentName}`}
          description={selected.is_active ? "This assignment is currently active." : "This assignment is currently disabled."}
          onClose={closeModal}
        >
          {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Button
              variant="outline"
              disabled={loading}
              onClick={handleToggleActive}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {selected.is_active ? "Disable assignment" : "Enable assignment"}
            </Button>
            <Button
              disabled={loading}
              onClick={() => setConfirmDelete(true)}
              style={{ width: "100%", justifyContent: "center", backgroundColor: "var(--color-error)", border: "none" }}
            >
              Delete assignment
            </Button>
          </div>
        </Modal>
      )}

      {/* Confirm delete modal */}
      {selected && confirmDelete && (
        <Modal
          title="Delete assignment?"
          description={`This will permanently remove the pairing between ${teacherName} and ${studentName}. This cannot be undone.`}
          onClose={closeModal}
        >
          {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Button variant="outline" disabled={loading} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              disabled={loading}
              onClick={handleDelete}
              style={{ backgroundColor: "var(--color-error)", border: "none" }}
            >
              {loading ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        </Modal>
      )}

      {chatConversationId && (
        <ChatDrawer
          contacts={[{ conversationId: chatConversationId, name: chatContactName }]}
          initialConversationId={chatConversationId}
          currentUserId={chatTeacherId}
          readOnly
          adminView
          onClose={() => { setChatConversationId(null); setChatTeacherId(""); }}
        />
      )}
    </>
  );
}
