'use client';

import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, Button } from '@/components/ui';

/**
 * Start or manage the subscription.
 *
 * Both actions hand off to Stripe-hosted pages. Card details never touch this
 * app, which keeps the whole of PCI scope on Stripe's side of the line.
 */
export function BillingPanel({
  hasSubscription,
  configured
}: {
  hasSubscription: boolean;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(path, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.url) {
        setError(body.error ?? 'Could not reach Stripe. Try again.');
        setBusy(false);
        return;
      }

      // Full navigation, not a router push — the destination is Stripe's.
      window.location.href = body.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <Alert tone="warning" title="Billing is not set up yet">
        <p>
          An administrator needs to add the Stripe keys before subscriptions can be started.
          Everything else in the app works as normal.
        </p>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {hasSubscription ? (
        <Button variant="ghost" onClick={() => go('/api/billing/portal')} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Manage billing
        </Button>
      ) : (
        <Button onClick={() => go('/api/billing/checkout')} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Subscribe
        </Button>
      )}

      <p className="text-xs text-brand-slate">
        Payment is handled entirely by Stripe. Card details never reach this app.
      </p>
    </div>
  );
}
