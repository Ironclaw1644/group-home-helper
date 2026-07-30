-- How the note was signed: drawn on screen, typed, or an uploaded image.
--
-- An auditor asking "is this a wet signature?" currently has no way to tell
-- from the record. All three are valid e-signatures when paired with the stored
-- attestation, but which one was used is part of what makes the record
-- complete, so it is captured rather than inferred.
alter table ghh.notes
  add column if not exists signature_method text null
  check (signature_method is null or signature_method in ('drawn', 'typed', 'uploaded'));

comment on column ghh.notes.signature_method is
  'drawn | typed | uploaded. Null on notes signed before this was recorded.';
