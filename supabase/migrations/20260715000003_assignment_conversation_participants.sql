-- Fix: the assignment→conversation trigger created a conversation row but no
-- participant rows, so conversations for assignments created after the
-- group_conversations migration would be invisible under membership RLS.
create or replace function public.create_conversation_for_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_conversation_id uuid;
begin
  insert into public.conversations (assignment_id)
  values (new.id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, new.teacher_id), (v_conversation_id, new.student_id)
  on conflict (conversation_id, user_id) do nothing;

  return new;
end;
$function$;
