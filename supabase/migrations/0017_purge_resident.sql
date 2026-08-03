-- ---------------------------------------------------------------------------
-- Purging a resident
-- ---------------------------------------------------------------------------
--
-- Everything in 0003 exists to make signed documentation permanent: a signed
-- note cannot be edited or deleted, addenda are append-only, and the outcome
-- and activity rows attached to a signed note are frozen. That is the property
-- an auditor looks for, and none of it should be reachable from the app.
--
-- But an agency that put a person in by mistake, or that has to honour a
-- record-destruction request, needs a way out — and "you can never remove this"
-- is not a defensible answer either. So there is exactly one door, and it is
-- built to be narrow:
--
--   * It is a single function. Nothing else can delete a signed note.
--   * It sets a transaction-local flag naming ONE resident. The triggers permit
--     a delete only when the row belongs to that resident, so even a leaked
--     flag cannot take out somebody else's signed note.
--   * It writes the audit record BEFORE it deletes anything, inside the same
--     transaction, on an append-only table. If the purge commits, the evidence
--     that it happened commits with it. If it rolls back, so does the log.
--   * It refuses the training resident, which is what example notes hang off.
--
-- The caller is responsible for checking that the person asking is an
-- administrator of the resident's own organisation.

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------

create or replace function ghh.is_purging(p_resident uuid)
returns boolean
language sql
stable
as $$
  -- `true` as the second argument to current_setting means "null if unset"
  -- rather than an error, so this is safe to call in ordinary traffic.
  select p_resident is not null
     and coalesce(current_setting('ghh.purge_resident_id', true), '') = p_resident::text;
$$;

comment on function ghh.is_purging(uuid) is
  'True only inside ghh.purge_resident(), and only for the one resident being purged.';

-- ---------------------------------------------------------------------------
-- Teach the immutability triggers about it
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_note_undeletable()
returns trigger
language plpgsql
as $$
begin
  if (old.locked or old.status = 'signed') and not ghh.is_purging(old.resident_id) then
    raise exception 'note % is signed and cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create or replace function ghh.enforce_addendum_append_only()
returns trigger
language plpgsql
security definer
set search_path to 'ghh', 'public'
as $$
declare
  v_resident uuid;
begin
  -- An addendum is a correction to a signed note, so it can never be edited.
  -- Deleting one is allowed only as part of purging the resident it describes;
  -- purge_resident removes addenda before the notes, so the parent row is still
  -- here to be looked up.
  if tg_op = 'DELETE' then
    select n.resident_id into v_resident from ghh.notes n where n.id = old.note_id;
    if ghh.is_purging(v_resident) then
      return old;
    end if;
  end if;

  raise exception 'addenda are append-only and cannot be % ', lower(tg_op)
    using errcode = 'restrict_violation';
end;
$$;

create or replace function ghh.note_outcomes_locked()
returns trigger
language plpgsql
security definer
set search_path to 'ghh', 'public'
as $$
declare
  is_locked boolean;
  v_resident uuid;
begin
  select locked, resident_id into is_locked, v_resident
  from ghh.notes
  where id = coalesce(new.note_id, old.note_id);

  if is_locked and not (tg_op = 'DELETE' and ghh.is_purging(v_resident)) then
    raise exception 'note % is signed; its outcome documentation cannot be changed. Add an addendum instead.',
      coalesce(new.note_id, old.note_id)
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function ghh.note_activities_locked()
returns trigger
language plpgsql
security definer
set search_path to 'ghh', 'public'
as $$
declare
  is_locked boolean;
  v_resident uuid;
begin
  select locked, resident_id into is_locked, v_resident
  from ghh.notes
  where id = coalesce(new.note_id, old.note_id);

  if is_locked and not (tg_op = 'DELETE' and ghh.is_purging(v_resident)) then
    raise exception 'note % is signed; its support-activity record cannot be changed. Add an addendum instead.',
      coalesce(new.note_id, old.note_id) using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- The door
-- ---------------------------------------------------------------------------

