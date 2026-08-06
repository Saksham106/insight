-- Merge multiple permissive policies into one policy per table/action.
-- Branch expressions are carried over verbatim (OR-combined), matching how
-- Postgres already OR'd separate permissive policies. Admin ALL policies are
-- split into per-action policies so each action has exactly one policy.

-- ============ conversations ============
drop policy conversations_select_admin on public.conversations;
drop policy conversations_select_teacher on public.conversations;
drop policy conversations_select_student on public.conversations;
drop policy conversations_select_parent on public.conversations;
create policy conversations_select on public.conversations for select using (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.teacher_id = (select auth.uid()) and a.id = conversations.assignment_id)))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.student_id = (select auth.uid()) and a.id = conversations.assignment_id)))
  or ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join parent_student_links l on (l.student_id = a.student_id) where l.parent_id = (select auth.uid()) and a.id = conversations.assignment_id)))
);

-- ============ labels ============
drop policy labels_admin_all on public.labels;
drop policy labels_select_teacher on public.labels;
create policy labels_select on public.labels for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (exists ( select 1 from teacher_labels tl where tl.label_id = labels.id and tl.teacher_id = (select auth.uid())))
);
create policy labels_insert_admin on public.labels for insert with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy labels_update_admin on public.labels for update using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy labels_delete_admin on public.labels for delete using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));

-- ============ messages ============
drop policy messages_select_admin on public.messages;
drop policy messages_select_teacher on public.messages;
drop policy messages_select_student on public.messages;
drop policy messages_select_parent on public.messages;
create policy messages_select on public.messages for select using (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.teacher_id = (select auth.uid()) and c.id = messages.conversation_id)))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.student_id = (select auth.uid()) and c.id = messages.conversation_id)))
  or ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) join parent_student_links l on (l.student_id = a.student_id) where l.parent_id = (select auth.uid()) and c.id = messages.conversation_id)))
);
drop policy messages_insert_teacher on public.messages;
drop policy messages_insert_student on public.messages;
drop policy messages_insert_parent on public.messages;
create policy messages_insert on public.messages for insert with check (
  ((sender_id = (select auth.uid())) and (select is_teacher()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.teacher_id = (select auth.uid()) and c.id = messages.conversation_id)))
  or ((sender_id = (select auth.uid())) and (select is_student()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.student_id = (select auth.uid()) and c.id = messages.conversation_id)))
  or ((sender_id = (select auth.uid())) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) join parent_student_links l on (l.student_id = a.student_id) join profiles me on (me.id = (select auth.uid())) where me.role = 'parent' and me.is_active = true and l.parent_id = (select auth.uid()) and c.id = messages.conversation_id)))
);

-- ============ parent_student_links ============
drop policy parent_student_links_admin_all on public.parent_student_links;
drop policy parent_student_links_select_parent on public.parent_student_links;
create policy parent_student_links_select on public.parent_student_links for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (parent_id = (select auth.uid()))
);
create policy parent_student_links_insert_admin on public.parent_student_links for insert with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy parent_student_links_update_admin on public.parent_student_links for update using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy parent_student_links_delete_admin on public.parent_student_links for delete using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));

-- ============ profiles ============
drop policy profiles_select_admin on public.profiles;
drop policy profiles_select_self on public.profiles;
drop policy profiles_select_teacher_students on public.profiles;
drop policy profiles_select_student_teacher on public.profiles;
drop policy profiles_select_parent_children on public.profiles;
drop policy profiles_select_parent_child_teachers on public.profiles;
create policy profiles_select on public.profiles for select using (
  (select is_admin())
  or ((id = (select auth.uid())) and (is_active = true))
  or ((select is_teacher()) and teacher_can_access_student(id))
  or ((select is_student()) and student_can_access_teacher(id))
  or ((select is_parent()) and parent_can_access_student(id))
  or ((select is_parent()) and parent_can_access_teacher(id))
);

