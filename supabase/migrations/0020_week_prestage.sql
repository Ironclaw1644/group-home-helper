-- Pre-staging a week of notes.
--
-- The customer's problem is time: about ten minutes per note, several notes a
-- shift. Most of that is not writing, it is arriving — finding the person,
-- finding the shift, waiting for an empty form, and re-entering the same
-- morning routine that happened yesterday and the day before. So a supervisor
-- can prepare the coming week in one action: an unsigned draft for every
-- resident on every day, already carrying that person's usual pattern, waiting
-- to be corrected and signed in well under a minute.
--
-- Prepared notes are a convenience, never a claim. Three things make that true,
-- and two of them are here in the database rather than in the app, because the
-- app is not what an auditor trusts:
--
--   1. A prepared note is a draft. Nothing here can sign one. `status` still
--      has to be moved to 'signed' by a person, through the same path as any
--      other note, and 0003's trigger still forces `locked` and the full
--      attribution block when that happens.
--
--   2. A note cannot be signed before the day it documents. Pre-staging creates
--      notes for dates that have not happened yet, so without this someone
--      could open Friday's draft on Monday and attest to a shift nobody has
--      worked. Enforced against the agency's own timezone, since that is what
--      decides what "today" means on a Medicaid service date.
--
--   3. The signing timestamp is taken from the database clock at the moment of
--      signing. It was already server-side; it is now not the caller's to
--      supply at all, so a prepared note cannot carry a prepared signature time.
--
-- What pre-staging fills in is the structured chip data — the routine. What it
-- must never fill in is the ISP outcome documentation: "worked on" and "not
-- this shift" are clinical claims about a person's service plan, and a machine
-- guessing them from last week is the same defect as the old editor
-- pre-selecting "Not this shift", just further from where anyone would look for
-- it. Outcomes are left unanswered, which is enforced above this layer by
-- `note_outcomes` simply having no row until a DSP taps one.

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------

alter table ghh.notes
  -- Set when the note was prepared rather than opened by hand. Also what tells
  -- the editor to show the "check this before signing" banner.
  add column if not exists prestaged_at timestamptz null,
  add column if not exists prestaged_by uuid null references ghh.profiles(id) on delete set null,
  -- Set when a DSP has looked at the prepared entries and said they are right.
  -- Signing is blocked until then, so a prepared note cannot become a signed
  -- record without a human affirming what is in it.
  add column if not exists prestage_confirmed_at timestamptz null,
  add column if not exists prestage_confirmed_by uuid null references ghh.profiles(id) on delete set null;

comment on column ghh.notes.prestaged_at is
  'Set when this draft was prepared ahead of the shift from the resident''s usual pattern. Never implies anything was verified.';
comment on column ghh.notes.prestage_confirmed_at is
  'Set when a DSP confirmed the prepared entries describe the shift they actually worked.';

create index if not exists notes_prestaged_unconfirmed
  on ghh.notes (home_id, service_date)
  where prestaged_at is not null and prestage_confirmed_at is null;

-- ---------------------------------------------------------------------------
-- A note cannot be signed before the day it documents
-- ---------------------------------------------------------------------------

-- "Today" is the agency's today. A 7PM-7AM shift written at 22:00 Pacific
-- belongs to that day where the agency is, not where the server is.
create or replace function ghh.org_today(p_org_id uuid)
returns date
language sql
stable
as $$
  select (now() at time zone coalesce(
            (select o.timezone from ghh.organizations o where o.id = p_org_id),
            'America/New_York'))::date;
$$;

comment on function ghh.org_today(uuid) is
  'Today''s date in the agency''s own timezone. What a Medicaid service date is measured against.';

create or replace function ghh.enforce_service_date_reached()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'signed' and new.service_date > ghh.org_today(new.org_id) then
    raise exception
      'note % documents %, which has not happened yet; it cannot be signed before then',
      new.id, new.service_date
      using errcode = 'check_violation',
            hint = 'Prepared notes for later in the week open on the day they cover.';
  end if;
  return new;
end;
$$;

-- Both doors. The update path is how the app signs; the insert path is how a
-- privileged connection could otherwise write a signed row for next Friday
-- without ever passing the update trigger.
drop trigger if exists notes_no_signing_ahead_of_time on ghh.notes;
create trigger notes_no_signing_ahead_of_time
  before insert or update on ghh.notes
  for each row execute function ghh.enforce_service_date_reached();

-- ---------------------------------------------------------------------------
-- The signing timestamp is the database's, not the caller's
-- ---------------------------------------------------------------------------

-- Identical to 0003 except for the two marked lines. Restated in full rather
-- than patched, so the whole rule can be read in one place.
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

    -- CHANGED: a prepared note has to be confirmed by the person signing it.
    -- Pre-staging fills a draft in from last week's pattern; without this a
    -- guess could become an attested record untouched.
    if new.prestaged_at is not null and new.prestage_confirmed_at is null then
      raise exception
        'note % was prepared in advance and has not been confirmed; check the entries first', new.id
        using errcode = 'check_violation';
    end if;

    -- Signing always locks. Callers do not get to opt out.
    new.locked := true;
    -- CHANGED: was coalesce(new.signed_at, now()). The signing time is the
    -- database's own clock, so it cannot be supplied, prepared, or backdated.
    new.signed_at := now();
  end if;

  -- A signed note can never be walked back to a draft.
  if old.status = 'signed' and new.status = 'draft' then
    raise exception 'note % cannot be reverted to draft', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The confirmation is written by the DSP's own session, through the existing
-- notes update policy, which already requires the note to be theirs and
-- unlocked. `prestaged_at` and `prestaged_by` are deliberately not here: only
-- the server-side pre-stage route sets those, with the service key.
grant update (prestage_confirmed_at, prestage_confirmed_by) on ghh.notes to authenticated;
