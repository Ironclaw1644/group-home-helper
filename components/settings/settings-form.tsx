'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Save } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import {
  brandingPayload,
  ColorFields,
  FormPreview,
  IdentityFields,
  LogoPicker,
  ResetColorsButton,
  type BrandingValues
} from '@/components/branding/branding-editor';

/**
 * Agency and personal settings, with a live preview of the printed form.
 *
 * The preview matters more than it looks. Branding is chosen by someone who
 * will never see the PDF until an auditor is holding it, so the colours, logo
 * and letterhead are shown here in the layout they will actually print in
 * rather than as abstract swatches — and every field the preview shows is one
 * the renderer really reads.
 */
export function SettingsForm({
  canEditAgency,
  initial
}: {
  canEditAgency: boolean;
  initial: {
    fullName: string;
    title: string;
    medicaidProviderId: string;
    branding: BrandingValues;
  };
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initial.fullName);
  const [title, setTitle] = useState(initial.title);
  const [providerId, setProviderId] = useState(initial.medicaidProviderId);
  const [branding, setBranding] = useState<BrandingValues>(initial.branding);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    const payload: Record<string, unknown> = { fullName, title };
    if (canEditAgency) {
      Object.assign(payload, brandingPayload(branding), {
        medicaidProviderId: providerId || null
      });
    }

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not save.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            Saved. Reload any open tabs to see the new look.
          </span>
        </Alert>
      ) : null}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-brand-navy">Your own details</h2>
        <p className="mb-4 text-xs text-brand-slate">
          {canEditAgency
            ? 'The person signing notes — not the agency. Agency name and logo are below.'
            : 'The person signing notes, not the agency.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-name" className={labelClass}>
              Your full name
            </label>
            <input
              id="s-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-brand-slate">
              Prints on the signature line of every note you sign.
            </p>
          </div>
          <div>
            <label htmlFor="s-title" className={labelClass}>
              Your title
            </label>
            <input
              id="s-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="DSP"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-brand-slate">
              Your job title, e.g. DSP or Supervisor.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-brand-slate">
          Changing these does not alter notes you have already signed — those keep the name and
          title as they were at signing, which is what makes them a record.
        </p>
      </Card>

      {canEditAgency ? (
        <>
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-brand-navy">Your agency</h2>
            <IdentityFields value={branding} onChange={setBranding} />

            <div className="mt-4 sm:w-1/2">
              <label htmlFor="s-provider" className={labelClass}>
                Medicaid provider ID <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="s-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={inputClass}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-semibold text-brand-navy">Logo</h2>
            <p className="mb-4 text-xs text-brand-slate">
              Appears in the app and at the top of every printed form. Yours only — nobody else&apos;s
              agency sees it, and you see nobody else&apos;s.
            </p>
            <LogoPicker value={branding} onChange={setBranding} onError={setError} />
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-brand-navy">Colours</h2>
              <ResetColorsButton value={branding} onChange={setBranding} />
            </div>
            <ColorFields value={branding} onChange={setBranding} />
          </Card>

          {/* The whole point of this screen: see it before an auditor does. */}
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-brand-navy">
              How the printed form will look
            </h2>
            <p className="mb-4 text-xs text-brand-slate">
              The top of Form #680, with your name, logo and colours.
            </p>
            <FormPreview value={branding} />
          </Card>
        </>
      ) : (
        <Alert tone="info" title="Agency settings are not on this account">
          <p>
            The agency name, logo and colours are changed by a supervisor or administrator. The
            fields above are your own name and title only — putting the agency name there would
            print it on your signature line.
          </p>
        </Alert>
      )}

      <Button onClick={save} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save settings
      </Button>
    </div>
  );
}
