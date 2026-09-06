'use client';

import { useRef, useState } from 'react';
import { ImageUp, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * The agency's printed identity, edited in one place.
 *
 * Used by both Settings and signup so the two cannot drift. They did drift
 * once already in the other direction: Settings rendered a preview using the
 * org's own name while the PDF routes printed a hardcoded one, so a customer
 * could see the right thing on screen and file the wrong thing with Medicaid.
 * Everything shown here is a field the renderer actually reads.
 */

export const COLOR_PRESETS: Array<{ name: string; colors: Record<string, string> }> = [
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

export type BrandingValues = {
  orgName: string;
  legalName: string;
  letterheadLine: string;
  addressLine: string;
  footerLine: string;
  colors: Record<string, string>;
  /** What to show in the preview: a data URL, the logo route, or nothing. */
  logoPreview: string | null;
  /** Set once a file has been uploaded to the private bucket. */
  logoPath: string | null;
  /** A logo stored inline before the bucket existed, sent back unchanged. */
  logoInline: string | null;
  /**
   * A file chosen before there was a session to upload it with.
   *
   * Sign-up picks the logo before the workspace exists, so the upload has to
   * wait until the account is created and signed in. Settings uploads
   * immediately and never sets this.
   */
  logoFile: File | null;
};

export function emptyBranding(): BrandingValues {
  return {
    orgName: '',
    legalName: '',
    letterheadLine: '',
    addressLine: '',
    footerLine: '',
    colors: { ...COLOR_PRESETS[0].colors },
    logoPreview: null,
    logoPath: null,
    logoInline: null,
    logoFile: null
  };
}

/**
 * Upload a logo that was chosen before there was a session.
 *
 * Returns the storage path, or null if there was nothing to send or the upload
 * failed. Sign-up treats a failure as non-fatal: the workspace exists either
 * way and the logo can be set in Settings.
 */
export async function uploadPendingLogo(v: BrandingValues): Promise<string | null> {
  if (!v.logoFile) return null;
  const file = v.logoFile;

  try {
    const targetRes = await fetch('/api/branding/logo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      })
    });
    const target = await targetRes.json().catch(() => ({}));
    if (!targetRes.ok) return null;

    const put = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/ghh-documents/${target.path}?token=${encodeURIComponent(target.token)}`,
      { method: 'PUT', headers: { 'content-type': file.type }, body: file }
    );

    return put.ok ? (target.path as string) : null;
  } catch {
    return null;
  }
}

/** The payload shape /api/settings expects. */
export function brandingPayload(v: BrandingValues): Record<string, unknown> {
  return {
    orgName: v.orgName,
    legalName: v.legalName || null,
    letterheadLine: v.letterheadLine || null,
    addressLine: v.addressLine || null,
    footerLine: v.footerLine || null,
    logoPath: v.logoPath,
    logoDataUrl: v.logoInline,
    colors: v.colors
  };
}

const inputClass =
  'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

/** 250 KB prints at letterhead size and still loads on a phone. */
const MAX_LOGO_BYTES = 250_000;

export function LogoPicker({
  value,
  onChange,
  onError,
  deferUpload = false
}: {
  value: BrandingValues;
  onChange: (next: BrandingValues) => void;
  onError: (message: string | null) => void;
  /**
   * Hold the file instead of uploading it now.
   *
   * Sign-up has no session yet, so requesting an upload target would be
   * rejected. The file is kept and sent by `uploadPendingLogo` once the
   * account exists.
   */
  deferUpload?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    onError(null);

    // SVG is excluded on purpose — it is a document format that can carry
    // script, and this ends up in an <img> on every page and every PDF.
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      onError('That is not an image. Use a PNG, JPG, GIF or WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      onError('That logo is over 250 KB. A smaller file prints just as well and loads faster.');
      return;
    }

    if (deferUpload) {
      const reader = new FileReader();
      reader.onload = () =>
        onChange({
          ...value,
          logoFile: file,
          logoPath: null,
          logoInline: null,
          logoPreview: reader.result as string
        });
      reader.readAsDataURL(file);
      return;
    }

    setBusy(true);
    try {
      const targetRes = await fetch('/api/branding/logo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size
        })
      });
      const target = await targetRes.json().catch(() => ({}));
      if (!targetRes.ok) {
        onError(target.error ?? 'Could not prepare the upload.');
        return;
      }

      // Supabase signed uploads accept a plain PUT with the token as the
      // authorization; no client library needed on this path.
      const put = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/ghh-documents/${target.path}?token=${encodeURIComponent(target.token)}`,
        {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file
        }
      );

      if (!put.ok) {
        onError('The logo did not upload. Check your connection and try again.');
        return;
      }

      // Preview from the local file rather than the route: the path is not
      // saved to the org until the form is submitted, so the route would still
      // be serving the previous logo.
      const reader = new FileReader();
      reader.onload = () =>
        onChange({
          ...value,
          logoPath: target.path,
          logoInline: null,
          logoFile: null,
          logoPreview: reader.result as string
        });
      reader.readAsDataURL(file);
    } catch {
      onError('Could not reach the server to upload the logo.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-xl border border-dashed border-brand-navy/25 bg-white px-2">
          {value.logoPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={value.logoPreview}
              alt="Your logo"
              className="max-h-12 max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-brand-slate">No logo</span>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
          {busy ? 'Uploading…' : value.logoPreview ? 'Replace' : 'Upload'}
        </Button>

        {value.logoPreview ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                logoPreview: null,
                logoPath: null,
                logoInline: null,
                logoFile: null
              })
            }
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-status-missing"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The agency name and the lines that print around it. */
export function IdentityFields({
  value,
  onChange
}: {
  value: BrandingValues;
  onChange: (next: BrandingValues) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="b-org" className={labelClass}>
          Agency name
        </label>
        <input
          id="b-org"
          value={value.orgName}
          onChange={(e) => onChange({ ...value, orgName: e.target.value })}
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-brand-slate">What staff see inside the app.</p>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="b-legal" className={labelClass}>
          Legal name <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="b-legal"
          value={value.legalName}
          onChange={(e) => onChange({ ...value, legalName: e.target.value })}
          placeholder="Your Agency, LLC"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-brand-slate">
          Printed at the top of every form. This is the name a Medicaid reviewer reads, so use the
          one on your licence.
        </p>
      </div>

      <div>
        <label htmlFor="b-letterhead" className={labelClass}>
          Letterhead line <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="b-letterhead"
          value={value.letterheadLine}
          onChange={(e) => onChange({ ...value, letterheadLine: e.target.value })}
          placeholder="Residential Support Program"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-brand-slate">A division or programme, under the name.</p>
      </div>

      <div>
        <label htmlFor="b-address" className={labelClass}>
          Address <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="b-address"
          value={value.addressLine}
          onChange={(e) => onChange({ ...value, addressLine: e.target.value })}
          placeholder="19 Example Road, Richmond, VA 23220"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-brand-slate">One line, printed under the letterhead.</p>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="b-footer" className={labelClass}>
          Footer line <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="b-footer"
          value={value.footerLine}
          onChange={(e) => onChange({ ...value, footerLine: e.target.value })}
          placeholder="Provider #123456"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-brand-slate">
          Printed beneath the form number. The form number itself stays — it identifies the
          Virginia document.
        </p>
      </div>
    </div>
  );
}

export function ColorFields({
  value,
  onChange
}: {
  value: BrandingValues;
  onChange: (next: BrandingValues) => void;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => onChange({ ...value, colors: { ...preset.colors } })}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
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
          <label key={field.key} className="flex min-h-11 items-center gap-3">
            <input
              type="color"
              value={value.colors[field.key] ?? '#000000'}
              onChange={(e) =>
                onChange({ ...value, colors: { ...value.colors, [field.key]: e.target.value } })
              }
              aria-label={field.label}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-brand-navy/15 bg-white"
            />
            <span className="text-xs text-brand-navy">{field.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

export function ResetColorsButton({
  value,
  onChange
}: {
  value: BrandingValues;
  onChange: (next: BrandingValues) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange({ ...value, colors: { ...COLOR_PRESETS[0].colors } })}
      className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Reset
    </button>
  );
}

/**
 * The top of Form #680 as it will actually print.
 *
 * Every field here is one the PDF renderer reads, and nothing here is a
 * constant. Branding is chosen by someone who will not see a real PDF until an
 * auditor is holding one, so this is the only chance to catch a wrong name.
 */
export function FormPreview({ value }: { value: BrandingValues }) {
  const { colors } = value;

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: `${colors.slate}40`, background: '#ffffff' }}
    >
      <div className="mb-3 flex items-center gap-3">
        {value.logoPreview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={value.logoPreview} alt="" className="h-8 w-auto object-contain" />
        ) : null}
        <div>
          <span className="block text-sm font-bold" style={{ color: colors.navy }}>
            {value.legalName || value.orgName || 'Your Agency, LLC'}
          </span>
          {value.letterheadLine ? (
            <span className="block text-xs" style={{ color: colors.navy }}>
              {value.letterheadLine}
            </span>
          ) : null}
          {value.addressLine ? (
            <span className="block text-[10px]" style={{ color: colors.slate }}>
              {value.addressLine}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mb-3 text-center text-base font-bold" style={{ color: colors.navy }}>
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
        Alex was observed asleep and resting comfortably at the start of the shift. Staff supported
        Alex in completing his morning routine with verbal prompts. Alex chose to walk to the corner
        shop, where he paid for his own item. There were no problems or concerns during shift.
      </p>

      <div
        className="mt-4 border-t pt-2 text-[10px]"
        style={{ borderColor: `${colors.slate}30`, color: colors.slate }}
      >
        <div>Daily Progress Notes Form #680</div>
        {value.footerLine ? <div>{value.footerLine}</div> : null}
      </div>
    </div>
  );
}
