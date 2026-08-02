'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { VIRGINIA_OUTCOME_LIBRARY } from '@/lib/outcomes/virginia-library';

const LENS_LABEL: Record<string, string> = {
  independence: 'Independence',
  integration: 'Integration',
  quality_of_life: 'Quality of life'
};

/**
 * Start a plan from the Virginia-shaped starter library.
 *
 * Framed throughout as a draft to rewrite, not a plan to adopt. Virginia's
 * guidance is explicit that outcomes come from what is important to the person;
 * a template that goes into a chart unedited is the exact failure the state has
 * been citing providers for.
 */
export function LibraryPicker({ residentId, residentName }: { residentId: string; residentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function install() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/outcomes/install-library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ residentId, keys: [...picked] })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not add those.');
      return;
    }
    setOpen(false);
    setPicked(new Set());
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Start from a template
      </Button>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-brand-navy">Starter outcomes</h2>
      <p className="mb-4 text-xs text-brand-slate">
        Written to Virginia DBHDS&apos;s formula so the structure is right. <strong>Rewrite every
        one in {residentName}&apos;s own words</strong> — a template outcome is not
        person-centered, which is what the state actually checks for.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <ul className="space-y-2">
        {VIRGINIA_OUTCOME_LIBRARY.map((o) => (
          <li key={o.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-navy/10 p-3 hover:bg-brand-sand/50">
              <input
                type="checkbox"
                checked={picked.has(o.key)}
                onChange={() => toggle(o.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand-teal"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy">{o.title}</span>
                  <span className="rounded-full bg-brand-aqua/25 px-2 py-0.5 text-xs font-semibold text-brand-navy">
                    {LENS_LABEL[o.lens]}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-brand-slate">
                  {o.statement.replace(/\{name\}/g, residentName).replace(/\{subject\}/g, 'they').replace(/\{possessive\}/g, 'their')}
                </span>
                <span className="mt-1 block text-xs text-brand-slate">
                  {o.activities.length} support {o.activities.length === 1 ? 'activity' : 'activities'} · {o.frequency}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <Button onClick={install} disabled={busy || picked.size === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add {picked.size || ''} to the plan
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
