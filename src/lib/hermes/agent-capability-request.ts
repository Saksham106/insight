type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_capability_request");
  return value as JsonObject;
}

function exact(value: JsonObject, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) throw new Error("invalid_capability_request");
}

function boundedText(value: unknown, maximum = 8_000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) throw new Error("invalid_capability_request");
  return value.trim();
}

export function parseAgentCapabilityRequest(value: unknown) {
  const body = object(value);
  exact(body, ["actor", "operation", "payload"]);
  const actor = object(body.actor);
  const payload = object(body.payload);
  if (body.operation === "list_capabilities") {
    exact(payload, []);
    return { actor, operation: "list_capabilities" as const, payload: {} };
  }
  if (body.operation === "evaluate_action") {
    exact(payload, ["capabilityName", "capabilityVersion", "proposedInput", "clientRequestId"]);
    if (!Number.isInteger(payload.capabilityVersion) || Number(payload.capabilityVersion) < 1) throw new Error("invalid_capability_request");
    return {
      actor,
      operation: "evaluate_action" as const,
      payload: {
        capabilityName: boundedText(payload.capabilityName, 120),
        capabilityVersion: Number(payload.capabilityVersion),
        proposedInput: object(payload.proposedInput),
        clientRequestId: boundedText(payload.clientRequestId, 200),
      },
    };
  }
  if (body.operation === "execute_action") {
    exact(payload, ["evaluationToken", "clientRequestId"]);
    return {
      actor,
      operation: "execute_action" as const,
      payload: {
        evaluationToken: boundedText(payload.evaluationToken, 8_000),
        clientRequestId: boundedText(payload.clientRequestId, 200),
      },
    };
  }
  throw new Error("invalid_capability_request");
}
