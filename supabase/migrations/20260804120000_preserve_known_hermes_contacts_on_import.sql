create or replace function public.import_hermes_contacts(
  p_imported_by uuid,
  p_source_sha256 text,
  p_contacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_item jsonb;
  v_contact_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_existing uuid;
  v_role text;
  v_profile_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_imported_by and role = 'admin' and is_active = true and deleted_at is null
  ) then
    raise exception 'administrator_required';
  end if;
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) = 0 then
    raise exception 'contacts_required';
  end if;

  insert into public.hermes_import_batches (
    imported_by, consent_attested, source_sha256, total_count
  ) values (
    p_imported_by, true, p_source_sha256, jsonb_array_length(p_contacts)
  ) returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_contacts)
  loop
    v_role := v_item->>'role';
    v_profile_id := nullif(v_item->>'profileId', '')::uuid;
    if v_role not in ('teacher', 'student', 'parent', 'employee', 'other') then
      raise exception 'invalid_contact_role';
    end if;
    if coalesce(v_item->>'displayName', '') = ''
      or coalesce(v_item->>'normalizedPhone', '') !~ '^\+[1-9]\d{7,14}$' then
      raise exception 'invalid_contact';
    end if;
    if v_profile_id is not null and not exists (
      select 1 from public.profiles where id = v_profile_id and is_active = true and deleted_at is null
    ) then
      raise exception 'invalid_profile_link';
    end if;

    select id into v_existing
    from public.hermes_contacts
    where whatsapp_e164 = v_item->>'normalizedPhone';

    insert into public.hermes_contacts (
      display_name,
      whatsapp_e164,
      role,
      profile_id,
      profile_link_status,
      profile_link_confirmed_by,
      profile_link_confirmed_at,
      timezone,
      timezone_source,
      communication_policy,
      consent_status,
      consent_source,
      consent_attested_by,
      consent_attested_at,
      import_batch_id,
      is_active,
      deleted_at
    ) values (
      btrim(v_item->>'displayName'),
      v_item->>'normalizedPhone',
      v_role,
      v_profile_id,
      case when v_profile_id is null then 'unlinked' else 'confirmed' end,
      case when v_profile_id is null then null else p_imported_by end,
      case when v_profile_id is null then null else now() end,
      (select timezone from public.profiles where id = v_profile_id),
      case when v_profile_id is null then null else 'profile' end,
      'direct',
      'attested',
      'admin_attestation',
      p_imported_by,
      now(),
      v_batch_id,
      true,
      null
    )
    on conflict (whatsapp_e164) do update set
      display_name = public.hermes_contacts.display_name
    returning id into v_contact_id;

    if v_existing is null then v_created := v_created + 1;
    else v_skipped := v_skipped + 1;
    end if;

    insert into public.hermes_audit_events (
      actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
    ) values (
      'admin', p_imported_by, 'contact_imported', 'hermes_contact', v_contact_id,
      jsonb_build_object('batch_id', v_batch_id, 'linked_profile', v_profile_id is not null)
    );
  end loop;

  update public.hermes_import_batches
  set created_count = v_created,
      updated_count = v_skipped,
      summary = jsonb_build_object('created', v_created, 'skipped', v_skipped)
  where id = v_batch_id;

  return jsonb_build_object('batchId', v_batch_id, 'created', v_created, 'skipped', v_skipped);
end;
$$;
