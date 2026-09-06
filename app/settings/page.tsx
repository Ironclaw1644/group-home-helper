import { requireSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { SettingsForm } from '@/components/settings/settings-form';
import { PageHeader } from '@/components/ui';
import { parseBranding } from '@/lib/branding/theme';
import { parsePrintFields } from '@/lib/branding/print';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('name, legal_name, medicaid_provider_id, branding')
    .eq('id', session.profile.orgId)
    .maybeSingle();

  const tokens = parseBranding(org?.branding);
  const print = parsePrintFields(org?.branding);

  return (
    <AppShell session={session}>
      <PageHeader
        title="Settings"
        subtitle="Your details, and how your agency appears on every form"
      />

      <SettingsForm
        canEditAgency={isSupervisor(session.profile)}
        initial={{
          fullName: session.profile.fullName,
          title: session.profile.title,
          medicaidProviderId: org?.medicaid_provider_id ?? '',
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
