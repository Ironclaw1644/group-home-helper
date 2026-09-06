'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Save } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import type { JurisdictionOption } from '@/lib/jurisdictions';
import {
  brandingPayload,
  ColorFields,
  FormPreview,
  IdentityFields,
  LogoPicker,
  ResetColorsButton,
  type BrandingValues,
  type PreviewForm
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
  jurisdictions,
  previewForm,
  initial
}: {
  canEditAgency: boolean;
  jurisdictions: JurisdictionOption[];
  /** The captions this agency's own form prints, or none if it resolves none. */
  previewForm: PreviewForm | null;
  initial: {
    fullName: string;
    title: string;
    medicaidProviderId: string;
    jurisdiction: string;
    branding: BrandingValues;
  };
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initial.fullName);
  const [title, setTitle] = useState(initial.title);
  const [providerId, setProviderId] = useState(initial.medicaidProviderId);
  const [jurisdiction, setJurisdiction] = useState(initial.jurisdiction);
  const [branding, setBranding] = useState<BrandingValues>(initial.branding);

  // The preview follows the picker, but only after a save has been reloaded:
  // until then the org still files under the old state, and showing the new
  // state's captions would say the change had already taken effect.
  const chosen = jurisdictions.find((j) => j.code === jurisdiction) ?? null;
  const jurisdictionChanged = jurisdiction !== initial.jurisdiction;

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
      // Sent only when it changed. An unchanged value would be a no-op write,
      // but it would also be an audited agency-settings change on every save.
      if (jurisdictionChanged && jurisdiction) payload.jurisdiction = jurisdiction;
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

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
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

              <div>
                <label htmlFor="s-jurisdiction" className={labelClass}>
                  State you file under
                </label>
                <select
                  id="s-jurisdiction"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className={inputClass}
                >
                  {/* Shown only when the org is in a state nobody has authored
                      a form for yet, so the picker never silently reads as
                      some other state. */}
                  {chosen ? null : (
                    <option value={jurisdiction} disabled>
                      {jurisdiction || 'Not set'}
                    </option>
                  )}
                  {jurisdictions.map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {jurisdictionChanged ? (
              <div className="mt-3">
                <Alert tone="warning" title="This changes which form your notes print on">
                  <p>
                    New notes will print {chosen?.name ?? 'the new state'}&apos;s form. Notes you
                    have already signed keep the form they were signed on — they are records, and
                    restyling one after it was filed would change the document without changing
                    what happened.
                  </p>
                </Alert>
              </div>
            ) : (
              <p className="mt-3 text-xs text-brand-slate">
                Decides which form your notes print on. Notes you have already signed keep the
                form they were signed on.
              </p>
            )}
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
              {previewForm
                ? `The top of ${previewForm.formLine}, with your name, logo and colours.`
                : 'The top of your form, with your name, logo and colours.'}
            </p>
            <FormPreview value={branding} form={previewForm} />
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
