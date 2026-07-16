import { parseFreeBusyPayload, parseFreeBusyResult } from "./workspace-jobs";
import type { FreeBusyPayload, FreeBusyResult } from "./workspace-jobs";

type JsonObject = Record<string, unknown>;

export type WorkerRequest =
  | { action: "claim"; payload: { workerId: string; limit: number } }
  | { action: "complete"; payload: { workerId: string; jobId: string; status: "succeeded"; result: FreeBusyResult } }
  | { action: "complete"; payload: { workerId: string; jobId: string; status: "retryable_failed" | "permanent_failed"; errorCode: string } };

export interface ClaimedWorkspaceJob {
  id: string;
  caseId: string;
  jobType: "calendar_freebusy";
  payload: FreeBusyPayload;
  attemptCount: number;
  leaseExpiresAt: string;
}

function objectValue(input: unknown, error = "invalid_worker_request"): JsonObject {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(error);
  return input as JsonObject;
}

function exactFields(value: JsonObject, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("unexpected_field");
}

function workerIdValue(input: unknown) {
  if (typeof input !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(input)) throw new Error("invalid_worker_id");
  return input;
}

function jobIdValue(input: unknown) {
  if (typeof input !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input)) {
    throw new Error("invalid_job_id");
  }
  return input;
}

export function parseWorkerRequest(input: unknown): WorkerRequest {
  const value = objectValue(input);
  exactFields(value, ["action", "payload"]);
  const payload = objectValue(value.payload, "invalid_worker_payload");
  if (value.action === "claim") {
    exactFields(payload, ["workerId", "limit"]);
    const limit = payload.limit === undefined ? 5 : payload.limit;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 10) throw new Error("invalid_claim_limit");
    return { action: "claim", payload: { workerId: workerIdValue(payload.workerId), limit: Number(limit) } };
  }
  if (value.action === "complete") {
    const status = payload.status;
    if (status === "succeeded") {
      exactFields(payload, ["workerId", "jobId", "status", "result"]);
      return { action: "complete", payload: {
        workerId: workerIdValue(payload.workerId),
        jobId: jobIdValue(payload.jobId),
        status,
        result: parseFreeBusyResult(payload.result),
      } };
    }
    if (status === "retryable_failed" || status === "permanent_failed") {
      exactFields(payload, ["workerId", "jobId", "status", "errorCode"]);
      if (typeof payload.errorCode !== "string" || !/^[a-z0-9_:-]{1,100}$/.test(payload.errorCode)) throw new Error("invalid_error_code");
      return { action: "complete", payload: {
        workerId: workerIdValue(payload.workerId),
        jobId: jobIdValue(payload.jobId),
        status,
        errorCode: payload.errorCode,
      } };
    }
    throw new Error("invalid_completion_status");
  }
  throw new Error("unsupported_worker_action");
}

export function projectClaimedJob(input: unknown): ClaimedWorkspaceJob {
  const value = objectValue(input, "invalid_claimed_job");
  if (value.job_type !== "calendar_freebusy") throw new Error("invalid_claimed_job_type");
  if (typeof value.case_id !== "string" || !value.case_id || value.case_id.length > 80) throw new Error("invalid_claimed_case");
  if (!Number.isInteger(value.attempt_count) || Number(value.attempt_count) < 1 || Number(value.attempt_count) > 10) throw new Error("invalid_claimed_attempt");
  const leaseExpiresAt = typeof value.lease_expires_at === "string" ? new Date(value.lease_expires_at) : new Date(Number.NaN);
  if (!Number.isFinite(leaseExpiresAt.getTime())) throw new Error("invalid_claimed_lease");
  return {
    id: jobIdValue(value.id),
    caseId: value.case_id,
    jobType: value.job_type,
    payload: parseFreeBusyPayload(value.payload),
    attemptCount: Number(value.attempt_count),
    leaseExpiresAt: leaseExpiresAt.toISOString(),
  };
}
