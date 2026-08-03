'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Download, FileUp, Loader2, Upload, Wand2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { TEMPLATE_CSV, type ParseResult } from '@/lib/residents/import';

/**
 * Roster import: paste or upload, review, then write.
 *
 * The review step is not optional. A misread roster puts notes on the wrong
 * chart, and a signed note cannot be edited or deleted — so the supervisor sees
 * exactly what each row was understood to mean before anything is created.
 */
export function ImportPanel({
  homes,
  defaultHomeId
}: {
  homes: Array<{ id: string; name: string }>;
  defaultHomeId: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [homeId, setHomeId] = useState(defaultHomeId);
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [reading, setReading] = useState(false);
  const [needsAi, setNeedsAi] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: Array<{ name: string }>;
    skipped: Array<{ rowNumber: number; name: string; reason: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(text: string, allowAi = false) {
    setRaw(text);
    setResult(null);
    setError(null);
    setSkip(new Set());
    setNeedsAi(null);
    setUsedAi(false);

    if (!text.trim()) {
      setParsed(null);
      return;
    }

    setReading(true);
    try {
      const res = await fetch('/api/residents/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, allowAi })
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? 'Could not read that.');
        setParsed(null);
        return;
      }

      setParsed({
        residents: body.residents ?? [],
        errors: body.errors ?? [],
        unknownColumns: body.unknownColumns ?? []
      });
      setUsedAi(Boolean(body.usedAi));
      if (body.needsAi) setNeedsAi(body.aiHint ?? null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setReading(false);
    }
  }

  async function onFile(file: File) {
    // Read as text regardless of extension: agencies export .csv, .txt, and
    // occasionally a .xls that is really tab-separated.
    review(await file.text());
  }

  function toggleSkip(rowNumber: number) {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function runImport() {
    if (!parsed) return;
    const rows = parsed.residents.filter((r) => !skip.has(r.rowNumber));
    if (rows.length === 0) return;

    setImporting(true);
    setError(null);

    const res = await fetch('/api/residents/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        homeId,
        allowDuplicates,
        // `warnings` is review-only state; the API schema rejects unknown keys.
        rows: rows.map(({ warnings, ...row }) => row)
      })
    });

    const body = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      setError(body.error ?? 'The import failed.');
      return;
    }

    setResult(body);
    router.refresh();
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resident-roster-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = parsed?.residents.filter((r) => !skip.has(r.rowNumber)) ?? [];
  const warningCount = selected.filter((r) => r.warnings.length > 0).length;

  if (result) {
    return (
      <div className="space-y-4">
        <Alert tone={result.skipped.length ? 'warning' : 'info'} title="Import finished">
          <p>
            Added {result.created.length}{' '}
            {result.created.length === 1 ? 'resident' : 'residents'}
            {result.skipped.length ? `, skipped ${result.skipped.length}.` : '.'}
          </p>
        </Alert>

        {result.skipped.length > 0 ? (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-brand-navy">Skipped</h2>
            <ul className="space-y-2 text-sm">
              {result.skipped.map((s) => (
                <li key={s.rowNumber} className="flex gap-2 text-brand-slate">
                  <span className="font-semibold text-brand-navy">Row {s.rowNumber}</span>
                  <span>{s.name}</span>
                  <span className="ml-auto">{s.reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex gap-2">
          <Button href={`/residents?home=${homeId}`}>See the roster</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              review('');
            }}
          >
            Import more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-brand-navy">1. Paste or upload your roster</h2>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download a template
          </button>
        </div>

        {homes.length > 1 ? (
          <div className="mb-4">
            <label
              htmlFor="import-home"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate"
            >
              Add everyone to
            </label>
            <select
              id="import-home"
              value={homeId}
              onChange={(e) => setHomeId(e.target.value)}
              className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />

        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          Choose a CSV file
        </Button>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-brand-slate">
          Or paste it
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => review(raw)}
          rows={6}
          placeholder={'Paste anything — a spreadsheet, a table from Word, or just a list:\n\nAlexander Rivera (Alex), room 2B, he/him, DOB 4/12/85\nMaria Ochoa — 3A — she/her\nJordan Pike, they/them, North Hall'}
          className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 font-mono text-xs text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => review(raw)} disabled={!raw.trim() || reading}>
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {reading ? 'Reading…' : 'Read this list'}
          </Button>
          <span className="text-xs text-brand-slate">
            Spreadsheet columns are read instantly. Anything messier, the assistant can sort out.
          </span>
        </div>
      </Card>

      {needsAi ? (
        <Alert tone="warning" title="This is not laid out like a spreadsheet">
          <p>{needsAi}</p>
          <p className="mt-2 text-xs">
            The text you pasted — including names and dates of birth — is sent to the note
            assistant&apos;s provider to be read. That needs the same signed agreement as the note
            assistant itself.
          </p>
          <div className="mt-3">
            <Button size="sm" onClick={() => review(raw, true)} disabled={reading}>
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Let the assistant read it
            </Button>
          </div>
        </Alert>
      ) : null}

      {parsed ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-brand-navy">2. Check what it read</h2>
          <p className="mb-4 text-xs text-brand-slate">
            {selected.length} of {parsed.residents.length} will be added
            {warningCount > 0 ? ` · ${warningCount} need a look` : ''}
            {usedAi ? ' · read by the assistant, so check each row' : ''}
          </p>

          {parsed.errors.length > 0 ? (
            <div className="mb-4">
              <Alert tone="error" title="Some rows could not be read">
                <ul className="mt-1 space-y-1">
                  {parsed.errors.map((e) => (
                    <li key={e.rowNumber}>
                      {e.rowNumber > 0 ? `Row ${e.rowNumber}: ` : ''}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}

          {parsed.unknownColumns.length > 0 ? (
            <div className="mb-4">
              <Alert tone="warning" title="Columns that were ignored">
                <p>{parsed.unknownColumns.join(', ')}</p>
              </Alert>
            </div>
          ) : null}

          {parsed.residents.length > 0 ? (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-brand-navy/10 text-xs uppercase tracking-wide text-brand-slate">
                    <th className="pb-2 pr-2 font-semibold">Add</th>
                    <th className="pb-2 pr-3 font-semibold">Name</th>
                    <th className="pb-2 pr-3 font-semibold">Room</th>
                    <th className="pb-2 pr-3 font-semibold">Pronouns</th>
                    <th className="pb-2 font-semibold">Medicaid</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.residents.map((r) => {
                    const included = !skip.has(r.rowNumber);
                    return (
                      <tr
                        key={r.rowNumber}
                        className={
                          included
                            ? 'border-b border-brand-navy/5 align-top'
                            : 'border-b border-brand-navy/5 align-top opacity-40'
                        }
                      >
                        <td className="py-2.5 pr-2">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={() => toggleSkip(r.rowNumber)}
                            aria-label={`Import ${r.firstName} ${r.lastName}`}
                            className="h-4 w-4 accent-brand-teal"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-brand-navy">
                            {r.preferredName || r.firstName} {r.lastName}
                          </span>
                          {r.warnings.map((w) => (
                            <span
                              key={w}
                              className="mt-1 flex items-start gap-1 text-xs text-status-draft"
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {w}
                            </span>
                          ))}
                        </td>
                        <td className="py-2.5 pr-3 text-brand-slate">{r.room ?? '—'}</td>
                        <td className="py-2.5 pr-3 text-brand-slate">
                          {r.pronouns.subject}/{r.pronouns.object}
                        </td>
                        <td className="py-2.5 text-brand-slate">
                          {/* Never echo the ID — confirming presence is enough to review by. */}
                          {r.medicaidId ? <Check className="h-4 w-4 text-status-signed" /> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <label className="mt-4 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-teal"
              checked={allowDuplicates}
              onChange={(e) => setAllowDuplicates(e.target.checked)}
            />
            <span className="text-xs text-brand-slate">
              Add people whose name is already on this roster. Leave this off unless you know two
              residents share a name.
            </span>
          </label>
        </Card>
      ) : null}

      {parsed && selected.length > 0 ? (
        <Button onClick={runImport} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Add {selected.length} {selected.length === 1 ? 'resident' : 'residents'}
        </Button>
      ) : null}
    </div>
  );
}
