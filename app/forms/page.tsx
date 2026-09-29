import { requireSupervisor, orgTimeZone } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';
import { PageHeader } from '@/components/ui';
import { FormImporter } from '@/components/importer/form-importer';
import { SetupSteps } from '@/components/onboarding/setup-steps';
import { getOrgFormStatus } from '@/lib/importer/templates';
import { loadPrintIdentity } from '@/lib/branding/print';
import { formatServiceDate, todayInTimeZone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * "Your form" — use the paper form the agency already fills in.
 *
 * Supervisors and admins only: changing the form changes what every DSP
 * writes on from their next note.
 */
export default async function FormsPage({
  searchParams
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const session = await requireSupervisor();
  const { onboarding } = await searchParams;
  const orgId = session.profile.orgId;

  const [status, identity, tz] = await Promise.all([
    getOrgFormStatus(orgId),
    loadPrintIdentity(orgId),
    orgTimeZone()
  ]);

  return (
    <AppShell session={session}>
      <PageHeader
        title={onboarding ? 'Start with your own form' : 'Your form'}
        subtitle={
          status.isOwnForm
            ? `Staff write on ${status.current.name}.`
            : `Staff write on FlipBrief's standard note (${status.current.name}) until you add yours.`
        }
      />
      <div className="mx-auto max-w-3xl">
        {onboarding === '1' ? <SetupSteps current="form" /> : null}
        <FormImporter
          current={{
            name: status.current.name,
            isOwnForm: status.isOwnForm,
            confirmedAt: status.confirmedAt,
            confirmedBy: status.confirmedBy
          }}
          orgLine={identity.orgLine}
          providerId={identity.providerId ?? ''}
          signerName={session.profile.fullName}
          signerTitle={session.profile.title}
          todayLabel={formatServiceDate(todayInTimeZone(tz))}
          onboarding={onboarding === '1'}
        />
      </div>
    </AppShell>
  );
}
