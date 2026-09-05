import { createHash, randomUUID } from "node:crypto";

import { listCapabilityManifests } from "./agent-capabilities";
import {
  hashEvaluationToken,
  issueEvaluationToken,
  verifyEvaluationToken,
  type AgentEvaluationClaims,
} from "./agent-evaluation-token";
import { evaluateAgentAction } from "./agent-policy";
import type {
  AgentActionDecision,
  AgentActor,
  AgentPolicyRepository,
} from "./agent-capability-types";

export type AgentActionRow = {
  id: string;
  actorKey: string;
  clientRequestId: string;
  capabilityName: string;
  capabilityVersion: number;
  inputDigest: string;
  normalizedInput: Record<string, unknown> | null;
  relevantVersions: Record<string, string>;
  policyVersion: string;
  decision: AgentActionDecision;
  tokenHash: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
  executionStatus: "not_executable" | "pending" | "executing" | "completed" | "failed";
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
};

export type AgentActionStore = {
  findByActorRequest(actorKey: string, clientRequestId: string): Promise<AgentActionRow | null>;
  findById(id: string): Promise<AgentActionRow | null>;
  insert(row: AgentActionRow): Promise<AgentActionRow>;
  claim(id: string): Promise<AgentActionRow | null>;
  complete(id: string, result: Record<string, unknown>): Promise<AgentActionRow>;
  fail(id: string, errorCode: string): Promise<AgentActionRow>;
  retry(id: string, errorCode: string): Promise<AgentActionRow>;
  renewEvaluation(
    id: string,
    expectedStatus: AgentActionRow["executionStatus"],
    resetExecution: boolean,
    issuedAt: number,
    expiresAt: number,
    tokenHash: string,
  ): Promise<AgentActionRow>;
};

export type AgentActionProposal = {
  capabilityName: string;
  capabilityVersion: number;
  proposedInput: unknown;
  clientRequestId: string;
};

export type AgentCapabilityExecutor = (input: {
  actor: AgentActor;
  capabilityName: string;
  capabilityVersion: number;
  normalizedInput: Record<string, unknown>;
  clientRequestId: string;
}) => Promise<Record<string, unknown>>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function agentActorKey(actor: AgentActor) {
  return actor.kind === "contact" ? `contact:${actor.contactId}` : `admin:${actor.profileId ?? "primary"}`;
}

function validRequestId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\r\n]/.test(value)) throw new Error("invalid_client_request_id");
  return value.trim();
}

function claimsForRow(row: AgentActionRow): AgentEvaluationClaims {
  if (row.issuedAt === null || row.expiresAt === null) throw new Error("action_not_executable");
  return {
    requestId: row.id,
    actorKey: row.actorKey,
    capabilityName: row.capabilityName,
    capabilityVersion: row.capabilityVersion,
    inputDigest: row.inputDigest,
    relevantVersions: row.relevantVersions,
    policyVersion: row.policyVersion,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
  };
}

export function listAgentCapabilities(actor: AgentActor) {
  return listCapabilityManifests(actor.kind);
}

export async function evaluateAction(
  store: AgentActionStore,
  repository: AgentPolicyRepository,
  actor: AgentActor,
  proposal: AgentActionProposal,
  options: { secret: string; now?: number },
) {
  const clientRequestId = validRequestId(proposal.clientRequestId);
  const actorKey = agentActorKey(actor);
  const now = options.now ?? Date.now();
  const inputDigest = digest({
    capabilityName: proposal.capabilityName,
    capabilityVersion: proposal.capabilityVersion,
    proposedInput: proposal.proposedInput,
  });
  const existing = await store.findByActorRequest(actorKey, clientRequestId);
  if (existing) {
    if (existing.inputDigest !== inputDigest) throw new Error("client_request_payload_mismatch");
    const canRenew = existing.decision.kind === "allowed"
      && existing.expiresAt !== null
      && existing.expiresAt <= now
      && ((existing.executionStatus === "completed" && Boolean(existing.result))
        || existing.executionStatus === "executing"
        || (existing.executionStatus === "pending" && existing.errorCode === "capability_execution_uncertain"));
    if (canRenew) {
      const resetExecution = existing.executionStatus !== "completed";
      const refreshed = {
        ...existing,
        issuedAt: now,
        expiresAt: now + 5 * 60_000,
        executionStatus: resetExecution ? "pending" as const : existing.executionStatus,
        errorCode: resetExecution ? "capability_execution_uncertain" : existing.errorCode,
      };
      const evaluationToken = issueEvaluationToken(claimsForRow(refreshed), options.secret);
      refreshed.tokenHash = hashEvaluationToken(evaluationToken);
      await store.renewEvaluation(
        refreshed.id, existing.executionStatus, resetExecution,
        refreshed.issuedAt, refreshed.expiresAt, refreshed.tokenHash,
      );
      return { decision: refreshed.decision, evaluationToken, duplicate: true };
    }
    const evaluationToken = existing.decision.kind === "allowed"
      ? issueEvaluationToken(claimsForRow(existing), options.secret)
      : undefined;
    return { decision: existing.decision, evaluationToken, duplicate: true };
  }

  const decision = await evaluateAgentAction({
    actor,
    capabilityName: proposal.capabilityName,
    capabilityVersion: proposal.capabilityVersion,
    proposedInput: proposal.proposedInput,
    repository,
  });
  const row: AgentActionRow = {
    id: randomUUID(), actorKey, clientRequestId,
    capabilityName: proposal.capabilityName,
    capabilityVersion: proposal.capabilityVersion,
    inputDigest,
    normalizedInput: "normalizedInput" in decision ? decision.normalizedInput : null,
    relevantVersions: "relevantVersions" in decision ? decision.relevantVersions : {},
    policyVersion: "1",
    decision,
    tokenHash: null,
    issuedAt: decision.kind === "allowed" ? now : null,
    expiresAt: decision.kind === "allowed" ? now + 5 * 60_000 : null,
    executionStatus: decision.kind === "allowed" ? "pending" : "not_executable",
  };
  let evaluationToken: string | undefined;
  if (decision.kind === "allowed") {
    evaluationToken = issueEvaluationToken(claimsForRow(row), options.secret);
    row.tokenHash = hashEvaluationToken(evaluationToken);
  }
  await store.insert(row);
  return { decision, evaluationToken, duplicate: false };
}