create or replace function ghh.purge_resident(p_resident_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'ghh', 'public'
as $$
declare
  v_resident   ghh.residents%rowtype;
  v_note_ids   uuid[];
  v_signed     int;
  v_addenda    int;
  v_outcomes   int;
  v_documents  int;
  v_files      text[];
  v_signatures text[];
begin
  select * into v_resident from ghh.residents where id = p_resident_id;
  if not found then
    raise exception 'resident % not found', p_resident_id using errcode = 'no_data_found';
  end if;

  -- Training examples are written against this row. Removing it would orphan
  -- them, and it is nobody's record to destroy.
  if v_resident.is_demo then
    raise exception 'the training resident cannot be deleted'
      using errcode = 'restrict_violation';
  end if;

  select array_agg(id), count(*) filter (where status = 'signed')
    into v_note_ids, v_signed
  from ghh.notes where resident_id = p_resident_id;

  v_note_ids := coalesce(v_note_ids, '{}');

  select count(*) into v_addenda from ghh.note_addenda where note_id = any(v_note_ids);
  select count(*) into v_outcomes from ghh.resident_outcomes where resident_id = p_resident_id;

  select coalesce(array_agg(storage_path), '{}'), count(*)
    into v_files, v_documents
  from ghh.documents where resident_id = p_resident_id;

  -- Uploaded signature images live in a separate bucket and are keyed off the
  -- note, so they have to be handed back or they outlive the record.
  select coalesce(array_agg(signature_image_path), '{}')
    into v_signatures
  from ghh.notes
  where resident_id = p_resident_id and signature_image_path is not null;

  -- Written first, and deliberately detailed: once the rows are gone this entry
  -- is the only remaining evidence of what was destroyed. audit_log is
  -- append-only, so this survives even the actor who wrote it.
  insert into ghh.audit_log (org_id, actor_id, action, entity, entity_id, detail)
  values (
    v_resident.org_id,
    p_actor,
    'resident.purge',
    'resident',
    p_resident_id,
    jsonb_build_object(
      'name', v_resident.first_name || ' ' || v_resident.last_name,
      'home_id', v_resident.home_id,
      'admitted_on', v_resident.created_at,
      'notes_deleted', coalesce(array_length(v_note_ids, 1), 0),
      'signed_notes_deleted', coalesce(v_signed, 0),
      'addenda_deleted', v_addenda,
      'outcomes_deleted', v_outcomes,
      'documents_deleted', v_documents
    )
  );

  perform set_config('ghh.purge_resident_id', p_resident_id::text, true);

  -- Children before parents throughout, so the triggers can still resolve which
  -- resident a row belongs to.
  delete from ghh.note_addenda    where note_id = any(v_note_ids);
  delete from ghh.note_outcomes   where note_id = any(v_note_ids);
  delete from ghh.note_activities where note_id = any(v_note_ids);

  -- The AI usage rows are the agency's own metering — token counts and a prompt
  -- hash, no resident content. Severing the link is what removing the person
  -- means here; deleting the agency's billing history is not.
  update ghh.ai_generations set note_id = null where note_id = any(v_note_ids);

  delete from ghh.notes where resident_id = p_resident_id;

  delete from ghh.outcome_activities
  where outcome_id in (select id from ghh.resident_outcomes where resident_id = p_resident_id);

  delete from ghh.resident_outcomes where resident_id = p_resident_id;
  delete from ghh.documents where resident_id = p_resident_id;
  delete from ghh.residents where id = p_resident_id;

  -- Do not leave the flag set for whatever else shares this transaction.
  perform set_config('ghh.purge_resident_id', '', true);

  return jsonb_build_object(
    'notes', coalesce(array_length(v_note_ids, 1), 0),
    'signedNotes', coalesce(v_signed, 0),
    'addenda', v_addenda,
    'outcomes', v_outcomes,
    'documents', v_documents,
    'documentPaths', to_jsonb(v_files),
    'signaturePaths', to_jsonb(v_signatures)
  );
end;
$$;

comment on function ghh.purge_resident(uuid, uuid) is
  'Permanently removes a resident and every record about them, including signed notes. Audited before deletion. Callers must verify the actor administers the resident''s organisation.';

revoke all on function ghh.purge_resident(uuid, uuid) from public, anon, authenticated;
