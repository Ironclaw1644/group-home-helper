-- Signed notes are immutable.
--
-- A Daily Progress Note is the billing substantiation for a shift. Once a DSP
-- signs it, it becomes part of the record: it is never edited, only appended to
-- via ghh.note_addenda. This is the property an auditor checks first, and it is
-- enforced here in the database rather than in application code so that no
-- route, script, or console session can bypass it.
--
-- These triggers fire for every role, including the owner. That is deliberate:
-- not even a maintenance script or a direct psql session can rewrite a signed
-- note.

-- ---------------------------------------------------------------------------
-- Block edits to a locked note
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_note_immutable()
returns trigger
language plpgsql
as $$
begin
  -- OLD.locked is the gate, not NEW.locked: the signing UPDATE itself flips
  -- false -> true and must be allowed exactly once.
  if old.locked then
    raise exception
      'note % is signed and cannot be modified; add an addendum instead', old.id
      using errcode = 'restrict_violation',
            hint = 'insert into ghh.note_addenda (note_id, body, ...)';
  end if;

  -- Signing must carry a full attribution block. The CHECK constraints cover
  -- presence; this covers coherence.
  if new.status = 'signed' and old.status = 'draft' then
    if new.signed_by is null or new.signature_name is null or new.signature_title is null then
      raise exception 'cannot sign note % without signer, name, and title', new.id
        using errcode = 'not_null_violation';
    end if;
    if new.narrative is null or btrim(new.narrative) = '' then
      raise exception 'cannot sign note % with an empty narrative', new.id
        using errcode = 'check_violation';
    end if;
    -- Signing always locks. Callers do not get to opt out.
    new.locked := true;
    new.signed_at := coalesce(new.signed_at, now());
  end if;

  -- A signed note can never be walked back to a draft.
  if old.status = 'signed' and new.status = 'draft' then
    raise exception 'note % cannot be reverted to draft', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists notes_immutable_when_locked on ghh.notes;
create trigger notes_immutable_when_locked
  before update on ghh.notes
  for each row execute function ghh.enforce_note_immutable();

-- ---------------------------------------------------------------------------
-- Block deletion of a signed note
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_note_undeletable()
returns trigger
language plpgsql
as $$
begin
  if old.locked or old.status = 'signed' then
    raise exception 'note % is signed and cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists notes_no_delete_when_signed on ghh.notes;
create trigger notes_no_delete_when_signed
  before delete on ghh.notes
  for each row execute function ghh.enforce_note_undeletable();

-- ---------------------------------------------------------------------------
-- Addenda are append-only
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_addendum_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'addenda are append-only and cannot be % ', lower(tg_op)
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists note_addenda_no_update on ghh.note_addenda;
create trigger note_addenda_no_update
  before update on ghh.note_addenda
  for each row execute function ghh.enforce_addendum_append_only();

drop trigger if exists note_addenda_no_delete on ghh.note_addenda;
create trigger note_addenda_no_delete
  before delete on ghh.note_addenda
  for each row execute function ghh.enforce_addendum_append_only();

-- ---------------------------------------------------------------------------
-- The audit log is append-only too
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_log_no_update on ghh.audit_log;
create trigger audit_log_no_update
  before update on ghh.audit_log
  for each row execute function ghh.enforce_audit_append_only();

drop trigger if exists audit_log_no_delete on ghh.audit_log;
create trigger audit_log_no_delete
  before delete on ghh.audit_log
  for each row execute function ghh.enforce_audit_append_only();
