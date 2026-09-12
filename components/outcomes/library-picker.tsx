'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { personalize } from '@/lib/outcomes/library';
import type { LibraryOutcome, OrgOutcomePreset, Pronouns } from '@/lib/types';

const LENS_LABEL: Record<string, string> = {
  independence: 'Independence',
  integration: 'Integration',
  quality_of_life: 'Quality of life'
};

/**
 * Start a plan from something already written.
 *
 * Two sources sit here side by side. The starter library is content this app
 * ships for the agency's own jurisdiction. The presets are the agency's own
 * wording, saved out of outcomes they wrote themselves, grouped under whatever
 * categories they typed — the categories are theirs, not a list this app
 * decided on, which is why an uncategorised preset gets its own plain section
 * rather than being filed under something invented for it.
 *
 * Which is which is labelled on every row. A supervisor deciding whether to
 * trust a wording needs to know whether it came from their colleague or from
 * us, and the answer changes what they do with it.
 *
 * Framed throughout as a draft to rewrite, not a plan to adopt. Person-centred
 * guidance is explicit that outcomes come from what is important to the person;
 * a template that goes into a chart unedited is the exact failure states cite
 * providers for. That is as true of the agency's own preset as of ours.
 */
export function LibraryPicker({
  residentId,
  residentName,
  pronouns,
  library,
  presets
}: {
  residentId: string;
  residentName: string;
  pronouns: Pronouns;
  library: LibraryOutcome[];
  presets: OrgOutcomePreset[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());
  const [pickedPresets, setPickedPresets] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = pickedKeys.size + pickedPresets.size;

  function toggle(set: Set<string>, apply: (next: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  async function install() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/outcomes/install-library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        residentId,
        keys: [...pickedKeys],
        presetIds: [...pickedPresets]
      })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not add those.');
      return;
    }
    setOpen(false);
    setPickedKeys(new Set());
    setPickedPresets(new Set());
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

  // Grouped by the agency's own category text. Null and blank land together in
  // a section with no heading of its own; inventing "Other" would be this app
  // naming a group the agency did not.
  const grouped = new Map<string, OrgOutcomePreset[]>();
  const ungrouped: OrgOutcomePreset[] = [];
  for (const p of presets) {
    const category = p.category?.trim();
    if (!category) {
      ungrouped.push(p);
      continue;
    }
    grouped.set(category, [...(grouped.get(category) ?? []), p]);
  }
  const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));

  function row({
    id,
    checked,
    onChange,
    title,
    lens,
    statement,
    frequency,
    activityCount,
    source
  }: {
    id: string;
    checked: boolean;
    onChange: () => void;
    title: string;
    lens: string | null;
    statement: string | null;
    frequency: string | null;
    activityCount: number;
    source: 'agency' | 'state';
  }) {
    return (
      <li key={id}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-navy/10 p-3 hover:bg-brand-sand/50">
          <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            className="mt-1 h-4 w-4 shrink-0 accent-brand-teal"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand-navy">{title}</span>
              {lens ? (
                <span className="rounded-full bg-brand-aqua/25 px-2 py-0.5 text-xs font-semibold text-brand-navy">
                  {LENS_LABEL[lens] ?? lens}
                </span>
              ) : null}
              <Badge tone={source === 'agency' ? 'info' : 'neutral'}>
                {source === 'agency' ? 'Your agency' : 'Starter'}
              </Badge>
            </span>
            {statement ? (
              <span className="mt-1 block text-xs text-brand-slate">
                {personalize(statement, residentName, pronouns)}
              </span>
            ) : null}
            <span className="mt-1 block text-xs text-brand-slate">
              {activityCount} support {activityCount === 1 ? 'activity' : 'activities'}
              {frequency ? ` · ${frequency}` : ''}
            </span>
          </span>
        </label>
      </li>
    );
  }

  const presetRow = (p: OrgOutcomePreset) =>
    row({
      id: p.id,
      checked: pickedPresets.has(p.id),
      onChange: () => toggle(pickedPresets, setPickedPresets, p.id),
      title: p.title,
      lens: p.lens,
      statement: p.statement,
      frequency: p.frequency,
      activityCount: p.activities.length,
      source: 'agency'
    });

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-brand-navy">Starter outcomes</h2>
      <p className="mb-4 text-xs text-brand-slate">
        A starting point, from your agency&apos;s own presets or from the starter set for your
        state. <strong>Rewrite every one in {residentName}&apos;s own words</strong> — a template
        outcome is not person-centered, which is what the state actually checks for.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {presets.length > 0 ? (
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-slate">
            Your agency&apos;s presets
          </h3>
          <p className="mb-2 mt-1 text-xs text-brand-slate">
            Saved by someone at your agency from a plan they wrote. Same rule as the rest: a
            starting point to rewrite, not a plan to adopt.
          </p>

          {categories.map((category) => (
            <div key={category} className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-brand-navy">{category}</p>
              <ul className="space-y-2">{(grouped.get(category) ?? []).map(presetRow)}</ul>
            </div>
          ))}

          {ungrouped.length > 0 ? (
            <div className="mb-3">
              {categories.length > 0 ? (
                <p className="mb-1.5 text-xs font-semibold text-brand-navy">No category</p>
              ) : null}
              <ul className="space-y-2">{ungrouped.map(presetRow)}</ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {library.length > 0 ? (
        <section>
          {/* The library comes from this agency's own jurisdiction's template,
              so the structure it follows is that state's — naming Virginia
              here would have been wrong for every other one. */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-slate">
            Starter outcomes for your state
          </h3>
          <p className="mb-2 mt-1 text-xs text-brand-slate">
            Written to your state&apos;s formula so the structure is right.
          </p>
          <ul className="space-y-2">
            {library.map((o) =>
              row({
                id: o.key,
                checked: pickedKeys.has(o.key),
                onChange: () => toggle(pickedKeys, setPickedKeys, o.key),
                title: o.title,
                lens: o.lens,
                statement: o.statement,
                frequency: o.frequency,
                activityCount: o.activities.length,
                source: 'state'
              })
            )}
          </ul>
        </section>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button onClick={install} disabled={busy || chosen === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add {chosen || ''} to the plan
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
