import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type AgentEvaluationClaims = {
  requestId: string;
  actorKey: string;
  capabilityName: string;
  capabilityVersion: number;
  inputDigest: string;
  relevantVersions: Record<string, string>;
  policyVersion: string;
  issuedAt: number;
  expiresAt: number;
};

const MAX_LIFETIME_MS = 5 * 60_000;

function validateSecret(secret: string) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("invalid_evaluation_secret");
}

function validateClaims(value: unknown): asserts value is AgentEvaluationClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_evaluation_token");
  const claims = value as Record<string, unknown>;
  const keys = ["requestId", "actorKey", "capabilityName", "capabilityVersion", "inputDigest", "relevantVersions", "policyVersion", "issuedAt", "expiresAt"];
  if (Object.keys(claims).some((key) => !keys.includes(key)) || keys.some((key) => !(key in claims))) throw new Error("invalid_evaluation_token");
  if (![claims.requestId, claims.actorKey, claims.capabilityName, claims.policyVersion].every((item) => typeof item === "string" && item.length > 0)) throw new Error("invalid_evaluation_token");
  if (!Number.isInteger(claims.capabilityVersion) || Number(claims.capabilityVersion) < 1) throw new Error("invalid_evaluation_token");
  if (typeof claims.inputDigest !== "string" || !/^[a-f0-9]{64}$/.test(claims.inputDigest)) throw new Error("invalid_evaluation_token");
  if (!claims.relevantVersions || typeof claims.relevantVersions !== "object" || Array.isArray(claims.relevantVersions)
    || Object.values(claims.relevantVersions).some((item) => typeof item !== "string")) throw new Error("invalid_evaluation_token");
  if (!Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt)) throw new Error("invalid_evaluation_token");
}

function validateLifetime(claims: AgentEvaluationClaims) {
  if (claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > MAX_LIFETIME_MS) {
    throw new Error("invalid_evaluation_lifetime");
  }
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueEvaluationToken(claims: AgentEvaluationClaims, secret: string) {
  validateSecret(secret);
  validateClaims(claims);
  validateLifetime(claims);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyEvaluationToken(token: string, secret: string, now = Date.now()): AgentEvaluationClaims {
  validateSecret(secret);
  if (typeof token !== "string" || token.length > 8_000) throw new Error("invalid_evaluation_token");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("invalid_evaluation_token");
  const expected = Buffer.from(signature(parts[0], secret));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("invalid_evaluation_token");
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid_evaluation_token");
  }
  validateClaims(claims);
  try {
    validateLifetime(claims);
  } catch {
    throw new Error("invalid_evaluation_token");
  }
  if (!Number.isFinite(now) || now > claims.expiresAt) throw new Error("expired_evaluation_token");
  return claims;
}

export function hashEvaluationToken(token: string) {
  if (typeof token !== "string" || !token) throw new Error("invalid_evaluation_token");
  return createHash("sha256").update(token).digest("hex");
}
