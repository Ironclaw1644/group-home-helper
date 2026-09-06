-- Private bucket for signature images.
--
-- Signatures are PHI-adjacent and identify staff. The bucket is private with
-- no client-side policies at all: uploads happen server-side during signing,
-- and the PDF renderer fetches them with the service role. Nothing in the
-- browser can enumerate or read this bucket.
--
-- CORRECTED. This file created a bucket named `signatures`, but the code has
-- always written to and read from `ghh-signatures`
-- (app/api/notes/[id]/sign/route.ts, lib/pdf/assets.ts) — the real bucket was
-- created out of band and this migration was dead. A fresh database built from
-- this repository produced an app that could not store a signature. The name
-- below is the one production actually has, and matches what was applied on
-- 2026-07-29 as `ghh_0006_signature_storage`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ghh-signatures', 'ghh-signatures', false, 524288, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies are created for `authenticated` or `anon`. With RLS on
-- storage.objects and no matching policy, both roles are denied by default,
-- which is what we want; service_role bypasses RLS.
