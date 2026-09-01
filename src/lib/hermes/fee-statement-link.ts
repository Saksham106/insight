import { createHash, createHmac } from "node:crypto";

interface FeeStatementLinkConfig {
  secret?: string;
  appUrl?: string;
}

function feeStatementToken(clientRequestId: string, secret: string) {
  if (!clientRequestId || !secret || secret.length < 32) {
    throw new Error("capability_execution_unavailable");
  }
  return createHmac("sha256", secret)
    .update(`fee-statement:v1:${clientRequestId}`, "utf8")
    .digest()
    .subarray(0, 24)
    .toString("base64url");
}

function feeStatementAppOrigin(configured: string | undefined) {
  if (!configured) throw new Error("capability_execution_unavailable");
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("unsafe_statement_origin");
    }
    return url.origin;
  } catch {
    throw new Error("capability_execution_unavailable");
  }
}

export function feeStatementTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function feeStatementPublicUrl(
  clientRequestId: string,
  config: FeeStatementLinkConfig = {},
) {
  const token = feeStatementToken(
    clientRequestId,
    config.secret ?? process.env.ACADEMY_AGENT_EVALUATION_SECRET ?? "",
  );
  const origin = feeStatementAppOrigin(
    config.appUrl ?? process.env.NEXT_PUBLIC_APP_URL,
  );
  return {
    token,
    tokenHash: feeStatementTokenHash(token),
    url: `${origin}/statement/${token}`,
  };
}
