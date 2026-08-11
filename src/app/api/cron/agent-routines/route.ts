import { NextResponse } from "next/server";

import { evaluateAction, executeEvaluatedAction } from "@/lib/hermes/agent-actions";
import { executeAgentCapability } from "@/lib/hermes/agent-capability-executor";
import type { AgentActor } from "@/lib/hermes/agent-capability-types";
import { runDueAgentRoutines } from "@/lib/hermes/agent-routines";
import { createSupabaseAgentActionStore, createSupabaseAgentPolicyRepository } from "@/lib/hermes/agent-supabase";
import { deliverPendingKittyClassNotifications } from "@/lib/hermes/kitty-class-delivery";
import { createAdminClient } from "@/lib/supabase/admin";

async function run(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hermesSecret = process.env.HERMES_TOOL_SHARED_SECRET;
  if ((!cronSecret || authorization !== `Bearer ${cronSecret}`) && (!hermesSecret || authorization !== `Bearer ${hermesSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const evaluationSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  if (!evaluationSecret) return NextResponse.json({ error: "Capability service unavailable" }, { status: 503 });

  const client = createAdminClient();
  const actor: AgentActor = { kind: "admin", profileId: null, channel: "dashboard" };
  const store = createSupabaseAgentActionStore(client, actor.channel);
  const repository = createSupabaseAgentPolicyRepository(client);
  const routines = await runDueAgentRoutines(client, async (proposal) => {
    const evaluated = await evaluateAction(store, repository, actor, proposal, { secret: evaluationSecret });
    if (evaluated.decision.kind !== "allowed" || !evaluated.evaluationToken) throw new Error("routine_action_not_allowed");
    await executeEvaluatedAction(store, actor, { evaluationToken: evaluated.evaluationToken, clientRequestId: proposal.clientRequestId }, {
      secret: evaluationSecret,
      execute: (action) => executeAgentCapability(client, action.actor, action),
    });
  });
  const delivery = await deliverPendingKittyClassNotifications(client, request.url, 100);
  return NextResponse.json({ ...routines, notificationsSent: delivery.sent, notificationsFailed: delivery.failed, notificationsBlocked: delivery.blocked });
}

export const GET = run;
export const POST = run;
