"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTeacherForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        role: "teacher",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setIsError(true);
      setStatus(data.error ?? "Failed to invite teacher.");
      setLoading(false);
      return;
    }

    setIsError(false);
    setStatus("Invite sent.");
    setFullName("");
    setEmail("");
    setLoading(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite teacher</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="teacher-name">Full name</Label>
            <Input
              id="teacher-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="teacher-email">Email</Label>
            <Input
              id="teacher-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {status ? <p className={`text-sm ${isError ? "text-error" : "text-success"}`}>{status}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
