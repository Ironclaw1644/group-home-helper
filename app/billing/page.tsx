import { Check, Sparkles } from 'lucide-react';
import { requireSupervisor } from '@/lib/auth/session';
import { getBillingState, getPlanPrice, stripeConfigured } from '@/lib/billing/stripe';
import { AppShell } from '@/components/app-shell';
import { BillingPanel } from '@/components/billing/billing-panel';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { formatServiceDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; tone: 'signed' | 'draft' | 'missing' | 'neutral' }> = {
  active: { text: 'Active', tone: 'signed' },
  trialing: { text: 'Trial', tone: 'signed' },
  past_due: { text: 'Payment failed', tone: 'draft' },
  canceled: { text: 'Canceled', tone: 'missing' },
  none: { text: 'No plan', tone: 'neutral' }
};

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ started?: string }>;
}) {
  const session = await requireSupervisor();
  const params = await searchParams;

  const [billing, price] = await Promise.all([
    getBillingState(session.profile.orgId),
    getPlanPrice(session.profile.orgId)
  ]);

  const status = billing.isPlatformOwner
    ? { text: 'Included', tone: 'signed' as const }
    : (STATUS_LABEL[billing.status] ?? STATUS_LABEL.none);
  const onPlan = billing.status === 'active' || billing.status === 'trialing';

  return (
    <AppShell session={session}>
      <PageHeader title="Billing" subtitle="The note assistant subscription" />

      {params.started ? (
        <div className="mb-4">
          <Alert tone="info" title="Thanks — that went through">
            <p>
              Stripe confirms subscriptions in the background, so it can take a few seconds to
              show as active here. Refresh if it still says otherwise.
            </p>
          </Alert>
        </div>
      ) : null}

      {billing.status === 'past_due' ? (
        <div className="mb-4">
          <Alert tone="warning" title="A payment did not go through">
            <p>
              The assistant keeps working until{' '}
              {billing.periodEnd ? formatServiceDate(billing.periodEnd.slice(0, 10)) : 'the end of the period'}.
              Update the card to avoid interruption — everything else in the app is unaffected
              either way.
            </p>
          </Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-brand-navy">Note assistant</h2>
          <Badge tone={status.tone}>{status.text}</Badge>
          {price ? (
            <span className="ml-auto text-sm font-semibold text-brand-navy">
              {price.amount}
              <span className="font-normal text-brand-slate">/{price.interval}</span>
            </span>
          ) : null}
        </div>

        {billing.isPlatformOwner ? (
          <p className="mb-4 text-sm text-brand-slate">
            Unlimited drafts, no subscription, no expiry.
          </p>
        ) : onPlan ? (
          <p className="mb-4 text-sm text-brand-slate">
            {billing.periodEnd
              ? `Renews ${formatServiceDate(billing.periodEnd.slice(0, 10))}.`
              : 'Your plan is active.'}
          </p>
        ) : (
          <div className="mb-4">
            <p className="text-sm text-brand-slate">
              {billing.freeRemaining > 0
                ? `${billing.freeRemaining} of ${billing.freeAllowance} free drafts left.`
                : `All ${billing.freeAllowance} free drafts have been used.`}
            </p>
          </div>
        )}

        <BillingPanel hasSubscription={billing.hasCustomer} configured={stripeConfigured()} />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <Sparkles className="h-4 w-4 text-brand-teal" />
          What the subscription covers
        </h2>
        <ul className="space-y-1.5 text-sm text-brand-navy">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-signed" />
            Writing a note from the entries a DSP tapped
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-signed" />
            Generating training examples on the demo resident
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-brand-navy">
          What keeps working without it
        </h2>
        <p className="mb-3 text-sm text-brand-slate">
          Everything that makes this a record-keeping system. A lapsed subscription must never
          stop a house from documenting a shift — an undocumented shift cannot be billed, and the
          resident is left with no record of their care that day.
        </p>
        <ul className="grid gap-1.5 text-sm text-brand-navy sm:grid-cols-2">
          {[
            'The daily roster',
            'Writing and editing notes',
            'Signing, and the lock that follows',
            'Duplicate-note detection',
            // Not "Form #680 PDFs". This list is shown to every agency on the
            // install and only some of them file in Virginia.
            'Printed PDFs of your state’s form',
            'Batch export for audits',
            'Resident roster management',
            'The access audit log'
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-signed" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}
