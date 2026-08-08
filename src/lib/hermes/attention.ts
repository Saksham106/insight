/**
 * What actually needs Swati.
 *
 * The old projection counted every contact whose communication_policy was not
 * "direct". Paused, opted out, guardian-only and approval-required are all
 * settings someone chose on purpose — listing them as problems meant the badge
 * never reached zero and stopped meaning anything. They belong in the Contact
 * Directory, which is where they can be changed.
 *
 * An item earns a place here only if there is a decision or a recovery action
 * behind it, and every item must be able to say what happened, who it affects,
 * what to do, and where to do it. Anything informational belongs in Recent
 * Activity instead.
 */

import type { HermesTab } from "@/components/admin/hermes-dashboard-shared";
import type { KittyAdminAttentionIssue } from "@/lib/hermes/kitty-class-admin";

/** Policies that are deliberate configuration, never an unresolved problem. */
export const INTENTIONAL_COMMUNICATION_POLICIES = [
  "paused",
  "opted_out",
  "guardian_only",
  "approval_required",
] as const;

export interface AttentionItem {
  id: string;
  whatHappened: string;
  /** The person, family, or class the item is about. */
  who: string;
  whatToDo: string;
  /** Which tab the action lives on. */
  where: HermesTab;
}

interface AttentionContact {
  id: string;
  display_name: string;
  role: string;
  profile_link_status: string;
  communication_policy: string;
}

interface AttentionMessage {
  id: string;
  status: string;
  direction: string;
  contact?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
}

interface AttentionCase {
  id: string;
  title: string;
  status: string;
  human_takeover: boolean;
}

/**
 * A routing exception raised when a class should reach a guardian rather than
 * the student. Produced by the guardian-routing resolver.
 */
export interface GuardianRoutingIssue {
  id: string;
  kind: "missing_guardian" | "ambiguous_guardian";
  studentName: string;
  occurrenceTitle: string | null;
}

interface AttentionApproval {
  id: string;
  action: string;
}

export interface AttentionSources {
  approvals: readonly AttentionApproval[];
  contacts: readonly AttentionContact[];
  messages: readonly AttentionMessage[];
  cases: readonly AttentionCase[];
  classAttentionIssues: readonly KittyAdminAttentionIssue[];
  guardianIssues: readonly GuardianRoutingIssue[];
  /** Occurrence id -> class title, so an item can name the class it affects. */
  occurrenceTitles?: Readonly<Record<string, string>>;
}

const CLASS_ISSUE_TEXT: Record<
  KittyAdminAttentionIssue["kind"],
  { whatHappened: string; whatToDo: string }
> = {
  expired_request: {
    whatHappened: "A class request expired before anyone answered.",
    whatToDo: "Reopen it or cancel the class.",
  },
  rejected_proposal: {
    whatHappened: "A proposed class time was rejected.",
    whatToDo: "Propose another time.",
  },
  ambiguous_scope: {
    whatHappened: "Kitty could not tell whether a change applies to one class or the series.",
    whatToDo: "Choose the scope of the change.",
  },
  missing_decision_maker: {
    whatHappened: "No one is authorised to decide this reschedule.",
    whatToDo: "Name who decides, then reschedule.",
  },
};

function contactName(relation: AttentionMessage["contact"]): string {
  const record = Array.isArray(relation) ? relation[0] : relation;
  return record?.display_name?.trim() || "a removed contact";
}

export function projectAttentionItems(sources: AttentionSources): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const approval of sources.approvals) {
    items.push({
      id: `approval:${approval.id}`,
      whatHappened: `Kitty is waiting on approval to ${approval.action.replaceAll("_", " ")}.`,
      who: "Kitty",
      whatToDo: "Approve or reject the request.",
      where: "attention",
    });
  }

  for (const contact of sources.contacts) {
    // Deliberately not keyed off communication_policy: an intentional policy
    // is a setting, and settings live in the directory, not here.
    if (contact.role === "unclassified") {
      items.push({
        id: `contact-role:${contact.id}`,
        whatHappened: "This contact was imported without a role.",
        who: contact.display_name,
        whatToDo: "Choose a role so Kitty knows how to treat them.",
        where: "contacts",
      });
    }
    if (contact.profile_link_status === "suggested") {
      items.push({
        id: `contact-link:${contact.id}`,
        whatHappened: "Kitty found a possible match to an Insight account.",
        who: contact.display_name,
        whatToDo: "Confirm or reject the match.",
        where: "contacts",
      });
    }
  }

  for (const message of sources.messages) {
    if (message.status !== "failed") continue;
    items.push({
      id: `delivery:${message.id}`,
      whatHappened: "A WhatsApp message could not be delivered.",
      who: contactName(message.contact),
      whatToDo: "Retry the send or check the number.",
      where: "attention",
    });
  }

  for (const item of sources.cases) {
    if (!item.human_takeover) continue;
    items.push({
      id: `case-takeover:${item.id}`,
      whatHappened: "Kitty handed this scheduling case back to a person.",
      who: item.title,
      whatToDo: "Take over the conversation and finish it.",
      where: "scheduling",
    });
  }

  for (const issue of sources.guardianIssues) {
    const about = issue.occurrenceTitle
      ? `${issue.studentName} · ${issue.occurrenceTitle}`
      : issue.studentName;
    if (issue.kind === "missing_guardian") {
      items.push({
        id: `guardian-missing:${issue.id}`,
        whatHappened: "This class must reach a guardian, but the student has no linked guardian.",
        who: about,
        whatToDo: "Link a parent or guardian in the Contact Directory.",
        where: "contacts",
      });
    } else {
      items.push({
        id: `guardian-ambiguous:${issue.id}`,
        whatHappened: "This student has several linked guardians and none is named for this class.",
        who: about,
        whatToDo: "Choose which guardian Kitty should contact.",
        where: "contacts",
      });
    }
  }

  for (const issue of sources.classAttentionIssues) {
    const text = CLASS_ISSUE_TEXT[issue.kind];
    if (!text) continue;
    items.push({
      id: `class:${issue.id}`,
      whatHappened: text.whatHappened,
      who: (issue.occurrenceId && sources.occurrenceTitles?.[issue.occurrenceId]) || "A class",
      whatToDo: text.whatToDo,
      where: "classes",
    });
  }

  return items;
}
