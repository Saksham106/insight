import type {
  AgentActorKind,
  AgentCapabilityDefinition,
  AgentCapabilityManifest,
} from "./agent-capability-types";
import { sanitizeFeeStatementInput } from "./fee-statements";

function objectInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_capability_input");
  return input as Record<string, unknown>;
}

function exactInput(input: unknown, required: string[], optional: string[] = []) {
  const value = objectInput(input);
  const keys = Object.keys(value);
  const accepted = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || keys.some((key) => !accepted.has(key))) {
    throw new Error("invalid_capability_input");
  }
  return value;
}

function text(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\r\n]/.test(value)) {
    throw new Error("invalid_capability_input");
  }
  return value.trim();
}

function textList(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new Error("invalid_capability_input");
  const normalized = value.map(text);
  if (new Set(normalized).size !== normalized.length) throw new Error("invalid_capability_input");
  return normalized;
}

function uuid(value: unknown) {
  const normalized = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("invalid_capability_input");
  }
  return normalized;
}

function isoMonthStart(value: unknown) {
  const normalized = text(value);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized
    || !normalized.endsWith("-01")) {
    throw new Error("invalid_capability_input");
  }
  return normalized;
}

function schema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", additionalProperties: false, properties, required };
}

const stringField = { type: "string", minLength: 1, maxLength: 500 };

