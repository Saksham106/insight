import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="bg-background" style={{ minHeight: "100vh" }}>
      <main
        className="px-6 py-16"
        style={{
          marginLeft: "auto",
          marginRight: "auto",
          width: "100%",
          maxWidth: "64rem",
          display: "flex",
          flexDirection: "column",
          gap: "40px",
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
            Insight Tutors
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-navy sm:text-5xl">
            Private communication for your tutoring program
          </h1>
          <p className="max-w-2xl text-base text-muted sm:text-lg">
            Keep every teacher-student conversation in one secure place. No phone
            numbers or email addresses are shared, and the agency stays in control.
          </p>
          <div>
            <Button asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
          {[
            {
              title: "Private messaging",
              description: "Real-time chat stays inside the platform.",
            },
            {
              title: "Teacher-student assignments",
              description: "Match every student with the right instructor.",
            },
            {
              title: "Admin oversight",
              description: "Owners can view every conversation and user.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle className="text-base text-navy">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted">
                {item.description}
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
