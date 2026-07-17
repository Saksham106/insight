import { NextResponse } from "next/server";

import { verifyServiceRequest } from "@/lib/hermes/auth";
import { parseWorkerRequest, projectClaimedJob } from "@/lib/hermes/workspace-worker";
import { createAdminClient } from "@/lib/supabase/admin";

function failure(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (process.env.HERMES_WORKSPACE_JOBS_ENABLED !== "true") return failure("Not found", 404);
  const rawBody = await request.text();
  const secret = process.env.HERMES_WORKSPACE_WORKER_SECRET;
  const auth = secret ? verifyServiceRequest(request, rawBody, secret) : null;
  if (!auth) return failure("Unauthorized", 401);

  let parsed;
  try {
    parsed = parseWorkerRequest(JSON.parse(rawBody));
  } catch {
    return failure("Invalid worker request");
  }

  const supabase = createAdminClient();
  const { error: replayError } = await supabase.from("hermes_audit_events").insert({
    actor_type: "system",
    event_type: "workspace_worker_request",
    entity_type: "workspace_job",
    request_id: auth.requestId,
    metadata: { action: parsed.action, workerId: parsed.payload.workerId },
  });
  if (replayError) return failure(replayError.code === "23505" ? "Replay rejected" : "Audit unavailable", replayError.code === "23505" ? 409 : 503);

  if (parsed.action === "claim") {
    const { data, error } = await supabase.rpc("claim_hermes_workspace_jobs", {
      p_worker_id: parsed.payload.workerId,
      p_limit: parsed.payload.limit,
    });
    if (error) return failure("Workspace queue unavailable", 503);
    try {
      return NextResponse.json({ jobs: (data ?? []).map(projectClaimedJob) });
    } catch {
      return failure("Invalid queued job", 503);
    }
  }

  if (parsed.action === "status") {
    const statuses = ["queued", "leased", "retryable_failed"] as const;
    const counts = await Promise.all(statuses.map(async (status) => {
      const { count, error } = await supabase.from("hermes_workspace_jobs").select("id", { count: "exact", head: true }).eq("status", status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    })).catch(() => null);
    if (!counts) return failure("Workspace queue unavailable", 503);
    const { data: oldest, error } = await supabase
      .from("hermes_workspace_jobs")
      .select("created_at")
      .in("status", ["queued", "retryable_failed"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return failure("Workspace queue unavailable", 503);
    return NextResponse.json({ queue: { counts: Object.fromEntries(counts), oldestQueuedAt: oldest?.created_at ?? null } });
  }

  const result = parsed.payload.status === "succeeded" ? parsed.payload.result : null;
  const errorCode = parsed.payload.status === "succeeded" ? null : parsed.payload.errorCode;
  const { data, error } = await supabase.rpc("complete_hermes_workspace_job", {
    p_job_id: parsed.payload.jobId,
    p_worker_id: parsed.payload.workerId,
    p_job_type: parsed.payload.jobType,
    p_status: parsed.payload.status,
    p_result: result,
    p_error_code: errorCode,
  });
  if (error || !data) return failure("Workspace job completion rejected", 409);
  return NextResponse.json({ job: { id: parsed.payload.jobId, status: data.status } });
}
