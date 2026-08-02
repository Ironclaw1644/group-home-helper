import { requireSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { SettingsForm } from '@/components/settings/settings-form';
import { PageHeader } from '@/components/ui';
import { DEFAULT_BRAND, parseBranding } from '@/lib/branding/theme';

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
          orgName: org?.name ?? '',
          legalName: org?.legal_name ?? '',
          medicaidProviderId: org?.medicaid_provider_id ?? '',
          logoUrl: tokens.logoUrl,
          colors: {
            navy: tokens.navy,
            teal: tokens.teal,
            aqua: tokens.aqua,
            sand: tokens.sand,
            slate: tokens.slate
          }
        }}
      />
    </AppShell>
  );
}
