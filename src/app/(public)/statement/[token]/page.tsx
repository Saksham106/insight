import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeeStatementReceipt } from "@/components/fee-statement/fee-statement-receipt";
import { loadPublicFeeStatement } from "@/lib/hermes/fee-statement-public";
import { projectPublicFeeStatement, type PublicFeeStatement } from "@/lib/hermes/fee-statements";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fee statement · MyInsightAcademy",
  description: "A private fee statement from MyInsightAcademy.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

function developmentFixture(token: string): PublicFeeStatement | null {
  if (process.env.NODE_ENV === "production" || token !== process.env.FEE_STATEMENT_DEV_TOKEN || !process.env.FEE_STATEMENT_DEV_FIXTURE) return null;
  try {
    return projectPublicFeeStatement(JSON.parse(process.env.FEE_STATEMENT_DEV_FIXTURE) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export default async function FeeStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let statement = developmentFixture(token);
  if (!statement) {
    try {
      statement = await loadPublicFeeStatement(token, createAdminClient());
    } catch {
      notFound();
    }
  }
  if (!statement) notFound();
  return <FeeStatementReceipt statement={statement} />;
}
