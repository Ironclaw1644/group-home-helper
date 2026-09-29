'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { Alert, Button, Card, StickyActionBar } from '@/components/ui';
import {
  LIMITS,
  SAMPLE_NARRATIVE,
  SOURCE_LABELS,
  type EditableField,
  type EditableForm
} from '@/lib/importer/editable';
import { MAX_TOTAL_BASE64, PageError, preparePage, type PreparedPage } from '@/lib/importer/client-pages';
import { PRINT_SOURCES, type PrintSource } from '@/lib/types';

type Step = 'capture' | 'reading' | 'review' | 'done';

export type CurrentForm = {
  name: string;
  isOwnForm: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

/**
 * "Use our own form": photograph the blank paper form staff already fill in,
 * and it becomes the form every note is written on.
 *
 * Four steps, one decision. Capture (camera or file, any number of pages) →
 * reading (the model transcribes) → review (the form, filled with a made-up
 * person; fix anything) → one Confirm. Nothing is saved before Confirm.
 */
export function FormImporter({
  current,
  orgLine,
  providerId,
  signerName,
  signerTitle,
  todayLabel,
  onboarding
}: {
  current: CurrentForm;
  orgLine: string;
  providerId: string;
  signerName: string;
  signerTitle: string;
  todayLabel: string;
  /** First-run setup: after Confirm, point at the next setup step. */
  onboarding: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('capture');
  const [pages, setPages] = useState<PreparedPage[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [forms, setForms] = useState<EditableForm[]>([]);
  const [selected, setSelected] = useState(0);
  const [model, setModel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [switchingBack, setSwitchingBack] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const form = forms[selected] ?? null;
  const totalBase64 = pages.reduce((n, p) => n + p.base64.length, 0);
  const tooBig = totalBase64 > MAX_TOTAL_BASE64;

  // Release thumbnails and the PDF preview when they go away.
  useEffect(() => () => pages.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)), [pages]);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const files = Array.from(list);
    setPreparing((n) => n + files.length);
    for (const file of files) {
      try {
        const page = await preparePage(file);
        setPages((prev) => [...prev, page].slice(0, 10));
      } catch (err) {
        setError(err instanceof PageError ? err.message : `Could not open "${file.name}".`);
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  async function read() {
    setError(null);
    setStep('reading');
    try {
      const res = await fetch('/api/forms/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pages: pages.map((p) => ({ mediaType: p.mediaType, base64: p.base64 })) })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not read the form. Nothing was saved — try again.');
        setStep('capture');
        return;
      }
      setForms(body.forms as EditableForm[]);
      setSelected(typeof body.suggested === 'number' ? body.suggested : 0);
      setModel(typeof body.model === 'string' ? body.model : null);
      setEditing(false);
      setStep('review');
    } catch {
      setError('Could not reach FlipBrief. Check the connection and try again — your photos are still here.');
      setStep('capture');
    }
  }

  function update(patch: Partial<EditableForm>) {
    setPdfUrl(null);
    setForms((prev) => prev.map((f, i) => (i === selected ? { ...f, ...patch } : f)));
  }

  async function openPdf() {
    if (!form) return;
    setPdfLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/forms/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ form })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not make the PDF preview.');
        return;
      }
      setPdfUrl(URL.createObjectURL(await res.blob()));
    } finally {
      setPdfLoading(false);
    }
  }

  async function confirm() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/forms/template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ form, model })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not save the form.');
        return;
      }
      setStep('done');
      router.refresh();
    } catch {
      setError('Could not reach FlipBrief. Nothing was saved — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function switchBack() {
    setSwitchingBack(true);
    const res = await fetch('/api/forms/template', { method: 'DELETE' });
    setSwitchingBack(false);
    if (res.ok) router.refresh();
    else setError('Could not switch back. Try again.');
  }

  // ---------------------------------------------------------------- done ----
  if (step === 'done') {
    return (
      <Card className="border-status-signed/30 bg-status-signed/10" >
        <div data-testid="import-done" className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-signed text-white">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold text-brand-navy">Your form is live</p>
            <p className="mt-1 text-sm text-brand-slate">
              Every new note is written on <strong>{form?.title}</strong>, with its questions, and prints on its
              layout. Notes already signed keep the form they were signed on.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {onboarding ? (
                <Button href="/residents/import?onboarding=1">
                  Next: add the people you support <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button href="/notes/new">
                  Write a note on it <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" href="/">
                Back to today
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------- reading ----
  if (step === 'reading') {
    return <ReadingProgress pages={pages.length} />;
  }

  // -------------------------------------------------------------- review ----
  if (step === 'review' && form) {
    return (
      <div className="space-y-4 pb-28">
        {forms.length > 1 ? (
          // Compact on purpose: the filled-in form is what the admin came to
          // see, so the choice of which form sits in one line above it.
          <div>
            <p className="mb-2 text-xs text-brand-slate">
              We found {forms.length} forms in those pages. Showing the one staff write their note on — tap
              another to switch.
            </p>
            <div role="radiogroup" aria-label="Forms found" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {forms.map((f, i) => (
                <button
                  key={`${f.title}-${i}`}
                  role="radio"
                  aria-checked={i === selected}
                  onClick={() => {
                    setSelected(i);
                    setPdfUrl(null);
                  }}
                  className={
                    i === selected
                      ? 'shrink-0 rounded-full bg-brand-navy px-3 py-2 text-xs font-semibold text-white'
                      : 'shrink-0 rounded-full border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-slate'
                  }
                >
                  {f.title.length > 34 ? `${f.title.slice(0, 32)}…` : f.title}
                  {f.isLogOrTable ? ' · log' : ''}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {form.isLogOrTable ? (
          <Alert tone="warning" title="This looks like a log, not a note">
            FlipBrief writes the narrative note for each shift. A time sheet or mileage log will not fill in
            well. If this is really your note form, go ahead — otherwise pick another or add its pages.
          </Alert>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-semibold text-brand-navy">
            Here is your form, filled in with a made-up person
          </p>
          <PaperPreview
            form={form}
            orgLine={orgLine}
            providerId={providerId}
            signerName={signerName}
            signerTitle={signerTitle}
            todayLabel={todayLabel}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'Done fixing' : 'Something wrong? Fix it'}
          </Button>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs font-semibold text-brand-navy"
            >
              <FileText className="h-3.5 w-3.5" /> Open the PDF
            </a>
          ) : (
            <Button variant="ghost" size="sm" onClick={openPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              See it as the printed PDF
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep('capture');
              setForms([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </Button>
        </div>

        {editing ? <FormEditor form={form} onChange={update} /> : null}

        {form.rejectedFormNumbers.length > 0 ? (
          <p className="text-xs text-brand-slate">
            Printed on the page but not used as a form number:{' '}
            {form.rejectedFormNumbers.map((r) => `“${r.printed}”`).join(', ')}. FlipBrief only prints a form
            number it has verified against the agency that publishes it.
          </p>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}

        {/* One decision, always in reach of a thumb. */}
        <StickyActionBar>
          <div>
            <p className="mb-2 text-xs text-brand-slate">
              Confirming makes this the form every staff member writes on from their next note. You can switch
              back at any time.
            </p>
            <Button className="w-full sm:w-auto" onClick={confirm} disabled={saving || form.prompts.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Looks right — use this form'}
            </Button>
          </div>
        </StickyActionBar>
      </div>
    );
  }

  // ------------------------------------------------------------- capture ----
  return (
    <div className="space-y-4">
      {current.isOwnForm ? (
        <Card>
          <p className="text-sm font-semibold text-brand-navy">Staff are writing on your own form: {current.name}</p>
          <p className="mt-1 text-xs text-brand-slate">
            {current.confirmedBy ? `Confirmed by ${current.confirmedBy}` : 'Confirmed'}
            {current.confirmedAt ? ` on ${new Date(current.confirmedAt).toLocaleDateString()}` : ''}. Upload it
            again below to replace it.
          </p>
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={switchBack} disabled={switchingBack}>
              {switchingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Switch back to the standard form
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-brand-navy">Snap the blank form your staff already fill in</h2>
        <p className="mt-1 text-sm text-brand-slate">
          Every page of it. FlipBrief reads the questions and boxes, shows it back to you filled in, and staff
          write on it from then on.
        </p>
        <p className="mt-2 rounded-lg bg-brand-sand/70 px-3 py-2 text-xs text-brand-navy">
          Use a <strong>blank</strong> copy — no one&apos;s name, notes or signature on it. The page is sent to
          our AI provider to be read.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => cameraRef.current?.click()} className="w-full">
            <Camera className="h-4 w-4" /> {pages.length ? 'Take another page' : 'Take a photo'}
          </Button>
          <Button variant="ghost" onClick={() => filesRef.current?.click()} className="w-full">
            <ImagePlus className="h-4 w-4" /> Choose photos or a PDF
          </Button>
        </div>
        <input
          ref={cameraRef}
          data-testid="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={filesRef}
          data-testid="file-input"
          type="file"
          accept="image/*,application/pdf,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {pages.length > 0 || preparing > 0 ? (
          <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {pages.map((p, i) => (
              <li key={p.id} className="relative overflow-hidden rounded-lg border border-brand-navy/10 bg-white">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-brand-slate">
                    <FileText className="h-6 w-6" />
                    <span className="line-clamp-2 break-all">{p.name}</span>
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-brand-navy/80 px-1.5 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <button
                  onClick={() => removePage(p.id)}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-brand-navy shadow"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
            {Array.from({ length: preparing }).map((_, i) => (
              <li
                key={`prep-${i}`}
                className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-brand-navy/20"
              >
                <Loader2 className="h-5 w-5 animate-spin text-brand-slate" />
              </li>
            ))}
          </ol>
        ) : null}

        {tooBig ? (
          <p className="mt-3 text-xs font-semibold text-status-draft">
            That is more than can be sent at once. Remove a page or two, or use photos instead of a large PDF.
          </p>
        ) : null}

        {error ? (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            variant="secondary"
            className="w-full"
            onClick={read}
            disabled={pages.length === 0 || preparing > 0 || tooBig}
          >
            Read my form <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

    </div>
  );
}

function ReadingProgress({ pages }: { pages: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stages = [
    { at: 0, label: `Sending ${pages} page${pages === 1 ? '' : 's'}` },
    { at: 3, label: 'Reading the questions, word for word' },
    { at: 12, label: 'Finding every box on the page' },
    { at: 22, label: 'Laying it out as your printed form' }
  ];
  const current = stages.filter((s) => seconds >= s.at).length - 1;
  return (
    <Card>
      <div data-testid="import-reading" className="flex flex-col items-center py-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-teal" />
        <p className="mt-4 text-base font-semibold text-brand-navy">Reading your form…</p>
        <p className="mt-1 text-xs text-brand-slate">Usually 20–40 seconds. Keep this screen open.</p>
        <ul className="mt-5 space-y-2 text-left text-sm">
          {stages.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              {i < current ? (
                <Check className="h-4 w-4 text-status-signed" />
              ) : i === current ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-teal" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-brand-navy/20" />
              )}
              <span className={i <= current ? 'text-brand-navy' : 'text-brand-slate/60'}>{s.label}</span>
            </li>
          ))}
        </ul>
        {seconds > 60 ? (
          <p className="mt-4 text-xs text-brand-slate">Taking longer than usual — still working.</p>
        ) : null}
      </div>
    </Card>
  );
}

function sampleValue(
  source: PrintSource | null,
  v: { orgLine: string; providerId: string; signerName: string; signerTitle: string; todayLabel: string }
): string {
  switch (source) {
    case 'resident_legal_name':
      return 'Sam Sample';
    case 'resident_preferred_name':
      return 'Sam';
    case 'medicaid_id':
      return '(from their record)';
    case 'service_date':
      return v.todayLabel;
    case 'shift_label':
      return 'Day shift';
    case 'shift_start':
      return '7:00 AM';
    case 'shift_stop':
      return '3:00 PM';
    case 'org_line':
      return v.orgLine;
    case 'provider_id':
      return v.providerId || '(add in Settings)';
    case 'place_of_service':
      return 'Sample House';
    case 'service_type':
      return '';
    case 'group_size':
      return '1';
    case 'signature_name':
      return v.signerName;
    case 'signature_title':
      return v.signerTitle;
    default:
      return '';
  }
}

/** The form as a sheet of paper, filled with the sample. Mirrors renderConfigFor's layout. */
function PaperPreview({
  form,
  ...v
}: {
  form: EditableForm;
  orgLine: string;
  providerId: string;
  signerName: string;
  signerTitle: string;
  todayLabel: string;
}) {
  const identity = form.fields.filter((f) => f.section === 'identity');
  const meta = form.fields.filter((f) => f.section === 'meta');
  const FieldLine = ({ f }: { f: EditableField }) => {
    const value = sampleValue(f.source, v);
    return (
      <div className="min-w-0 flex-1 basis-[45%]">
        <span className="text-[11px] font-semibold text-neutral-700">{f.label}:</span>{' '}
        <span className="inline-block min-w-[4rem] border-b border-neutral-400 px-1 text-[12px] text-neutral-900">
          {value || ' '}
        </span>
      </div>
    );
  };
  return (
    <div
      data-testid="paper-preview"
      className="rounded-md border border-neutral-300 bg-white p-4 font-serif text-neutral-900 shadow-sm sm:p-6"
    >
      <p className="text-center text-[11px] text-neutral-600">{v.orgLine}</p>
      <h3 className="mt-1 text-center text-base font-bold uppercase tracking-wide">{form.title}</h3>
      {form.subtitle ? <p className="text-center text-[11px] italic text-neutral-600">{form.subtitle}</p> : null}

      {identity.length ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {identity.map((f, i) => (
            <FieldLine key={`i${i}`} f={f} />
          ))}
        </div>
      ) : null}
      {meta.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {meta.map((f, i) => (
            <FieldLine key={`m${i}`} f={f} />
          ))}
        </div>
      ) : null}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-[12px] font-semibold">
        {form.prompts.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
      <div className="mt-3 rounded border border-neutral-300 p-3 text-[12px] leading-relaxed">
        {SAMPLE_NARRATIVE}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 text-[12px]">
        <span className="font-semibold">{form.signatureLabel}:</span>
        <span className="min-w-[10rem] flex-1 border-b border-neutral-500 font-[cursive] text-base">{v.signerName}</span>
      </div>
      <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-neutral-400">
        Sample — made-up person
      </p>
    </div>
  );
}

function FormEditor({ form, onChange }: { form: EditableForm; onChange: (patch: Partial<EditableForm>) => void }) {
  // Opened from under the preview; bring it up rather than leave it below the fold.
  const ref = useRef<HTMLDivElement>(null);
  // A block body on purpose: newer browsers return a Promise from
  // scrollIntoView, and React calls whatever an effect returns as its cleanup.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const usedSources = useMemo(() => new Set(form.fields.map((f) => f.source).filter(Boolean)), [form.fields]);
  const setField = (i: number, patch: Partial<EditableField>) =>
    onChange({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <div ref={ref} className="scroll-mt-4">
    <Card>
      <div className="space-y-5">
        <label className="block">
          <span className="field-label">Form title</span>
          <input
            className="field-input"
            value={form.title}
            maxLength={LIMITS.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>

        <div>
          <p className="field-label">Questions staff answer</p>
          <p className="mb-2 text-xs text-brand-slate">Exactly as printed. The note is written to answer these.</p>
          <div className="space-y-2">
            {form.prompts.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold text-brand-slate">{i + 1}.</span>
                <textarea
                  className="field-input flex-1"
                  // Tall enough to show the whole printed question on a phone.
                  rows={Math.min(6, Math.max(2, Math.ceil(p.length / 32)))}
                  value={p}
                  maxLength={LIMITS.prompt}
                  onChange={(e) => onChange({ prompts: form.prompts.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => onChange({ prompts: form.prompts.filter((_, j) => j !== i) })}
                  className="mt-2 rounded-lg p-2 text-brand-slate hover:bg-brand-sand hover:text-status-missing"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {form.prompts.length < LIMITS.prompts ? (
            <button
              onClick={() => onChange({ prompts: [...form.prompts, ''] })}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal"
            >
              <Plus className="h-3.5 w-3.5" /> Add a question
            </button>
          ) : null}
        </div>

        <div>
          <p className="field-label">Boxes on the form</p>
          <p className="mb-2 text-xs text-brand-slate">
            Choose what fills each one in. &ldquo;Leave blank&rdquo; prints an empty line, like the paper.
          </p>
          <div className="space-y-3">
            {form.fields.map((f, i) => (
              <div key={i} className="rounded-xl border border-brand-navy/10 p-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Box ${i + 1} label`}
                    className="field-input flex-1"
                    value={f.label}
                    maxLength={LIMITS.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                  />
                  <button
                    aria-label={`Remove box ${i + 1}`}
                    onClick={() => onChange({ fields: form.fields.filter((_, j) => j !== i) })}
                    className="rounded-lg p-2 text-brand-slate hover:bg-brand-sand hover:text-status-missing"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label={`What fills in ${f.label}`}
                    className="field-input"
                    value={f.source ?? ''}
                    onChange={(e) => setField(i, { source: (e.target.value || null) as PrintSource | null })}
                  >
                    <option value="">Leave blank</option>
                    {PRINT_SOURCES.map((s) => (
                      <option key={s} value={s} disabled={s !== f.source && usedSources.has(s)}>
                        {SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Where ${f.label} sits`}
                    className="field-input"
                    value={f.section}
                    onChange={(e) => setField(i, { section: e.target.value as EditableField['section'] })}
                  >
                    <option value="identity">Top of the page</option>
                    <option value="meta">Under the title</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
          {form.fields.length < LIMITS.fields ? (
            <button
              onClick={() => onChange({ fields: [...form.fields, { label: 'New box', source: null, section: 'meta' }] })}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal"
            >
              <Plus className="h-3.5 w-3.5" /> Add a box
            </button>
          ) : null}
        </div>

        <label className="block">
          <span className="field-label">Signature line label</span>
          <input
            className="field-input"
            value={form.signatureLabel}
            maxLength={LIMITS.label}
            onChange={(e) => onChange({ signatureLabel: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="field-label">What staff confirm before signing</span>
          <textarea
            className="field-input min-h-[80px]"
            value={form.attestation}
            maxLength={LIMITS.attestation}
            onChange={(e) => onChange({ attestation: e.target.value })}
          />
        </label>
      </div>
    </Card>
    </div>
  );
}
