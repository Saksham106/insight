-- Advisor 0028: SECURITY DEFINER functions were executable by anon via REST RPC.
-- RLS helpers must stay executable by authenticated (policies evaluate them as the caller).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_teacher() from public, anon;
revoke execute on function public.is_student() from public, anon;
revoke execute on function public.is_parent() from public, anon;
revoke execute on function public.teacher_can_access_student(uuid) from public, anon;
revoke execute on function public.student_can_access_teacher(uuid) from public, anon;
revoke execute on function public.parent_can_access_student(uuid) from public, anon;
revoke execute on function public.parent_can_access_teacher(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.is_student() to authenticated;
grant execute on function public.is_parent() to authenticated;
grant execute on function public.teacher_can_access_student(uuid) to authenticated;
grant execute on function public.student_can_access_teacher(uuid) to authenticated;
grant execute on function public.parent_can_access_student(uuid) to authenticated;
grant execute on function public.parent_can_access_teacher(uuid) to authenticated;

-- Called only from the authenticated server-side booking route
revoke execute on function public.book_availability_session(uuid, uuid, timestamptz, integer, text, boolean) from public, anon;
grant execute on function public.book_availability_session(uuid, uuid, timestamptz, integer, text, boolean) to authenticated;

-- Trigger functions never need caller EXECUTE; drop them from the exposed API surface
revoke execute on function public.create_conversation_for_assignment() from public, anon, authenticated;
revoke execute on function public.handle_session_notification() from public, anon, authenticated;
revoke execute on function public.reject_contact_info() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Advisor 0025: broad SELECT policy let any signed-in user list/read every chat attachment.
-- Scope both read and upload to the conversation's participants (path = <conversation_id>/<file>).
drop policy if exists "Authenticated users can view chat attachments" on storage.objects;
drop policy if exists "Authenticated users can upload chat attachments" on storage.objects;

create policy "Chat attachments readable by conversation participants"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    (select is_admin())
    or exists (
      select 1
      from public.conversations c
      join public.teacher_student_assignments a on a.id = c.assignment_id
      where c.id::text = (storage.foldername(name))[1]
        and (
          a.teacher_id = (select auth.uid())
          or a.student_id = (select auth.uid())
          or exists (
            select 1 from public.parent_student_links l
            where l.parent_id = (select auth.uid()) and l.student_id = a.student_id
          )
        )
    )
  )
);

create policy "Chat attachments uploadable by conversation participants"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (
    (select is_admin())
    or exists (
      select 1
      from public.conversations c
      join public.teacher_student_assignments a on a.id = c.assignment_id
      where c.id::text = (storage.foldername(name))[1]
        and (
          a.teacher_id = (select auth.uid())
          or a.student_id = (select auth.uid())
          or exists (
            select 1 from public.parent_student_links l
            where l.parent_id = (select auth.uid()) and l.student_id = a.student_id
          )
        )
    )
  )
);
