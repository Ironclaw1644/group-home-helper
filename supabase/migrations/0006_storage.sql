-- Private bucket for signature images.
--
-- Signatures are PHI-adjacent and identify staff. The bucket is private with
-- no client-side policies at all: uploads happen server-side during signing,
-- and the PDF renderer fetches them with the service role. Nothing in the
-- browser can enumerate or read this bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 524288, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies are created for `authenticated` or `anon`. With RLS on
-- storage.objects and no matching policy, both roles are denied by default,
-- which is what we want; service_role bypasses RLS.
