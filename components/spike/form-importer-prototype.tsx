'use client';

/**
 * SPIKE — spike/form-importer. Mock data only; nothing here reads or writes the
 * database or calls a model.
 *
 * Shows the four things the importer has to make feel obvious: switch between
 * imported forms, pick a preset into a note, add a preset, and the BAA e-sign
 * step that (together with FlipBrief's own server-side flag) unlocks Path 3.
 */
import { useMemo, useState } from 'react';
import { BAA_DOCUMENT_VERSION, BAA_DRAFT_BANNER, BAA_DRAFT_TEXT } from '../../lib/importer/baa-draft';
import { GATE_REFUSAL_COPY, path3Gate, type BaaAcceptance } from '../../lib/importer/phi-gate';
import type { DraftPreset } from '../../lib/importer/presets';

export type MockForm = {
  key: string;
  name: string;
  prompts: string[];
  fieldLabels: string[];
};

const ORG_ID = 'mock-org-1';

export function FormImporterPrototype({
  forms,
  initialPresets,
  platformAiBaaInPlace
}: {
  forms: MockForm[];
  initialPresets: DraftPreset[];
  /** Resolved on the server from env. The client can display it, never set it. */
  platformAiBaaInPlace: boolean;
}) {
  const [formKey, setFormKey] = useState(forms[0]?.key ?? '');
  const [note, setNote] = useState('');
  const [presets, setPresets] = useState(initialPresets);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [acceptance, setAcceptance] = useState<BaaAcceptance | null>(null);

  const form = forms.find((f) => f.key === formKey) ?? forms[0];
  const gate = useMemo(
    () => path3Gate({ orgId: ORG_ID, acceptance, platformAiBaaInPlace }),
    [acceptance, platformAiBaaInPlace]
  );

  const insertPreset = (p: DraftPreset) =>
    setNote((n) => (n.trim() ? `${n.trimEnd()} ${p.text}` : p.text));

  const addPreset = () => {
    if (!newLabel.trim() || !newText.trim()) return;
    setPresets((ps) => [
      ...ps,
      {
        id: `user-${ps.length + 1}`,
        org_id: ORG_ID,
        label: newLabel.trim(),
        text: newText.trim(),
        category: null,
        origin: 'user',
        status: 'pending_approval'
      }
    ]);
    setNewLabel('');
    setNewText('');
  };

  const sign = () => {
    if (signerName.trim().length < 2 || signerRole.trim().length < 2) return;
    // Mock: in the product this is a server action that stores the record.
    setAcceptance({
      orgId: ORG_ID,
      signerName: signerName.trim(),
      signerRole: signerRole.trim(),
      baaVersion: BAA_DOCUMENT_VERSION,
      acceptedAt: new Date().toISOString()
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-brand-navy">
      <p data-testid="spike-banner" className="rounded-xl bg-amber-100 p-3 text-sm font-semibold">
        Prototype — mock data. Imported forms and presets are drafts awaiting sign-off.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your forms</h2>
        <div role="tablist" className="flex flex-wrap gap-2">
          {forms.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={f.key === form?.key}
              onClick={() => setFormKey(f.key)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${f.key === form?.key ? 'bg-brand-navy text-white' : 'border bg-white'}`}
            >
              {f.name} <span className="text-xs font-normal">(draft)</span>
            </button>
          ))}
        </div>
        {form && (
          <div data-testid="active-form" className="rounded-2xl border bg-white p-4">
            <h3 className="font-bold">{form.name}</h3>
            <p className="text-xs">Fields: {form.fieldLabels.join(' · ')}</p>
            <ol className="mt-2 list-decimal pl-5 text-sm">
              {form.prompts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Note</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.id} data-testid="preset" onClick={() => insertPreset(p)} className="rounded-full border bg-white px-3 py-1 text-sm">
              {p.label}
              {p.status === 'pending_approval' && <span className="ml-1 text-xs text-amber-700">needs approval</span>}
            </button>
          ))}
        </div>
        <textarea
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          className="w-full rounded-xl border p-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <input aria-label="New preset label" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="rounded-xl border p-2 text-sm" />
          <input aria-label="New preset text" placeholder="What you write" value={newText} onChange={(e) => setNewText(e.target.value)} className="flex-1 rounded-xl border p-2 text-sm" />
          <button onClick={addPreset} className="rounded-xl bg-brand-teal px-3 py-2 text-sm font-semibold text-white">
            Add preset
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-bold">Learn from notes you have already written</h2>
        <p className="text-sm">
          Written notes contain patient information. This stays locked until your organization signs the Business
          Associate Agreement and FlipBrief has enabled it on our side.
        </p>

        {acceptance ? (
          <p data-testid="acceptance-record" className="rounded-xl bg-green-50 p-3 text-xs">
            Signed by {acceptance.signerName} ({acceptance.signerRole}) for {acceptance.orgId}, BAA version{' '}
            {acceptance.baaVersion}, at {acceptance.acceptedAt}.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-red-700">{BAA_DRAFT_BANNER}</p>
            <pre data-testid="baa-text" className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-brand-sand p-3 text-xs">
              {BAA_DRAFT_TEXT}
            </pre>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Signer full name" placeholder="Full name" value={signerName} onChange={(e) => setSignerName(e.target.value)} className="rounded-xl border p-2 text-sm" />
              <input aria-label="Signer role" placeholder="Role / title" value={signerRole} onChange={(e) => setSignerRole(e.target.value)} className="rounded-xl border p-2 text-sm" />
              <button
                onClick={sign}
                disabled={signerName.trim().length < 2 || signerRole.trim().length < 2}
                className="rounded-xl bg-brand-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Sign BAA
              </button>
            </div>
          </div>
        )}

        <ul data-testid="gate-reasons" className="list-disc pl-5 text-xs">
          {gate.allowed ? <li>Unlocked.</li> : gate.reasons.map((r) => <li key={r}>{GATE_REFUSAL_COPY[r]}</li>)}
        </ul>
        <button data-testid="path3-upload" disabled={!gate.allowed} className="rounded-xl bg-brand-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Upload photos of written notes
        </button>
      </section>
    </div>
  );
}