-- ============ sessions ============
drop policy sessions_admin_all on public.sessions;
drop policy sessions_select_teacher on public.sessions;
drop policy sessions_select_student on public.sessions;
drop policy sessions_select_parent on public.sessions;
drop policy sessions_insert_teacher on public.sessions;
drop policy sessions_insert_student on public.sessions;
drop policy sessions_update_teacher on public.sessions;
drop policy sessions_update_student on public.sessions;
create policy sessions_select on public.sessions for select using (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))))
  or ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join parent_student_links l on (l.student_id = a.student_id) where l.parent_id = (select auth.uid()) and a.id = sessions.assignment_id)))
);
create policy sessions_insert on public.sessions for insert with check (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))))
);
create policy sessions_update on public.sessions for update using (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))))
) with check (
  (select is_admin())
  or ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))))
  or ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))))
);
create policy sessions_delete_admin on public.sessions for delete using ((select is_admin()));

-- ============ teacher_availability_overrides ============
drop policy teacher_availability_overrides_all_teacher on public.teacher_availability_overrides;
drop policy teacher_availability_overrides_select_admin on public.teacher_availability_overrides;
drop policy teacher_availability_overrides_select_teacher on public.teacher_availability_overrides;
create policy teacher_availability_overrides_select on public.teacher_availability_overrides for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (teacher_id = (select auth.uid()))
);
create policy teacher_availability_overrides_insert_teacher on public.teacher_availability_overrides for insert with check (teacher_id = (select auth.uid()));
create policy teacher_availability_overrides_update_teacher on public.teacher_availability_overrides for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy teacher_availability_overrides_delete_teacher on public.teacher_availability_overrides for delete using (teacher_id = (select auth.uid()));

-- ============ teacher_availability_rules ============
drop policy teacher_availability_rules_all_teacher on public.teacher_availability_rules;
drop policy teacher_availability_rules_select_admin on public.teacher_availability_rules;
drop policy teacher_availability_rules_select_teacher on public.teacher_availability_rules;
create policy teacher_availability_rules_select on public.teacher_availability_rules for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (teacher_id = (select auth.uid()))
);
create policy teacher_availability_rules_insert_teacher on public.teacher_availability_rules for insert with check (teacher_id = (select auth.uid()));
create policy teacher_availability_rules_update_teacher on public.teacher_availability_rules for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy teacher_availability_rules_delete_teacher on public.teacher_availability_rules for delete using (teacher_id = (select auth.uid()));

-- ============ teacher_booking_settings ============
drop policy teacher_booking_settings_all_teacher on public.teacher_booking_settings;
drop policy teacher_booking_settings_select_admin on public.teacher_booking_settings;
drop policy teacher_booking_settings_select_teacher on public.teacher_booking_settings;
create policy teacher_booking_settings_select on public.teacher_booking_settings for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (teacher_id = (select auth.uid()))
);
create policy teacher_booking_settings_insert_teacher on public.teacher_booking_settings for insert with check (teacher_id = (select auth.uid()));
create policy teacher_booking_settings_update_teacher on public.teacher_booking_settings for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy teacher_booking_settings_delete_teacher on public.teacher_booking_settings for delete using (teacher_id = (select auth.uid()));

-- ============ teacher_labels ============
drop policy teacher_labels_admin_all on public.teacher_labels;
drop policy teacher_labels_select_own on public.teacher_labels;
create policy teacher_labels_select on public.teacher_labels for select using (
  (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true))
  or (teacher_id = (select auth.uid()))
);
create policy teacher_labels_insert_admin on public.teacher_labels for insert with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy teacher_labels_update_admin on public.teacher_labels for update using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
create policy teacher_labels_delete_admin on public.teacher_labels for delete using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));

-- ============ teacher_student_assignments ============
drop policy assignments_admin_all on public.teacher_student_assignments;
drop policy assignments_select_teacher on public.teacher_student_assignments;
drop policy assignments_select_student on public.teacher_student_assignments;
drop policy assignments_select_parent on public.teacher_student_assignments;
create policy assignments_select on public.teacher_student_assignments for select using (
  (select is_admin())
  or ((teacher_id = (select auth.uid())) and (select is_teacher()))
  or ((student_id = (select auth.uid())) and (select is_student()))
  or ((select is_parent()) and (exists ( select 1 from parent_student_links l where l.parent_id = (select auth.uid()) and l.student_id = teacher_student_assignments.student_id)))
);
create policy assignments_insert_admin on public.teacher_student_assignments for insert with check ((select is_admin()));
create policy assignments_update_admin on public.teacher_student_assignments for update using ((select is_admin())) with check ((select is_admin()));
create policy assignments_delete_admin on public.teacher_student_assignments for delete using ((select is_admin()));;
