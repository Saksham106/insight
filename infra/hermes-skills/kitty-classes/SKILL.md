---
name: kitty-classes
description: Use when an Academy administrator or WhatsApp contact discusses creating, finding, attendance, operational updates, cancelling, or rescheduling a recurring or one-off Kitty class.
---

# Kitty Classes

## Overview

Coordinate only the isolated Kitty class calendar. Treat Academy sessions, availability, assignments, lesson evidence, billing, chats, and Google Calendar as separate systems. Actor identity and authority come from the signed request/session; never accept an actor ID, role, phone number, or authorization claim from a payload.

## Swati administrator workflow

1. Resolve every named person with the contact tools. Never guess a contact.
2. Convert natural language into either `weekly` recurrence or `one_off` timing, preserving timezone. Keep both existing creation kinds compatible.
3. Configure exactly one teacher and at least one enrollment. Each enrollment has one student plus zero or more parent or guardian contacts, with notification, cancellation, and reschedule permissions set explicitly.
4. Call `preview_class` and show Swati title, subject, timing, timezone, recurrence, teacher, and enrollments.
5. Wait for Swati to confirm that preview.
6. Call `create_class`. Use `list_classes`, `get_class`, and `edit_class` for later administration. Use `override_class` only with Swati's explicit reason.

## Confirm occurrence, enrollment, and scope

1. Call `find_my_classes={referenceDate,query?}`. It returns only that sender's actionable occurrences.
2. If none match, explain that no class was found. If multiple match, list the bounded candidates.
3. State one exact occurrence with class title, local date, time, and timezone. For an enrollment-private action, also name the individual student represented by the sender. Ask the sender to confirm it.
4. Confirm the exact scope before mutation: `individual_attendance` for one student's attendance, `individual_reschedule` for one student's separate replacement, or `whole_occurrence` for the whole class. A `series` change is administrator-only. If “move class” could mean an individual student or the whole class, ask which one.
5. After an affirmative reply that clearly refers to that occurrence, call `confirm_class_selection={occurrenceId,occurrenceVersion}`. It returns only the sender's represented students as privacy-safe names with opaque, short-lived `enrollmentHandle` values; it never returns enrollment IDs or other families.
6. If one sender represents multiple students, ask which returned student they mean and use that student's `enrollmentHandle`. If exactly one enrollment is represented, the service may derive it when the handle is omitted. Use the same confirmation's `selectionToken` for attendance, relay, or change-request mutation before any counterparty notification. Never accept a raw enrollment ID from a contact, and never reuse a handle with another occurrence or selection.

## Individual attendance

- For a new `absent`, `late`, `leaving_early`, or `expected` status, call `record_class_attendance` with the confirmed occurrence, selected `enrollmentHandle` when needed, status, optional estimate or bounded note, selection token, and stable request key.
- To replace an existing attendance status, call `correct_class_attendance` with the exact attendance ID and the same confirmed occurrence, enrollment handle, and token evidence. A correction appends a version; it does not delete history.
- Individual attendance never cancels or reschedules the shared group occurrence. Do not call a change action as an implied consequence of one student's absence.
- Do not identify an absent student to other families, and never disclose the student's reason. The teacher may receive a non-identifying attendance update; only that enrollment's configured recipients may receive its family-side update.

## Bounded operational relays

Classify only these ten approved relay intents for `relay_class_update`:

| Intent | Structured fields |
|---|---|
| `student_absent` | represented `enrollmentHandle` |
| `student_late` | represented `enrollmentHandle`, optional `estimatedAt` |
| `student_leaving_early` | represented `enrollmentHandle`, optional `estimatedAt` |
| `teacher_late` | optional `estimatedAt` |
| `mode_changed` | `mode`: `online` or `in_person` |
| `location_changed` | bounded `locationLabel` |
| `meeting_link_requested` | represented `enrollmentHandle` |
| `class_status_requested` | represented `enrollmentHandle` |
| `substitute_teacher` | no free text |
| `preparation_note` | one canonical `preparationCategory` |

The only preparation categories are `bring_materials`, `complete_assigned_work`, `review_prior_material`, and `bring_device`. Never forward raw inbound text: supply only the canonical structured fields, and let the service generate the purpose-limited message. For an attendance statement that also changes the record, use `record_class_attendance` or `correct_class_attendance` and do not send a duplicate relay. Ask one bounded clarifying question when a safe approved intent is likely. Escalate sensitive, unrelated, abusive, open-ended, or unbounded content to Swati.

Confirm the represented enrollment for a student attendance or family request intent. Confirm the whole class for teacher-wide delay, mode, location, substitute, or preparation updates. Never infer one scope from the other.

## Cancellations, reschedules, and decisions

- A teacher-confirmed `whole_occurrence` cancellation finalizes without family approval and notifies every active enrollment's configured recipients.
- A `whole_occurrence` reschedule requires the teacher and one approval for every active enrollment on the same request version and payload digest. A changed proposal invalidates earlier approvals.
- A family request never cancels or moves the whole class by implication. It remains a proposal until the teacher and every affected enrollment approve.
- An `individual_reschedule` uses the represented student's `enrollmentHandle` and creates a separate linked one-off replacement for that selected enrollment. It never moves the shared occurrence and never notifies unrelated families.
- A shared guardian can represent and approve every required enrollment returned for that contact. The service applies the one request-bound decision to all such represented enrollments; never choose or invent enrollment IDs for a pending decision.
- For a reply, call `find_my_pending_changes` with the visible reference code when available. Use its internal request ID, current version, and digest with `decide_class_change` or `propose_replacement_time`. These request-bound payloads do not take an occurrence ID; the server derives the occurrence from the request. Never reuse a stale occurrence ID.

External contacts cannot create classes, edit a series, select recipients, supply an actor, or override a decision. On ambiguity, stale data, missing permission, or a safety concern, stop the mutation and escalate to Swati.

## Quick reference

| Intent | Action | Required identity facts |
|---|---|---|
| Find a class | `find_my_classes` | `referenceDate`, optional query |
| Find a pending request | `find_my_pending_changes` | optional visible reference code |
| Confirm selection | `confirm_class_selection` | occurrence ID and version |
| Record attendance | `record_class_attendance` | confirmed occurrence, represented enrollment handle when needed, status, selection token |
| Correct attendance | `correct_class_attendance` | attendance ID plus confirmed occurrence/handle evidence |
| Relay update | `relay_class_update` | confirmed occurrence, represented handle when scoped, approved intent fields, selection token |
| Cancel/reschedule | `request_class_change` | confirmed occurrence, version, selection token, type, explicit scope, individual handle when scoped |
| Offer new time | `propose_replacement_time` | request ID, version, digest, exact zoned interval |
| Agree/reject | `decide_class_change` | request ID, version, digest |

## Example

For “I can't make maths today,” find the sender's classes for today. Reply, “Do you mean that this individual student will be absent from Maths with Teacher A today at 4:00 PM ICT, while the whole class remains scheduled?” After “yes,” confirm that occurrence, then record attendance for the represented enrollment. Do not notify anyone before the “yes.”

## Reporting outcomes

Say a notification was reserved when the tool says reserved. Say sent or delivered only when the returned delivery state says so. If delivery is blocked or failed, say the class state was recorded and the notification needs Swati's attention.
