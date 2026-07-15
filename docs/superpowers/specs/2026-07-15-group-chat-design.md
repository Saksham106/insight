# WhatsApp-Style Group Chat — Design

**Date:** 2026-07-15
**Workstream:** 5 (group chat)
**Status:** Shipped

## Goal

Turn the rigid 1:1 assignment-anchored chat into WhatsApp-style messaging: 1:1 **and**
group conversations across students, parents, and teachers, with the ability to start new
chats and name groups. Existing 1:1 conversations keep working unchanged.

## The problem with what existed

A conversation was a `not null unique` mirror of a `teacher_student_assignment`. Every
access decision, unread count, and conversation-list build re-derived the two endpoints from
that assignment. There was no participants table and no way to create a conversation except
by an admin creating an assignment (a DB trigger auto-made the 1:1).

## Schema (migration `20260715000002_group_conversations.sql`, applied to prod)

Additive and backward compatible:
- `conversations`: `assignment_id` made nullable; added `title`, `is_group` (default false),
  `created_by`, `updated_at`.
- New `conversation_participants (id, conversation_id, user_id, added_at, unique(conversation_id,user_id))`.
- Backfilled the two endpoints of every existing assignment conversation as participants
  (22 rows across 11 conversations — verified).
- `is_conversation_member(uuid)` SECURITY DEFINER predicate (row_security off → no recursion).
- **Membership RLS added alongside the existing assignment/parent policies** (RLS is OR):
  `conversations_select_member`, `messages_select_member`, `messages_insert_member`,
  `conversation_participants_select_member` + admin select. Storage policies for
  `chat-attachments` extended to conversation members.
- Writes to conversations/participants go through the service-role admin client in API routes,
  so no user INSERT policy is needed (avoids RLS bootstrap problems).

RLS verified end-to-end: a member can insert + read; a non-member reads 0 and is blocked from
inserting.

## Backend

- `lib/chat/data.ts`: `getConversationsForUser` (membership → summaries with roster, last
  message, resolved title), `getChattableContacts` (network resolved via assignments + parent
  links; everyone can reach admins; admins reach everyone), `createConversation` (dedupes 1:1).
- API: `GET/POST /api/chat/conversations`, `GET /api/chat/contacts`. POST validates every
  requested member is within the creator's allowed contact set.
- `unread-context`: conversation discovery switched from assignments to
  `conversation_participants` so group chats count toward unread.

## Frontend

- `ChatsPanel` (`components/chat/chats-panel.tsx`): WhatsApp-style two-pane (list + thread,
  single-pane on mobile with back), unread badges, live reordering via a global messages
  channel, and a `NewChatModal` (searchable multi-select contacts + optional group name).
  Reuses `ChatWindow`/`MessageList`/`MessageInput` (already N-sender capable).
- Rendered as the Chats view in the teacher, student, and parent dashboards (the old
  per-assignment `ChatDrawer` remains for quick-message buttons elsewhere).

## Out of scope / follow-ups

- Admin has no dedicated Chats nav (still uses the per-assignment drawer); could get `ChatsPanel`.
- Per-member read receipts / typing indicators / leaving or renaming a group / removing members.
- `/chat/[conversationId]` full page still assumes an assignment; group chats never route there
  (rendered inline in `ChatsPanel`).

## Verification

- `tsc` + `npm run build` clean; DB-level RLS test (member vs non-member) passed; route smoke
  (401 unauth, 307 chat pages) passed; existing 1:1 conversations preserved via backfill.
