'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, UserMinus } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { StaffMember } from '@/lib/onboarding/invites';

/**
 * One staff member, with the control to remove or restore their access.
 *
 * "Remove" deactivates. Every note they signed carries their name, and the
 * audit log records what they opened — deleting the profile would orphan both.
 * A deactivated account cannot sign in at all, which is the thing a supervisor
 * actually wants when someone leaves.
 */
export function StaffRow({
  member,
  isYou,
  canManage
}: {
  member: StaffMember;
  isYou: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(method: 'DELETE' | 'PATCH') {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/staff/${member.id}`, { method });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirm(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not change access.');
      return;
    }
    router.refresh();
  }

  return (
    <li className="border-b border-brand-navy/5 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            member.active
              ? 'text-sm font-medium text-brand-navy'
              : 'text-sm font-medium text-brand-slate line-through'
          }
        >
          {member.fullName}
        </span>
        <span className="text-xs text-brand-slate">{member.title}</span>

        <span className="ml-auto flex items-center gap-2">
          {isYou ? <Badge tone="info">You</Badge> : null}
          <Badge tone={member.active ? 'signed' : 'missing'}>
            {member.active ? member.role : 'no access'}
          </Badge>

          {canManage && !isYou ? (
            member.active ? (
              confirm ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => act('DELETE')}
                    disabled={busy}
                    className="text-xs font-semibold text-status-missing hover:underline"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(false)}
                    className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  title="Remove access"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-slate hover:text-status-missing"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Remove
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => act('PATCH')}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </button>
            )
          ) : null}
        </span>
      </div>

      {confirm ? (
        <p className="mt-1 text-xs text-brand-slate">
          They will not be able to sign in. Notes they already signed are unaffected.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs font-medium text-status-missing">{error}</p> : null}
    </li>
  );
}
