import { requireSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { SettingsForm } from '@/components/settings/settings-form';
import { PageHeader } from '@/components/ui';
import { parseBranding } from '@/lib/branding/theme';
import { parsePrintFields } from '@/lib/branding/print';
import { listJurisdictions } from '@/lib/jurisdictions';
import { getTemplateForOrg } from '@/lib/notes/repo';
import { formCaptions } from '@/lib/forms/layout-defaults';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('name, legal_name, medicaid_provider_id, branding, jurisdiction')
    .eq('id', session.profile.orgId)
    .maybeSingle();

  const tokens = parseBranding(org?.branding);
  const print = parsePrintFields(org?.branding);

  const jurisdictions = await listJurisdictions();

  // The preview shows the form this agency actually resolves — its own
  // template if it has one, not merely the global row for its state.
  //
  // Deliberately non-fatal. Settings is where a wrongly-set jurisdiction gets
  // corrected, so an org whose state has no template installed must still be
  // able to open this page and fix it. A missing preview is a worse page; a
  // 500 here would be a trap.
  const previewForm = await getTemplateForOrg(session.profile.orgId)
    .then(formCaptions)
    .catch(() => null);

  return (
    <AppShell session={session}>
      <PageHeader
        title="Settings"
        subtitle="Your details, and how your agency appears on every form"
      />

      <SettingsForm
        canEditAgency={isSupervisor(session.profile)}
        jurisdictions={jurisdictions}
        previewForm={previewForm}
        initial={{
          fullName: session.profile.fullName,
          title: session.profile.title,
          medicaidProviderId: org?.medicaid_provider_id ?? '',
          jurisdiction: org?.jurisdiction ?? '',
          branding: {
            orgName: org?.name ?? '',
            legalName: org?.legal_name ?? '',
            letterheadLine: print.letterhead ?? '',
            addressLine: print.address ?? '',
            footerLine: print.footer ?? '',
            colors: {
              navy: tokens.navy,
              teal: tokens.teal,
              aqua: tokens.aqua,
              sand: tokens.sand,
              slate: tokens.slate
            },
            // A bucket-backed logo is shown through the route that serves this
            // session's own org; an older inline one is already a data URL.
            logoPreview: print.logoPath ? '/api/branding/logo' : tokens.logoUrl,
            logoPath: print.logoPath,
            logoInline: print.logoPath ? null : tokens.logoUrl,
            // Settings always has a session, so a picked file uploads at once.
            logoFile: null
          }
        }}
      />
    </AppShell>
  );
}
