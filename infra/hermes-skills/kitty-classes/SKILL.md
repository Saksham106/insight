---
name: kitty-classes
description: Use when an Academy administrator or WhatsApp contact discusses creating, finding, cancelling, or rescheduling a recurring or one-off Kitty class.
---

# Kitty Classes

## Overview

Coordinate only the isolated Kitty class calendar. Treat Academy sessions, availability, assignments, lesson evidence, and Google Calendar as separate systems.

## Swati administrator workflow

1. Resolve every named person with the contact tools. Never guess a contact.
2. Convert natural language into either `weekly` recurrence or `one_off` timing, preserving timezone.
3. Set each participant's `receivesNotifications`, `confirmsCancellation`, `confirmsReschedule`, and `decisionSide`. The teacher side is `teacher`; a student, parent, or both may represent the `student` side.
4. Call `preview_class` and show Swati title, subject, timing, timezone, recurrence, and participants.
5. Wait for Swati to confirm that preview.
6. Call `create_class`. Use `list_classes`, `get_class`, and `edit_class` for later administration. Use `override_class` only with Swati's explicit reason.

## WhatsApp contact workflow

1. Call `find_my_classes={referenceDate,query?}`. It returns only that sender's actionable occurrences.
2. If none match, explain that no class was found. If multiple match, list the bounded candidates.
3. State one exact occurrence with class title, local date, time, and timezone. Ask the sender to confirm it.
4. After an affirmative reply that clearly refers to that occurrence, call `confirm_class_selection={occurrenceId,occurrenceVersion}`.
5. Use the returned short-lived `selectionToken` when calling `request_class_change`. Only this confirmed selection can cross the boundary before any counterparty notification.
6. For a reply to a pending request, use `decide_class_change` with the exact request version and digest. When both sides approve, the service finalizes the change and reserves notices to both sides.

External contacts cannot create classes, edit a series, select recipients, supply an actor, or override a decision. On ambiguity, stale data, missing permission, or a safety concern, stop the mutation and escalate to Swati.

## Quick reference

| Intent | Action | Required identity facts |
|---|---|---|
| Find a class | `find_my_classes` | `referenceDate`, optional query |
| Confirm selection | `confirm_class_selection` | occurrence ID and version |
| Cancel/reschedule | `request_class_change` | confirmed occurrence, version, selection token, type |
| Offer new time | `propose_replacement_time` | confirmed occurrence, exact zoned interval |
| Agree/reject | `decide_class_change` | request ID, version, digest, occurrence ID |

## Example

For “I can't make maths today,” find the sender's classes for today. Reply, “Do you mean Maths with Teacher A today at 4:00 PM ICT?” After “yes,” confirm that occurrence, then request the change. Do not notify anyone before the “yes.”

## Reporting outcomes

Say a notification was reserved when the tool says reserved. Say sent or delivered only when the returned delivery state says so. If delivery is blocked or failed, say the class state was recorded and the notification needs Swati's attention.
