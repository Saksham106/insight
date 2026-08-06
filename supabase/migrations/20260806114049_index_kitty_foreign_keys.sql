-- Cover every Kitty foreign-key lookup used by joins, cascades, and cleanup.
-- These are additive and do not expose any new table or function privilege.
create index if not exists kitty_class_series_created_by_idx
  on public.kitty_class_series (created_by_profile_id);

create index if not exists kitty_class_occurrences_series_idx
  on public.kitty_class_occurrences (series_id);
create index if not exists kitty_class_occurrences_predecessor_idx
  on public.kitty_class_occurrences (predecessor_occurrence_id);
create index if not exists kitty_class_occurrences_created_by_idx
  on public.kitty_class_occurrences (created_by_profile_id);

create index if not exists kitty_class_participants_occurrence_idx
  on public.kitty_class_participants (occurrence_id);

create index if not exists kitty_class_requests_requester_idx
  on public.kitty_class_change_requests (requested_by_contact_id);
create index if not exists kitty_class_requests_override_profile_idx
  on public.kitty_class_change_requests (override_profile_id);

create index if not exists kitty_class_confirmations_decider_idx
  on public.kitty_class_change_confirmations (decided_by_contact_id);

create index if not exists kitty_class_audit_actor_profile_idx
  on public.kitty_class_audit_events (actor_profile_id);

create index if not exists kitty_class_outbox_occurrence_idx
  on public.kitty_class_notification_outbox (occurrence_id);
create index if not exists kitty_class_outbox_change_request_idx
  on public.kitty_class_notification_outbox (change_request_id);
create index if not exists kitty_class_outbox_contact_idx
  on public.kitty_class_notification_outbox (contact_id);
create index if not exists kitty_class_outbox_message_idx
  on public.kitty_class_notification_outbox (hermes_message_id);
