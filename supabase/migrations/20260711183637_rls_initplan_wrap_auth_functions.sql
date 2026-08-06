-- Perf-only rewrite: wrap auth.uid() and zero-arg role helpers in scalar
-- subselects so Postgres evaluates them once per statement (InitPlan)
-- instead of once per row. No access-rule changes.

-- conversations
alter policy conversations_insert_admin on public.conversations with check ((select is_admin()));
alter policy conversations_select_admin on public.conversations using ((select is_admin()));
alter policy conversations_select_parent on public.conversations using ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join parent_student_links l on (l.student_id = a.student_id) where (l.parent_id = (select auth.uid())) and (a.id = conversations.assignment_id))));
alter policy conversations_select_student on public.conversations using ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where (a.student_id = (select auth.uid())) and (a.id = conversations.assignment_id))));
alter policy conversations_select_teacher on public.conversations using ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where (a.teacher_id = (select auth.uid())) and (a.id = conversations.assignment_id))));

-- join_interest_requests
alter policy join_interest_requests_admin_select on public.join_interest_requests using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy join_interest_requests_admin_update on public.join_interest_requests using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));

-- labels
alter policy labels_admin_all on public.labels using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy labels_select_teacher on public.labels using (exists ( select 1 from teacher_labels tl where tl.label_id = labels.id and tl.teacher_id = (select auth.uid())));

-- messages
alter policy messages_insert_parent on public.messages with check ((sender_id = (select auth.uid())) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) join parent_student_links l on (l.student_id = a.student_id) join profiles me on (me.id = (select auth.uid())) where me.role = 'parent' and me.is_active = true and l.parent_id = (select auth.uid()) and c.id = messages.conversation_id)));
alter policy messages_insert_student on public.messages with check ((sender_id = (select auth.uid())) and (select is_student()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.student_id = (select auth.uid()) and c.id = messages.conversation_id)));
alter policy messages_insert_teacher on public.messages with check ((sender_id = (select auth.uid())) and (select is_teacher()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.teacher_id = (select auth.uid()) and c.id = messages.conversation_id)));
alter policy messages_select_admin on public.messages using ((select is_admin()));
alter policy messages_select_parent on public.messages using ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) join parent_student_links l on (l.student_id = a.student_id) where l.parent_id = (select auth.uid()) and c.id = messages.conversation_id)));
alter policy messages_select_student on public.messages using ((select is_student()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.student_id = (select auth.uid()) and c.id = messages.conversation_id)));
alter policy messages_select_teacher on public.messages using ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a join conversations c on (c.assignment_id = a.id) where a.teacher_id = (select auth.uid()) and c.id = messages.conversation_id)));

-- notifications
alter policy notifications_select_self on public.notifications using (user_id = (select auth.uid()));
alter policy notifications_update_self on public.notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- parent_student_links
alter policy parent_student_links_admin_all on public.parent_student_links using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy parent_student_links_select_parent on public.parent_student_links using (parent_id = (select auth.uid()));

-- profiles
alter policy profiles_select_admin on public.profiles using ((select is_admin()));
alter policy profiles_select_parent_child_teachers on public.profiles using ((select is_parent()) and parent_can_access_teacher(id));
alter policy profiles_select_parent_children on public.profiles using ((select is_parent()) and parent_can_access_student(id));
alter policy profiles_select_self on public.profiles using ((id = (select auth.uid())) and (is_active = true));
alter policy profiles_select_student_teacher on public.profiles using ((select is_student()) and student_can_access_teacher(id));
alter policy profiles_select_teacher_students on public.profiles using ((select is_teacher()) and teacher_can_access_student(id));
alter policy profiles_update_admin on public.profiles using ((select is_admin())) with check ((select is_admin()));

-- sessions
alter policy sessions_admin_all on public.sessions using ((select is_admin())) with check ((select is_admin()));
alter policy sessions_insert_student on public.sessions with check ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))));
alter policy sessions_insert_teacher on public.sessions with check ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))));
alter policy sessions_select_parent on public.sessions using ((select is_parent()) and (exists ( select 1 from teacher_student_assignments a join parent_student_links l on (l.student_id = a.student_id) where l.parent_id = (select auth.uid()) and a.id = sessions.assignment_id)));
alter policy sessions_select_student on public.sessions using ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))));
alter policy sessions_select_teacher on public.sessions using ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))));
alter policy sessions_update_student on public.sessions using ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid())))) with check ((select is_student()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.student_id = (select auth.uid()))));
alter policy sessions_update_teacher on public.sessions using ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid())))) with check ((select is_teacher()) and (exists ( select 1 from teacher_student_assignments a where a.id = sessions.assignment_id and a.teacher_id = (select auth.uid()))));

-- teacher_availability_overrides
alter policy teacher_availability_overrides_all_teacher on public.teacher_availability_overrides using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
alter policy teacher_availability_overrides_select_admin on public.teacher_availability_overrides using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy teacher_availability_overrides_select_teacher on public.teacher_availability_overrides using (teacher_id = (select auth.uid()));

-- teacher_availability_rules
alter policy teacher_availability_rules_all_teacher on public.teacher_availability_rules using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
alter policy teacher_availability_rules_select_admin on public.teacher_availability_rules using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy teacher_availability_rules_select_teacher on public.teacher_availability_rules using (teacher_id = (select auth.uid()));

-- teacher_booking_settings
alter policy teacher_booking_settings_all_teacher on public.teacher_booking_settings using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
alter policy teacher_booking_settings_select_admin on public.teacher_booking_settings using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy teacher_booking_settings_select_teacher on public.teacher_booking_settings using (teacher_id = (select auth.uid()));

-- teacher_labels
alter policy teacher_labels_admin_all on public.teacher_labels using (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true)) with check (exists ( select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true));
alter policy teacher_labels_select_own on public.teacher_labels using (teacher_id = (select auth.uid()));

-- teacher_student_assignments
alter policy assignments_admin_all on public.teacher_student_assignments using ((select is_admin())) with check ((select is_admin()));
alter policy assignments_select_parent on public.teacher_student_assignments using ((select is_parent()) and (exists ( select 1 from parent_student_links l where l.parent_id = (select auth.uid()) and l.student_id = teacher_student_assignments.student_id)));
alter policy assignments_select_student on public.teacher_student_assignments using ((student_id = (select auth.uid())) and (select is_student()));
alter policy assignments_select_teacher on public.teacher_student_assignments using ((teacher_id = (select auth.uid())) and (select is_teacher()));;
