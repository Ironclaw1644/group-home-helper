'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { DOCUMENT_KINDS } from '@/lib/types';
import type { DocumentKind, ResidentDocument } from '@/lib/types';
import { formatServiceDate } from '@/lib/utils';

/**
 * Upload, organize, open, and print documents.
 *
 * Files go straight from the browser to storage using a one-off signed URL, so
 * a 30 MB scanned ISP does not have to squeeze through a serverless function.
 * Opening one goes back through the app, because that redirect is where the
 * PHI access gets logged.
 */
export function DocumentShelf({
  documents,
  residentId,
  canEdit,
  subjectName
}: {
  documents: ResidentDocument[];
  /** Null for the agency shelf. */
  residentId: string | null;
  canEdit: boolean;
  subjectName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<DocumentKind | ''>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; title: string; kind: DocumentKind; expiresOn: string } | null>(
    null
  );

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (kindFilter && d.kind !== kindFilter) return false;
      if (!term) return true;
      return `${d.title} ${d.description ?? ''}`.toLowerCase().includes(term);
    });
  }, [documents, query, kindFilter]);

  function choose(file: File) {
    setError(null);
    if (file.size > 50_000_000) {
      setError('That file is over 50 MB. Split it or compress it first.');
      return;
    }
    setPending({
      file,
      // Filename minus extension is nearly always the right title.
      title: file.name.replace(/\.[^.]+$/, ''),
      kind: 'other',
      expiresOn: ''
    });
  }

  async function upload() {
    if (!pending) return;
    setUploading(true);
    setError(null);

    try {
      const targetRes = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ residentId, fileName: pending.file.name })
      });
      const target = await targetRes.json().catch(() => ({}));
      if (!targetRes.ok) {
        setError(target.error ?? 'Could not prepare the upload.');
        return;
      }

      // Supabase signed uploads accept a plain PUT with the token as the
      // authorization; no client library needed on this path.
      const put = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/ghh-documents/${target.path}?token=${encodeURIComponent(target.token)}`,
        {
          method: 'PUT',
          headers: { 'content-type': pending.file.type || 'application/octet-stream' },
          body: pending.file
        }
      );

      if (!put.ok) {
        setError('The file did not upload. Check your connection and try again.');
        return;
      }

      const record = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          residentId,
          title: pending.title.trim() || pending.file.name,
          kind: pending.kind,
          storagePath: target.path,
          mimeType: pending.file.type || null,
          sizeBytes: pending.file.size,
          expiresOn: pending.expiresOn || null
        })
      });

      const body = await record.json().catch(() => ({}));
      if (!record.ok) {
        setError(body.error ?? 'The file uploaded but could not be filed.');
        return;
      }

      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(doc: ResidentDocument) {
    await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

  const expiring = (d: ResidentDocument) => {
    if (!d.expiresOn) return null;
    const days = Math.round((new Date(d.expiresOn).getTime() - Date.now()) / 86400000);
    if (days < 0) return { tone: 'missing' as const, text: 'Expired' };
    if (days <= 30) return { tone: 'draft' as const, text: `Expires in ${days}d` };
    return null;
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canEdit ? (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) choose(f);
            }}
          />

          {pending ? (
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-brand-navy">File this document</h2>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  aria-label="Cancel"
                  className="text-brand-slate hover:text-brand-navy"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-4 text-xs text-brand-slate">
                {pending.file.name} · {(pending.file.size / 1_000_000).toFixed(1)} MB
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="doc-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate">
                    Title
                  </label>
                  <input
                    id="doc-title"
                    value={pending.title}
                    onChange={(e) => setPending({ ...pending, title: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="doc-kind" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate">
                    Type
                  </label>
                  <select
                    id="doc-kind"
                    value={pending.kind}
                    onChange={(e) => setPending({ ...pending, kind: e.target.value as DocumentKind })}
                    className={inputClass}
                  >
                    {DOCUMENT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="doc-expires" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate">
                    Expires <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    id="doc-expires"
                    type="date"
                    value={pending.expiresOn}
                    onChange={(e) => setPending({ ...pending, expiresOn: e.target.value })}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-brand-slate">
                    Plans and consents lapse. Set this and the shelf warns you first.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Button onClick={upload} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </Card>
          ) : (
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload a document
            </Button>
          )}
        </>
      ) : null}

      {documents.length > 3 ? (
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-slate" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
              className={`${inputClass} pl-10`}
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as DocumentKind | '')}
            aria-label="Filter by type"
            className={inputClass + ' max-w-[14rem]'}
          >
            <option value="">All types</option>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold text-brand-navy">
            {documents.length === 0 ? 'No documents yet' : 'Nothing matches'}
          </p>
          <p className="mt-1 text-sm text-brand-slate">
            {documents.length === 0
              ? `Service plans, assessments, and consents for ${subjectName} live here.`
              : 'Try a different search or type.'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((doc) => {
            const kind = DOCUMENT_KINDS.find((k) => k.value === doc.kind)?.label ?? doc.kind;
            const warn = expiring(doc);

            return (
              <li key={doc.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-brand-navy">{doc.title}</span>
                        <Badge tone="neutral">{kind}</Badge>
                        {warn ? <Badge tone={warn.tone}>{warn.text}</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-brand-slate">
                        Added {formatServiceDate(doc.createdAt.slice(0, 10))}
                        {doc.sizeBytes ? ` · ${(doc.sizeBytes / 1_000_000).toFixed(1)} MB` : ''}
                        {doc.expiresOn ? ` · expires ${formatServiceDate(doc.expiresOn)}` : ''}
                      </p>
                      {doc.description ? (
                        <p className="mt-1 text-sm text-brand-slate">{doc.description}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/api/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open or print"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-slate hover:bg-brand-sand hover:text-brand-navy"
                      >
                        <Printer className="h-4 w-4" />
                      </a>
                      <a
                        href={`/api/documents/${doc.id}?download=1`}
                        title="Download"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-slate hover:bg-brand-sand hover:text-brand-navy"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => remove(doc)}
                          title="Remove"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-slate hover:bg-status-missing/10 hover:text-status-missing"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-brand-slate">
        Opening a document is recorded in the access log, the same as opening a note.
      </p>
    </div>
  );
}
