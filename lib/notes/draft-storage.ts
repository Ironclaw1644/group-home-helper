import type { StructuredData } from '@/lib/types';

/**
 * Local draft cache.
 *
 * Group homes have unreliable wifi. A DSP who loses connection mid-note must
 * not lose the note — the server save is best-effort, this is the guarantee.
 * On load, whichever copy is newer wins.
 */

const PREFIX = 'ghh:draft:';

export type LocalDraft = {
  noteId: string;
  structuredData: StructuredData;
  narrative: string;
  savedAt: number;
};

function key(noteId: string) {
  return `${PREFIX}${noteId}`;
}

export function saveLocalDraft(draft: Omit<LocalDraft, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: LocalDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(key(draft.noteId), JSON.stringify(payload));
  } catch {
    // Private mode or a full quota. The server save is still in play; there is
    // nothing useful to tell the user here.
  }
}

export function readLocalDraft(noteId: string): LocalDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    if (parsed.noteId !== noteId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Called once a note is signed, or once the server copy is known to be current. */
export function clearLocalDraft(noteId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(noteId));
  } catch {
    /* nothing to do */
  }
}

/**
 * True when the locally cached draft is newer than what the server returned,
 * which means the last session ended before a save landed.
 */
export function localDraftIsNewer(local: LocalDraft | null, serverUpdatedAt: string): boolean {
  if (!local) return false;
  const serverMs = new Date(serverUpdatedAt).getTime();
  if (Number.isNaN(serverMs)) return true;
  // A second of slack keeps a save that raced the page load from looking newer.
  return local.savedAt > serverMs + 1000;
}
