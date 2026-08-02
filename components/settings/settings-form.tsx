'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImageUp, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Agency and personal settings, with a live preview of the printed form.
 *
 * The preview matters more than it looks. Branding is chosen by someone who
 * will never see the PDF until an auditor is holding it, so the colours and
 * logo are shown here in the layout they will actually print in rather than as
 * abstract swatches.
 */

const PRESETS: Array<{ name: string; colors: Record<string, string> }> = [
  {
    name: 'Default',
    colors: { navy: '#0f2d45', teal: '#0c9ea6', aqua: '#6fe2df', sand: '#f5f1ea', slate: '#536779' }
  },
  {
    name: 'Forest',
    colors: { navy: '#1b3a2f', teal: '#2f8f6b', aqua: '#96dcc0', sand: '#f2f1e8', slate: '#5d6b63' }
  },
  {
    name: 'Plum',
    colors: { navy: '#3a2340', teal: '#8a4f9e', aqua: '#d9b8e6', sand: '#f6f1f7', slate: '#6b5f70' }
  },
  {
    name: 'Clay',
    colors: { navy: '#4a2c20', teal: '#c0653c', aqua: '#f0c3a8', sand: '#f8f2ec', slate: '#7a675e' }
  }
];

const COLOR_FIELDS = [
  { key: 'navy', label: 'Headings and buttons' },
  { key: 'teal', label: 'Highlights' },
  { key: 'aqua', label: 'Soft background' },
  { key: 'sand', label: 'Page background' },
  { key: 'slate', label: 'Secondary text' }
] as const;

export function SettingsForm({
  canEditAgency,
  initial
}: {
  canEditAgency: boolean;
  initial: {
    fullName: string;
    title: string;
    orgName: string;
    legalName: string;
    medicaidProviderId: string;
    logoUrl: string | null;
    colors: Record<string, string>;
  };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState(initial.fullName);
  const [title, setTitle] = useState(initial.title);
  const [orgName, setOrgName] = useState(initial.orgName);
  const [legalName, setLegalName] = useState(initial.legalName);
  const [providerId, setProviderId] = useState(initial.medicaidProviderId);
  const [logo, setLogo] = useState<string | null>(initial.logoUrl);
  const [colors, setColors] = useState<Record<string, string>>(initial.colors);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function pickLogo(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('That is not an image. Use a PNG, JPG, or SVG.');
      return;
    }
    if (file.size > 250_000) {
      setError('That logo is over 250 KB. A smaller file prints just as well and loads faster.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    const payload: Record<string, unknown> = { fullName, title };
    if (canEditAgency) {
      Object.assign(payload, {
        orgName,
        legalName: legalName || null,
        medicaidProviderId: providerId || null,
        logoDataUrl: logo,
        colors
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="s-org" className={labelClass}>
                  Agency name
                </label>
                <input
                  id="s-org"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="s-legal" className={labelClass}>
                  Legal name <span className="font-normal normal-case">(optional)</span>
                </label>
                <input
                  id="s-legal"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="At Home Family Service, LLC"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-brand-slate">Printed at the top of every form.</p>
              </div>
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
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-semibold text-brand-navy">Logo</h2>
            <p className="mb-4 text-xs text-brand-slate">
              Appears in the app and at the top of every printed form. Yours only — nobody else&apos;s
              agency sees it.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickLogo(f);
              }}
            />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-40 items-center justify-center rounded-xl border border-dashed border-brand-navy/25 bg-white px-2">
                {logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logo} alt="Your logo" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-brand-slate">No logo</span>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <ImageUp className="h-4 w-4" />
                {logo ? 'Replace' : 'Upload'}
              </Button>

              {logo ? (
                <button
                  type="button"
                  onClick={() => setLogo(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-status-missing"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-brand-navy">Colours</h2>
              <button
                type="button"
                onClick={() => setColors(PRESETS[0].colors)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setColors(preset.colors)}
                  className="flex items-center gap-2 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
                >
                  <span className="flex gap-0.5">
                    {['navy', 'teal', 'aqua'].map((k) => (
                      <span
                        key={k}
                        className="h-3 w-3 rounded-full"
                        style={{ background: preset.colors[k] }}
                      />
                    ))}
                  </span>
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors[field.key] ?? '#000000'}
                    onChange={(e) => setColors({ ...colors, [field.key]: e.target.value })}
                    aria-label={field.label}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded border border-brand-navy/15 bg-white"
                  />
                  <span className="text-xs text-brand-navy">{field.label}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* The whole point of this screen: see it before an auditor does. */}
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-brand-navy">
              How the printed form will look
            </h2>
            <p className="mb-4 text-xs text-brand-slate">
              The top of Form #680, with your logo and colours.
            </p>

            <div
              className="rounded-xl border p-5"
              style={{ borderColor: `${colors.slate}40`, background: '#ffffff' }}
            >
              <div className="mb-3 flex items-center gap-3">
                {logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logo} alt="" className="h-8 w-auto object-contain" />
                ) : null}
                <span className="text-sm font-bold" style={{ color: colors.navy }}>
                  {legalName || orgName || 'Your Agency, LLC'}
                </span>
              </div>

              <p
                className="mb-3 text-center text-base font-bold"
                style={{ color: colors.navy }}
              >
                Daily Progress Note
              </p>

              <div
                className="mb-3 grid grid-cols-2 gap-2 border-y py-2 text-xs"
                style={{ borderColor: `${colors.slate}30`, color: colors.slate }}
              >
                <span>
                  Individual&apos;s Name: <span style={{ color: colors.navy }}>Alexander Rivera</span>
                </span>
                <span>
                  Medicaid: <span style={{ color: colors.navy }}>••••••••</span>
                </span>
              </div>

              <p className="text-xs leading-relaxed" style={{ color: colors.navy }}>
                Alex was observed asleep and resting comfortably at the start of the shift. Staff
                supported Alex in completing his morning routine with verbal prompts. Alex chose to
                walk to the corner shop, where he paid for his own item. There were no problems or
                concerns during shift.
              </p>

              <div
                className="mt-4 border-t pt-2 text-[10px]"
                style={{ borderColor: `${colors.slate}30`, color: colors.slate }}
              >
                Daily Progress Notes Form #680
              </div>
            </div>
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
