'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { FREE_ALLOWANCE } from '@/lib/billing/plan';
import { Alert, Button, Card } from '@/components/ui';
import type { JurisdictionOption } from '@/lib/jurisdictions';
import {
  brandingPayload,
  ColorFields,
  emptyBranding,
  FormPreview,
  LogoPicker,
  ResetColorsButton,
  uploadPendingLogo,
  type BrandingValues,
  type PreviewForm
} from '@/components/branding/branding-editor';

/**
 * Create a new agency workspace.
 *
 * For a group home that found this on its own. The workspace starts empty —
 * no residents, no other staff — and the person signing up becomes its
 * administrator.
 *
 * Branding is offered here rather than only in Settings because the first
 * thing a new customer does is print a note to see whether this is real, and
 * that note carries their name to a Medicaid file. It is collapsed by default:
 * skipping it prints the agency's own name with no logo, which is correct
 * rather than merely acceptable.
 */
export function SignupForm({ jurisdictions }: { jurisdictions: JurisdictionOption[] }) {
  const router = useRouter();

  const [orgName, setOrgName] = useState('');
  // No default. An agency has to say which state it files under, because the
  // answer decides which legal form its notes print on — and a wrong guess
  // here is another state's document filed with Medicaid.
  const [jurisdiction, setJurisdiction] = useState('');
  const [homeName, setHomeName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showBranding, setShowBranding] = useState(false);
  const [branding, setBranding] = useState<BrandingValues>(emptyBranding());

  // The agency name is typed once, at the top, and flows into the preview.
  const brandingWithName: BrandingValues = { ...branding, orgName };

  // What the chosen state's form is captioned. Null until a state is picked:
  // the preview then shows no title and no form line rather than defaulting to
  // Virginia's, because reading "Form #680" while signing up in Ohio is
  // exactly the confusion this picker exists to end.
  const chosen = jurisdictions.find((j) => j.code === jurisdiction);
  const previewForm: PreviewForm | null = chosen
    ? {
        title: chosen.formTitle,
        formLine: chosen.formLine,
        identityLabels: chosen.identityLabels
      }
    : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgName,
          homeName: homeName.trim() || 'Main House',
          fullName,
          email,
          password,
          // The org's timezone decides what "today" means on the roster, so
          // take it from the browser rather than defaulting everyone to ET.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          jurisdiction
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not create the workspace.');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError('Your workspace was created, but sign-in failed. Try signing in.');
        return;
      }

      // Branding is saved after sign-in, through the same endpoint Settings
      // uses: it needs a session, and there is no second code path to keep in
      // step. A failure here is not fatal — the workspace exists and every
      // field can be set later — so it must not strand someone on this screen.
      if (hasBranding(brandingWithName)) {
        try {
          // The logo was only held until now — there was no session to upload
          // it with while the account did not exist.
          const logoPath = await uploadPendingLogo(brandingWithName);

          await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(brandingPayload({ ...brandingWithName, logoPath }))
          });
        } catch {
          /* Settings can fix this; sign-up should not fail on it. */
        }
      }

      router.replace('/residents');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="orgName" className="field-label">
            Agency name
          </label>
          <input
            id="orgName"
            required
            className="field-input"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Your agency's name"
          />
        </div>

        <div>
          <label htmlFor="homeName" className="field-label">
            First house
          </label>
          <input
            id="homeName"
            className="field-input"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            placeholder="Main House"
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            You can rename it in Settings. Two 12-hour shifts are set up for you.
          </p>
        </div>

        <div>
          <label htmlFor="jurisdiction" className="field-label">
            State you file under
          </label>
          <select
            id="jurisdiction"
            required
            className="field-input"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
          >
            <option value="" disabled>
              Choose your state
            </option>
            {jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-brand-slate">
            This decides which form your notes print on. You can change it in
            Settings; notes you have already signed keep the form they were
            signed on.
          </p>
        </div>

        <div>
          <label htmlFor="fullName" className="field-label">
            Your name
          </label>
          <input
            id="fullName"
            required
            autoComplete="name"
            className="field-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-brand-slate">At least 10 characters.</p>
        </div>

        {/* Optional, and collapsed: five fields is the sign-up, and everything
            below can be set later without losing anything. */}
        <div className="rounded-xl border border-brand-navy/15">
          <button
            type="button"
            onClick={() => setShowBranding((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-brand-navy">
                Brand your printed forms
              </span>
              <span className="block text-xs text-brand-slate">
                Optional — your legal name, logo and colours. Changeable later.
              </span>
            </span>
            {showBranding ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-slate" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-slate" />
            )}
          </button>

          {showBranding ? (
            <div className="space-y-4 border-t border-brand-navy/10 px-3 py-4">
              <div>
                <label htmlFor="su-legal" className="field-label">
                  Legal name
                </label>
                <input
                  id="su-legal"
                  className="field-input"
                  value={branding.legalName}
                  onChange={(e) => setBranding({ ...branding, legalName: e.target.value })}
                  placeholder="Your Agency, LLC"
                />
                <p className="mt-1.5 text-xs text-brand-slate">
                  Printed at the top of every form. Use the name on your licence.
                </p>
              </div>

              <div>
                <label htmlFor="su-letterhead" className="field-label">
                  Letterhead line
                </label>
                <input
                  id="su-letterhead"
                  className="field-input"
                  value={branding.letterheadLine}
                  onChange={(e) => setBranding({ ...branding, letterheadLine: e.target.value })}
                  placeholder="Residential Support Program"
                />
              </div>

              <div>
                <label htmlFor="su-address" className="field-label">
                  Address
                </label>
                <input
                  id="su-address"
                  className="field-input"
                  value={branding.addressLine}
                  onChange={(e) => setBranding({ ...branding, addressLine: e.target.value })}
                  placeholder="19 Example Road, Richmond, VA 23220"
                />
              </div>

              <div>
                <label htmlFor="su-footer" className="field-label">
                  Footer line
                </label>
                <input
                  id="su-footer"
                  className="field-input"
                  value={branding.footerLine}
                  onChange={(e) => setBranding({ ...branding, footerLine: e.target.value })}
                  placeholder="Provider #123456"
                />
              </div>

              <div>
                <span className="field-label">Logo</span>
                <p className="mb-2 text-xs text-brand-slate">
                  Saved to your workspace at the end of sign-up.
                </p>
                <LogoPicker
                  value={branding}
                  onChange={setBranding}
                  onError={setError}
                  deferUpload
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="field-label mb-0">Colours</span>
                  <ResetColorsButton value={branding} onChange={setBranding} />
                </div>
                <ColorFields value={branding} onChange={setBranding} />
              </div>

              <div>
                <span className="field-label">How your form will print</span>
                <FormPreview value={brandingWithName} form={previewForm} />
              </div>
            </div>
          ) : null}
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {busy ? 'Setting things up…' : 'Create the workspace'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-brand-slate">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-teal hover:underline">
          Sign in
        </Link>
      </p>

      {/* What a care administrator wants to know before typing a resident's
          name in. Four claims, each one true of the code as it stands and each
          one checkable — not a disclaimer, and not a promise about the
          roadmap. This paragraph used to tell prospects to go and read the PHI
          section of a README in a private repo. */}
      <div className="mt-5 border-t border-brand-navy/10 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-slate">
          Before you enter resident information
        </p>
        <ul className="space-y-1.5 text-xs leading-relaxed text-brand-slate">
          <li>Your records are visible only to staff you invite. No other agency can see them.</li>
          <li>Every time a record is opened or a form is printed, it is logged with who and when.</li>
          <li>
            A signed note cannot be edited or deleted by anyone, including us. Corrections are added
            as a dated addendum, the way a paper chart works.
          </li>
          <li>
            The first {FREE_ALLOWANCE} assistant drafts are free. Writing, signing, printing and
            exporting notes never require a subscription.
          </li>
        </ul>
      </div>
    </Card>
  );
}

/** True when the person actually filled something in worth saving. */
function hasBranding(v: BrandingValues): boolean {
  return Boolean(
    v.legalName.trim() ||
      v.letterheadLine.trim() ||
      v.addressLine.trim() ||
      v.footerLine.trim() ||
      v.logoFile
  );
}