function boundedResult(value: Record<string, unknown>) {
  const serialized = JSON.stringify(value);
  if (serialized.length > 20_000) throw new Error("action_result_too_large");
  return JSON.parse(serialized) as Record<string, unknown>;
}

export function feeStatementLookupErrorStatus(code: string) {
  if (code === "fee_statement_not_found") return 404;
  if (["fee_statement_lookup_ambiguous", "fee_statement_link_unrecoverable"].includes(code)) return 409;
  return null;
}

function hasEphemeralResult(capabilityName: string) {
  return capabilityName.startsWith("fee_statement.");
}

function stripFeeStatementBearerFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFeeStatementBearerFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "publicUrl" && key !== "whatsappMessage")
      .map(([key, item]) => [key, stripFeeStatementBearerFields(item)]),
  );
}

function resultForPersistence(capabilityName: string, result: Record<string, unknown>) {
  if (!hasEphemeralResult(capabilityName)) return result;
  return stripFeeStatementBearerFields(result) as Record<string, unknown>;
}

async function replayCompletedResult(
  row: AgentActionRow,
  actor: AgentActor,
  execute: AgentCapabilityExecutor,
) {
  if (!hasEphemeralResult(row.capabilityName) && row.result) {
    return { result: row.result, duplicate: true };
  }
  const normalizedInput = row.capabilityName === "fee_statement.lookup" && row.result?.statementId
    ? { ...(row.normalizedInput ?? {}), statementId: row.result.statementId }
    : (row.normalizedInput ?? {});
  const result = boundedResult(await execute({
    actor,
    capabilityName: row.capabilityName,
    capabilityVersion: row.capabilityVersion,
    normalizedInput,
    clientRequestId: row.clientRequestId,
  }));
  return { result, duplicate: true };
}

export async function executeEvaluatedAction(
  store: AgentActionStore,
  actor: AgentActor,
  request: { evaluationToken: string; clientRequestId: string },
  options: { secret: string; execute: AgentCapabilityExecutor; now?: number },
) {
  const claims = verifyEvaluationToken(request.evaluationToken, options.secret, options.now ?? Date.now());
  if (claims.actorKey !== agentActorKey(actor)) throw new Error("evaluation_actor_mismatch");
  const row = await store.findById(claims.requestId);
  if (!row || row.clientRequestId !== validRequestId(request.clientRequestId)) throw new Error("evaluation_not_found");
  if (row.actorKey !== claims.actorKey || row.inputDigest !== claims.inputDigest
    || row.capabilityName !== claims.capabilityName || row.capabilityVersion !== claims.capabilityVersion
    || row.policyVersion !== claims.policyVersion || canonical(row.relevantVersions) !== canonical(claims.relevantVersions)
    || row.tokenHash !== hashEvaluationToken(request.evaluationToken)) throw new Error("invalid_evaluation_token");
  if (row.executionStatus === "completed" && row.result) {
    return replayCompletedResult(row, actor, options.execute);
  }
  if (row.executionStatus === "failed") throw new Error(row.errorCode ?? "action_execution_failed");
  const claimed = await store.claim(row.id);
  if (!claimed) {
    const current = await store.findById(row.id);
    if (current?.executionStatus === "completed" && current.result) {
      return replayCompletedResult(current, actor, options.execute);
    }
    throw new Error("action_execution_in_progress");
  }
  let result: Record<string, unknown>;
  try {
    result = boundedResult(await options.execute({
      actor,
      capabilityName: row.capabilityName,
      capabilityVersion: row.capabilityVersion,
      normalizedInput: row.normalizedInput ?? {},
      clientRequestId: row.clientRequestId,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "capability_execution_uncertain") {
      await store.retry(row.id, "capability_execution_uncertain");
      throw new Error("action_execution_retryable");
    }
    const code = error instanceof Error ? error.message : "action_execution_failed";
    const safeCode = feeStatementLookupErrorStatus(code) ? code : "action_execution_failed";
    await store.fail(row.id, safeCode);
    throw new Error(safeCode);
  }
  try {
    await store.complete(row.id, resultForPersistence(row.capabilityName, result));
  } catch {
    try { await store.retry(row.id, "capability_execution_uncertain"); } catch { /* renewed after the execution lease expires */ }
    throw new Error("action_execution_retryable");
  }
  return { result, duplicate: false };
}