const definitions: AgentCapabilityDefinition[] = [
  {
    manifest: {
      name: "fee_statement.create", version: 1,
      purpose: "Publish a private-link fee statement from reconciled lesson rows.",
      risk: "medium", schedulable: false, composable: true,
      inputSchema: schema({
        studentName: stringField,
        billedToName: stringField,
        periodStart: stringField,
        periodEnd: stringField,
        dueDate: stringField,
        currency: { type: "string", minLength: 3, maxLength: 3 },
        lineItems: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
      }, ["studentName", "periodStart", "periodEnd", "currency", "lineItems"]),
    },
    allowedActorKinds: ["admin"],
    normalize(input) {
      return sanitizeFeeStatementInput(input) as unknown as Record<string, unknown>;
    },
  },
  {
    manifest: {
      name: "fee_statement.replace", version: 1,
      purpose: "Void an incorrect fee statement and publish its corrected immutable replacement.",
      risk: "high", schedulable: false, composable: false,
      inputSchema: schema({
        statementId: { type: "string", format: "uuid" },
        correctionReason: stringField,
        studentName: stringField,
        billedToName: stringField,
        periodStart: stringField,
        periodEnd: stringField,
        dueDate: stringField,
        currency: { type: "string", minLength: 3, maxLength: 3 },
        lineItems: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
      }, ["correctionReason", "studentName", "periodStart", "periodEnd", "currency", "lineItems"]),
    },
    allowedActorKinds: ["admin"],
    normalize(input) {
      const value = exactInput(
        input,
        ["correctionReason", "studentName", "periodStart", "periodEnd", "currency", "lineItems"],
        ["statementId", "billedToName", "dueDate"],
      );
      const { statementId, correctionReason, ...replacement } = value;
      return {
        ...(statementId === undefined ? {} : { statementId: uuid(statementId) }),
        correctionReason: text(correctionReason),
        ...sanitizeFeeStatementInput(replacement),
      } as unknown as Record<string, unknown>;
    },
  },
  {
    manifest: {
      name: "fee_statement.lookup", version: 1,
      purpose: "Recover the current private fee statement link and ready-to-copy WhatsApp message.",
      risk: "medium", schedulable: false, composable: true,
      inputSchema: schema({
        studentName: stringField,
        periodStart: { type: "string", format: "date" },
      }, ["studentName"]),
    },
    allowedActorKinds: ["admin"],
    normalize(input) {
      const value = exactInput(input, ["studentName"], ["periodStart"]);
      return {
        studentName: text(value.studentName),
        ...(value.periodStart === undefined ? {} : { periodStart: isoMonthStart(value.periodStart) }),
      };
    },
  },
  {
    manifest: {
      name: "class.attendance.record", version: 1, purpose: "Record an attendance update for a selected class occurrence.",
      risk: "low", schedulable: false, composable: true,
      inputSchema: schema({ occurrenceId: stringField, enrollmentHandle: stringField, selectionToken: stringField, status: { type: "string", enum: ["present", "absent", "late"] } }, ["occurrenceId", "enrollmentHandle", "selectionToken", "status"]),
    },
    allowedActorKinds: ["admin", "contact"],
    normalize(input) {
      const value = exactInput(input, ["occurrenceId", "enrollmentHandle", "selectionToken", "status"]);
      const status = text(value.status);
      if (!["present", "absent", "late"].includes(status)) throw new Error("invalid_capability_input");
      return { occurrenceId: text(value.occurrenceId), enrollmentHandle: text(value.enrollmentHandle), selectionToken: text(value.selectionToken), status };
    },
  },
  {
    manifest: {
      name: "class.one_off.create", version: 1, purpose: "Create one non-recurring class for verified existing participants.",
      risk: "medium", schedulable: false, composable: true,
      inputSchema: schema({ title: stringField, subject: stringField, timezone: stringField, startsAt: stringField, endsAt: stringField, localDate: stringField, teacherContactId: stringField, studentContactIds: { type: "array", minItems: 1, maxItems: 20, items: stringField } }, ["title", "timezone", "startsAt", "endsAt", "localDate", "studentContactIds"]),
    },
    allowedActorKinds: ["admin", "contact"],
    normalize(input) {
      const value = exactInput(input, ["title", "timezone", "startsAt", "endsAt", "localDate", "studentContactIds"], ["subject", "teacherContactId"]);
      return {
        title: text(value.title),
        ...(value.subject === undefined ? {} : { subject: text(value.subject) }),
        timezone: text(value.timezone), startsAt: text(value.startsAt), endsAt: text(value.endsAt), localDate: text(value.localDate),
        ...(value.teacherContactId === undefined ? {} : { teacherContactId: text(value.teacherContactId) }),
        studentContactIds: textList(value.studentContactIds),
      };
    },
  },
  {
    manifest: {
      name: "class.reminder.send", version: 1, purpose: "Send a role-aware reminder for one participant in an existing class occurrence.",
      risk: "low", schedulable: true, composable: true,
      inputSchema: schema({ occurrenceId: stringField, recipientId: stringField }, ["occurrenceId", "recipientId"]),
    },
    allowedActorKinds: ["admin", "contact"],
    normalize(input) {
      const value = exactInput(input, ["occurrenceId", "recipientId"]);
      return { occurrenceId: text(value.occurrenceId), recipientId: text(value.recipientId) };
    },
  },
  {
    manifest: {
      name: "class.reschedule.request", version: 1, purpose: "Request a bounded change to an existing selected class.",
      risk: "medium", schedulable: false, composable: true,
      inputSchema: schema({ occurrenceId: stringField, selectionToken: stringField, scope: { type: "string", enum: ["individual_reschedule", "whole_occurrence"] }, proposedStartsAt: stringField, proposedEndsAt: stringField, proposedTimezone: stringField }, ["occurrenceId", "selectionToken", "scope" ]),
    },
    allowedActorKinds: ["admin", "contact"],
    normalize(input) {
      const value = exactInput(input, ["occurrenceId", "selectionToken", "scope"], ["proposedStartsAt", "proposedEndsAt", "proposedTimezone"]);
      const scope = text(value.scope);
      if (!["individual_reschedule", "whole_occurrence"].includes(scope)) throw new Error("invalid_capability_input");
      return Object.fromEntries(Object.entries({ ...value, scope }).map(([key, item]) => [key, text(item)]));
    },
  },
  {
    manifest: {
      name: "routine.manage", version: 1, purpose: "Create, preview, enable, disable, or update a structured agent routine.",
      risk: "high", schedulable: false, composable: false,
      inputSchema: schema({ operation: { type: "string", enum: ["create", "preview", "enable", "disable", "update"] }, routine: { type: "object" }, routineId: stringField }, ["operation"]),
    },
    allowedActorKinds: ["admin"],
    normalize(input) {
      const value = exactInput(input, ["operation"], ["routine", "routineId"]);
      const operation = text(value.operation);
      if (!["create", "preview", "enable", "disable", "update"].includes(operation)) throw new Error("invalid_capability_input");
      return { operation, ...(value.routine === undefined ? {} : { routine: objectInput(value.routine) }), ...(value.routineId === undefined ? {} : { routineId: text(value.routineId) }) };
    },
  },
];

const registry = new Map<string, AgentCapabilityDefinition>();
for (const definition of definitions) {
  const key = `${definition.manifest.name}@${definition.manifest.version}`;
  if (registry.has(key)) throw new Error("duplicate_capability");
  registry.set(key, definition);
}

export function getCapability(name: string, version = 1) {
  const definition = registry.get(`${name}@${version}`);
  if (!definition) throw new Error("capability_not_found");
  return definition;
}

export function listCapabilityManifests(actorKind: AgentActorKind): AgentCapabilityManifest[] {
  return definitions
    .filter((definition) => definition.allowedActorKinds.includes(actorKind))
    .map((definition) => structuredClone(definition.manifest))
    .sort((left, right) => left.name.localeCompare(right.name));
}
