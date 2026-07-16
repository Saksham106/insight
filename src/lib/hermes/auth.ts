import { createHmac, timingSafeEqual } from "node:crypto";

export function signServiceRequest(body: string, timestamp: string, requestId: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${requestId}.${body}`).digest("hex");
}

export function verifyServiceRequest(request: Request, body: string, secret: string, now = Date.now()) {
  const timestamp = request.headers.get("x-hermes-timestamp") ?? "";
  const requestId = request.headers.get("x-hermes-request-id") ?? "";
  const supplied = request.headers.get("x-hermes-signature") ?? "";
  if (!/^\d{10,13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{8,128}$/.test(requestId) || !/^[a-f0-9]{64}$/i.test(supplied)) return null;
  const numeric = Number(timestamp);
  const timestampMs = timestamp.length === 10 ? numeric * 1000 : numeric;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) return null;
  const expected = Buffer.from(signServiceRequest(body, timestamp, requestId, secret), "hex");
  const actual = Buffer.from(supplied, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { requestId, timestampMs };
}
