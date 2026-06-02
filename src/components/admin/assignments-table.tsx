import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
}

interface AssignmentsTableProps {
  assignments: AssignmentRow[];
}

export function AssignmentsTable({ assignments }: AssignmentsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Teacher</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Conversation</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => {
          const conversationId = assignment.conversation?.[0]?.id;
          return (
            <TableRow key={assignment.id}>
              <TableCell>{assignment.teacher?.full_name ?? "-"}</TableCell>
              <TableCell>{assignment.student?.full_name ?? "-"}</TableCell>
              <TableCell>
                {conversationId ? (
                  <Link
                    href={`/admin/conversations/${conversationId}`}
                    className="text-sm font-medium text-slate"
                  >
                    View
                  </Link>
                ) : (
                  <Badge variant="gold">Pending</Badge>
                )}
              </TableCell>
              <TableCell>
                {new Date(assignment.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
