export type AgentDecisionKind = "allowed" | "needs_clarification" | "needs_approval" | "denied";
export type AgentRisk = "low" | "medium" | "high";
export type AgentActorKind = "admin" | "contact";

export type AgentActor =
  | { kind: "admin"; profileId: string | null; channel: "dashboard" | "imessage" }
  | {
      kind: "contact";
      contactId: string;
      role: "teacher" | "student" | "parent" | "employee" | "other" | "unclassified";
      channel: "whatsapp";
    };

export type AgentCapabilityManifest = {
  name: string;
  version: 1;
  purpose: string;
  risk: AgentRisk;
  schedulable: boolean;
  composable: boolean;
  inputSchema: Record<string, unknown>;
};

export type AgentCapabilityDefinition = {
  manifest: AgentCapabilityManifest;
  allowedActorKinds: readonly AgentActorKind[];
  normalize(input: unknown): Record<string, unknown>;
};

export type AgentActionDecision =
  | { kind: "allowed"; normalizedInput: Record<string, unknown>; relevantVersions: Record<string, string> }
  | { kind: "needs_approval"; normalizedInput: Record<string, unknown>; relevantVersions: Record<string, string>; reasonCode: string }
  | { kind: "needs_clarification"; missingFields: string[]; reasonCode: string }
  | { kind: "denied"; reasonCode: string };

export type AgentPolicyRepository = {
  loadContact(contactId: string): Promise<Record<string, unknown> | null>;
  loadRelationships(contactId: string): Promise<Array<Record<string, unknown>>>;
  loadOccurrence(occurrenceId: string): Promise<Record<string, unknown> | null>;
};

export type AgentEvaluationContext = {
  actor: AgentActor;
  capabilityName: string;
  capabilityVersion: number;
  proposedInput: unknown;
  repository: AgentPolicyRepository;
};
