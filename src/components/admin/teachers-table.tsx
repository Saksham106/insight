"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Teacher {
  id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

interface TeachersTableProps {
  teachers: Teacher[];
}

export function TeachersTable({ teachers }: TeachersTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleUser = async (teacher: Teacher) => {
    setStatus(null);
    setLoadingId(teacher.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: teacher.id, isActive: !teacher.is_active }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Failed to update user.");
      setLoadingId(null);
      return;
    }

    setStatus("Updated user status.");
    setLoadingId(null);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map((teacher) => (
            <TableRow key={teacher.id}>
              <TableCell className="font-medium">{teacher.full_name}</TableCell>
              <TableCell>
                <Badge variant={teacher.is_active ? "default" : "gold"}>
                  {teacher.is_active ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              {!isMobile && (
                <TableCell>
                  {new Date(teacher.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleUser(teacher)}
                  disabled={loadingId === teacher.id}
                >
                  {teacher.is_active ? "Disable" : "Enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
