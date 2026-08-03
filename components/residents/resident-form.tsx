'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import type { ResidentRecord } from '@/lib/types';

/**
 * Add or edit one resident.
 *
 * Pronouns are a three-way choice rather than free text: whatever is stored
 * here is written into generated narrative, and a malformed set produces a note
 * that reads as careless about the person it describes.
 */

const PRONOUN_SETS = [
  { key: 'he', label: 'he / him / his', subject: 'he', object: 'him', possessive: 'his' },
  { key: 'she', label: 'she / her / her', subject: 'she', object: 'her', possessive: 'her' },
  { key: 'they', label: 'they / them / their', subject: 'they', object: 'them', possessive: 'their' }
] as const;

function pronounKeyOf(subject: string): string {
  return PRONOUN_SETS.find((p) => p.subject === subject)?.key ?? 'they';
}

export function ResidentForm({
  homes,
  defaultHomeId,
  resident
}: {
  homes: Array<{ id: string; name: string }>;
  defaultHomeId: string;
  /** Present when editing. */
  resident?: ResidentRecord;
}) {
  const router = useRouter();
  const editing = Boolean(resident);

  const [homeId, setHomeId] = useState(resident?.homeId ?? defaultHomeId);
  const [firstName, setFirstName] = useState(resident?.firstName ?? '');
  const [lastName, setLastName] = useState(resident?.lastName ?? '');
  const [preferredName, setPreferredName] = useState(resident?.preferredName ?? '');
  const [room, setRoom] = useState(resident?.room ?? '');
  const [grouping, setGrouping] = useState(resident?.grouping ?? '');
  const [dob, setDob] = useState(resident?.dob ?? '');
  const [pronounKey, setPronounKey] = useState(
    resident ? pronounKeyOf(resident.pronouns.subject) : 'they'
  );
  const [medicaidId, setMedicaidId] = useState('');
  const [active, setActive] = useState(resident?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Set when a plain delete is refused because records exist and the signed-in
  // person is an administrator, who may erase them anyway.
  const [purge, setPurge] = useState<{
    fullName: string;
    counts: { notes: number; documents: number; outcomes: number };
  } | null>(null);
  const [typedName, setTypedName] = useState('');

  async function remove() {
    if (!resident) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/residents/${resident.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    setDeleting(false);
    setConfirmDelete(false);

    if (!res.ok) {
      setDeleteError(body.error ?? 'Could not delete.');
      if (body.reason === 'has_notes' && body.canPurge) {
        setPurge({ fullName: body.fullName, counts: body.counts });
      }
      return;
    }

    router.push(`/residents?home=${homeId}`);
    router.refresh();
  }

  async function purgeEverything() {
    if (!resident) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/residents/${resident.id}/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: typedName })
    });
    const body = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok) {
      setDeleteError(body.error ?? 'Could not delete.');
      return;
    }

    router.push(`/residents?home=${homeId}`);
    router.refresh();
  }

  async function save() {
    setSaving(true);
    setError(null);

    const pronouns = PRONOUN_SETS.find((p) => p.key === pronounKey)!;
    const payload = {
      homeId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      preferredName: preferredName.trim() || null,
      room: room.trim() || null,
      grouping: grouping.trim() || null,
      dob: dob || null,
      pronouns: {
        subject: pronouns.subject,
        object: pronouns.object,
        possessive: pronouns.possessive
      },
      // Blank on an edit means "leave the stored ID alone", not "erase it" —
      // the field starts empty because a stored ID is never sent to the browser.
      ...(medicaidId.trim() ? { medicaidId: medicaidId.trim() } : {}),
      ...(editing ? { active } : { allowDuplicate: duplicateAck })
    };

    const res = await fetch(editing ? `/api/residents/${resident!.id}` : '/api/residents', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not save. Try again.');
      // 409 is the same-name check; offer to override rather than dead-end.
      if (res.status === 409) setDuplicateAck(false);
      return;
    }

    router.push(`/residents?home=${homeId}`);
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

  const isDuplicateError = error?.includes('already on this house');

  return (
    <div className="space-y-4">
      {error ? (
        <Alert tone={isDuplicateError ? 'warning' : 'error'} title={isDuplicateError ? 'Already on the roster' : undefined}>
          <p>{error}</p>
          {isDuplicateError ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand-teal"
                checked={duplicateAck}
                onChange={(e) => setDuplicateAck(e.target.checked)}
              />
              <span className="text-sm">
                This is a different person with the same name. Add them anyway.
              </span>
            </label>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-brand-navy">Name</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className={labelClass}>
              Legal first name
            </label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="lastName" className={labelClass}>
              Last name
            </label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="preferredName" className={labelClass}>
            Goes by <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="preferredName"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder={firstName ? `Leave blank to use "${firstName}"` : 'Preferred name'}
            className={inputClass}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            Used in notes and on screen. The legal name still prints on the form.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-brand-navy">Pronouns</h2>
        <div className="flex flex-wrap gap-2">
          {PRONOUN_SETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPronounKey(p.key)}
              className={
                pronounKey === p.key
                  ? 'rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white'
                  : 'rounded-xl border border-brand-navy/15 bg-white px-4 py-2.5 text-sm font-medium text-brand-navy hover:bg-brand-sand'
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-brand-slate">
          Written into every generated note. Never guessed from the name.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-brand-navy">Placement</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="home" className={labelClass}>
              House
            </label>
            <select
              id="home"
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
            <label htmlFor="room" className={labelClass}>
              Room <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="2B"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="grouping" className={labelClass}>
              Group <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="grouping"
              value={grouping}
              onChange={(e) => setGrouping(e.target.value)}
              placeholder="North Hall"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-brand-slate">
              Anything you sort by: hall, wing, program.
            </p>
          </div>
          <div>
            <label htmlFor="dob" className={labelClass}>
              Date of birth <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="dob"
              type="date"
              value={dob ?? ''}
              onChange={(e) => setDob(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-brand-navy">Medicaid ID</h2>
        <p className="mb-4 text-xs text-brand-slate">
          Encrypted before it is stored, and decrypted only onto the note being written.
        </p>
        <input
          value={medicaidId}
          onChange={(e) => setMedicaidId(e.target.value)}
          placeholder={editing ? 'Leave blank to keep the current ID' : 'Optional'}
          className={inputClass}
          autoComplete="off"
          inputMode="numeric"
        />
      </Card>

      {editing ? (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-brand-navy">Status</h2>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-brand-teal"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-sm text-brand-navy">
              Currently living here
              <span className="mt-0.5 block text-xs text-brand-slate">
                Unchecking removes them from the daily roster. Their signed notes stay exactly as
                they are — those are permanent records and are never deleted.
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-brand-navy">Remove this resident</h2>
          <p className="mb-3 text-xs text-brand-slate">
            If nothing has been documented about them yet, they are removed outright. Once notes
            exist the usual answer is to untick &ldquo;currently living here&rdquo; above — that
            takes them off the daily roster and keeps their history.
          </p>

          {deleteError ? (
            <div className="mb-3">
              <Alert tone="warning">{deleteError}</Alert>
            </div>
          ) : null}

          {purge ? (
            <div className="mb-3 rounded-xl border border-status-missing/40 bg-status-missing/5 p-3">
              <p className="text-xs font-semibold text-brand-navy">
                Delete {purge.fullName} and everything on file?
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-brand-slate">
                <li>
                  {purge.counts.notes} progress note{purge.counts.notes === 1 ? '' : 's'}, signed
                  ones included, and any addenda
                </li>
                <li>
                  {purge.counts.outcomes} service-plan outcome
                  {purge.counts.outcomes === 1 ? '' : 's'} and their support activities
                </li>
                <li>
                  {purge.counts.documents} uploaded document
                  {purge.counts.documents === 1 ? '' : 's'}, files and all
                </li>
              </ul>
              <p className="mt-2 text-xs text-brand-slate">
                This cannot be undone, and signed notes are normally permanent records. An entry
                naming you, the count above, and the time is written to the audit log first — that
                entry stays. Only do this for someone entered by mistake or where you are required
                to destroy the records.
              </p>

              <label
                htmlFor="purgeConfirm"
                className="mt-3 block text-xs font-semibold text-brand-navy"
              >
                Type <span className="font-mono">{purge.fullName}</span> to confirm
              </label>
              <input
                id="purgeConfirm"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={purgeEverything}
                  disabled={
                    deleting || typedName.trim().toLowerCase() !== purge.fullName.toLowerCase()
                  }
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Delete permanently
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPurge(null);
                    setTypedName('');
                    setDeleteError(null);
                  }}
                >
                  Keep their records
                </Button>
              </div>
            </div>
          ) : null}

          {purge ? null : confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-navy">
                Delete {firstName || 'this resident'} permanently?
              </span>
              <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Yes, delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-status-missing"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete resident
            </button>
          )}
        </Card>
      ) : null}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving || !firstName.trim() || !lastName.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editing ? 'Save changes' : 'Add resident'}
        </Button>
        <Button href={`/residents?home=${homeId}`} variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  );
}
