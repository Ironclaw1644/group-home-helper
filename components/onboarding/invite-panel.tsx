'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Link2, Loader2, Plus, X } from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import type { Invitation } from '@/lib/onboarding/invites';
import type { StaffRole } from '@/lib/types';

/**
 * Create and manage join links.
 *
 * The code is shown once, at creation, alongside a copy button — after that the
 * list shows only whether a link is still usable. It could display the full
 * code forever, but a screen full of live join codes is a screen worth
 * shoulder-surfing, and a supervisor who loses one can issue another in a tap.
 */
export function InvitePanel({
  homes,
  invitations,
  canInviteAdmin
}: {
  homes: Array<{ id: string; name: string }>;
  invitations: Invitation[];
  canInviteAdmin: boolean;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [homeId, setHomeId] = useState(homes[0]?.id ?? '');
  const [role, setRole] = useState<StaffRole>('dsp');
  const [title, setTitle] = useState('DSP');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onRoleChange(next: StaffRole) {
    setRole(next);
    // The title prints on the signature line, so it should track the role
    // unless someone has deliberately typed something else.
    if (next === 'dsp') setTitle('DSP');
    if (next === 'supervisor') setTitle('Supervisor');
    if (next === 'admin') setTitle('Administrator');
  }

  async function create() {
    setBusy(true);
    setError(null);
    setFreshLink(null);
    setCopied(false);

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          homeId: role === 'dsp' ? homeId : homeId || null,
          role,
          title,
          email: email.trim() || null
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not create the invitation.');
        return;
      }

      setFreshLink(`${window.location.origin}/join/${body.code}`);
      setEmail('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/invitations/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  async function copy() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some in-app browsers.
      // The link is on screen and selectable, so this is not worth an error.
    }
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

  return (
    <div className="space-y-4">
      {freshLink ? (
        <Alert tone="info" title="Invitation ready">
          <p className="text-sm">Send this link to the person joining. It works once per person.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white/70 px-3 py-2 text-xs text-brand-navy">
              {freshLink}
            </code>
            <Button size="sm" variant="ghost" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mt-2 text-xs">
            This is the only time the full link is shown. Issue another if it gets lost.
          </p>
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {open ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-brand-navy">Invite someone</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cancel"
              className="text-brand-slate hover:text-brand-navy"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="invite-role" className={labelClass}>
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => onRoleChange(e.target.value as StaffRole)}
                className={inputClass}
              >
                <option value="dsp">DSP — writes notes for their house</option>
                <option value="supervisor">Supervisor — sees every house, can add residents</option>
                {canInviteAdmin ? <option value="admin">Administrator — full access</option> : null}
              </select>
            </div>

            <div>
              <label htmlFor="invite-title" className={labelClass}>
                Title on the signature line
              </label>
              <input
                id="invite-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="invite-home" className={labelClass}>
                House
              </label>
              <select
                id="invite-home"
                value={homeId}
                onChange={(e) => setHomeId(e.target.value)}
                className={inputClass}
              >
                {homes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="invite-email" className={labelClass}>
                Lock to an email <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Anyone with the link"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-brand-slate">
                Set this and only that address can use the link, once.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={create} disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create the link
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite staff
        </Button>
      )}

      {invitations.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-brand-navy">Outstanding invitations</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-2 border-b border-brand-navy/5 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-sm font-medium text-brand-navy">{inv.title}</span>
                <span className="text-xs text-brand-slate">
                  {inv.email ?? 'anyone with the link'}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {inv.usable ? (
                    <Badge tone="signed">
                      {inv.uses}/{inv.maxUses} used
                    </Badge>
                  ) : (
                    <Badge tone="missing">{inv.revoked ? 'Revoked' : 'Expired'}</Badge>
                  )}
                  {inv.usable ? (
                    <button
                      type="button"
                      onClick={() => revoke(inv.id)}
                      className="text-xs font-semibold text-brand-slate hover:text-status-missing"
                    >
                      Revoke
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
