/**
 * Debounced autosave with a real flush.
 *
 * The note editor debounces its server save by 1.2 s and every tap resets the
 * timer. Two things then went wrong, both of them silent:
 *
 *  1. **The AI draft 400'd on fast taps.** "Write from my entries" posted only
 *     `{noteId}`, and the server re-read `structured_data` from Postgres. A DSP
 *     who tapped quickly and hit generate had nothing in the row yet, so the
 *     server answered *"Record what happened this shift first"* on a screen
 *     visibly full of selections. Widening the debounce only moves the window;
 *     the fix is to be able to *flush* — write what is on screen now, and know
 *     when that has landed.
 *
 *  2. **Saves could overlap and land out of order.** Two PATCHes in flight at
 *     once can complete in either order, so a slow older request could
 *     overwrite a newer one. This runs one save at a time and re-checks for
 *     newer data when each finishes, so the last write always wins.
 *
 * The server stays the source of truth for the draft — the AI route still reads
 * the row rather than trusting a client payload, because the grounding check
 * compares the generated narrative against what is *stored*. Sending unsaved
 * data would ground a narrative against something the record does not contain.
 */

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'offline';

export type FlushResult =
  /** Everything on screen is on the server. */
  | 'saved'
  /** Nothing was waiting to be written. */
  | 'nothing'
  /** The write did not land. The caller must not proceed as if it had. */
  | 'failed';

export type Autosave<T> = {
  /** Record a change. Writes after `delayMs` of quiet. */
  schedule: (payload: T) => void;
  /**
   * Write immediately and wait for it. Safe to call at any time, including
   * while a save is already running — it resolves once the newest payload has
   * landed, not merely once the in-flight request finishes.
   */
  flush: () => Promise<FlushResult>;
  /** Drop the pending timer. For unmount; the local draft copy still exists. */
  cancel: () => void;
  /** True when there is work the server has not accepted yet. */
  isDirty: () => boolean;
};

export function createAutosave<T>({
  delayMs,
  save,
  onState
}: {
  delayMs: number;
  /** Must reject when the write did not land. */
  save: (payload: T) => Promise<void>;
  onState?: (state: AutosaveState) => void;
}): Autosave<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { payload: T } | null = null;
  let inFlight: Promise<FlushResult> | null = null;

  const setState = (state: AutosaveState) => onState?.(state);

  function drain(): Promise<FlushResult> {
    if (inFlight) return inFlight;

    const run = (async (): Promise<FlushResult> => {
      let wrote = false;
      // Loop rather than save once: anything scheduled while a request was in
      // flight is picked up here, so a flush never resolves on stale data.
      while (pending !== null) {
        const { payload } = pending;
        pending = null;
        setState('saving');
        try {
          await save(payload);
          wrote = true;
        } catch {
          // Say so rather than reporting a clean save. The caller keeps its
          // local copy and the DSP sees "Saved on this device only".
          setState('offline');
          return 'failed';
        }
      }
      if (wrote) setState('saved');
      return wrote ? 'saved' : 'nothing';
    })();

    inFlight = run;
    void run.then(
      () => {
        if (inFlight === run) inFlight = null;
      },
      () => {
        if (inFlight === run) inFlight = null;
      }
    );
    return run;
  }

  return {
    schedule(payload: T) {
      pending = { payload };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, delayMs);
    },

    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return drain();
    },

    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    isDirty() {
      return pending !== null || inFlight !== null;
    }
  };
}
