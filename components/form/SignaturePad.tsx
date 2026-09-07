'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, ImageUp, Loader2, PenLine, Type } from 'lucide-react';

/**
 * Sign a note by drawing, typing, or uploading an image of a signature.
 *
 * The paper Form #680 carries a handwritten signature, so drawing is the
 * default. But a DSP on a desktop with a mouse produces something that looks
 * nothing like their signature, and someone who already has a signature image
 * shouldn't have to redraw it every shift — so all three are offered and all
 * three produce the same thing: a PNG data URL.
 *
 * Whichever mode is used, the attestation checkbox next to this component is
 * still required per note. That is what makes it a signature rather than a
 * picture; the image is evidence of a deliberate act, not a substitute for one.
 */

export type SignatureMethod = 'drawn' | 'typed' | 'uploaded';

type Mode = SignatureMethod;

/** Keeps the PNG well under the API's 400KB cap. */
const MAX_WIDTH = 720;
const MAX_HEIGHT = 200;

/**
 * A script face, falling back through what macOS, Windows, and Android
 * actually ship. The generic `cursive` at the end means every device renders
 * something handwritten rather than the default sans.
 */
const SCRIPT_STACK =
  '"Snell Roundhand", "Brush Script MT", "Segoe Script", "Bradley Hand", "Apple Chancery", cursive';

const STORAGE_KEY = 'ghh.signature.saved';

export function SignaturePad({
  onChange,
  defaultName,
  disabled
}: {
  onChange: (dataUrl: string | null, method: SignatureMethod) => void;
  /** The signer's name, used to prefill the typed variant. */
  defaultName?: string;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('drawn');

  // ---------------------------------------------------------------- drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the backing store to the device pixel ratio, or strokes render blurry
  // on every phone made in the last decade.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    // Preserve any existing ink across a resize (e.g. orientation change).
    const previous = hasInk.current ? canvas.toDataURL('image/png') : null;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2d45';

    if (previous) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = previous;
    }
  }, []);

  useEffect(() => {
    if (mode !== 'drawn') return;
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize, mode]);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasInk.current) {
      onChange(canvas.toDataURL('image/png'), 'drawn');
    }
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null, 'drawn');
  }

  // ------------------------------------------------------------------ typed
  const [typed, setTyped] = useState(defaultName ?? '');

  useEffect(() => {
    if (mode !== 'typed') return;

    const value = typed.trim();
    if (!value) {
      onChange(null, 'typed');
      return;
    }

    let cancelled = false;

    void (async () => {
      // The shipped script face, resolved from the variable next/font sets on
      // <html>. Canvas takes a font string, not a class, so the family has to
      // be read out rather than applied.
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-fb-signature')
        .trim();
      const family = resolved ? `${resolved}, ${SCRIPT_STACK}` : SCRIPT_STACK;

      // Canvas does not wait for webfonts: draw before the face has loaded and
      // it silently renders the fallback, with no error and no second attempt.
      try {
        await document.fonts.load(`54px ${family}`, value);
        await document.fonts.ready;
      } catch {
        // Carry on with whatever is available rather than leaving them unable
        // to sign.
      }
      if (cancelled) return;

      // Render on a fresh offscreen canvas rather than reusing the drawing one,
      // so switching modes never mixes ink from both.
      const canvas = document.createElement('canvas');
      const ratio = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Shrink to fit rather than clipping — a long name must not run off the
      // edge of the signature block on the printed form.
      let size = 54;
      do {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(value).width <= MAX_WIDTH - 32) break;
        size -= 2;
      } while (size > 18);

      /*
       * Crop the image to the ink.
       *
       * This used to draw into the full 720x200 pad. A short name inks maybe
       * 280x60 of that, and the PDF places the result with objectFit:'contain'
       * inside a 150x42 box — so the scale was driven by the empty canvas, not
       * the name. The signature came out around a third of its intended size
       * and floated in the middle of its box, clear of the line it was meant to
       * sit on. Fitting the bitmap to the glyphs fixes the size and the
       * position together, because the box then contains nothing but signature.
       */
      const m = ctx.measureText(value);
      const ascent = m.actualBoundingBoxAscent || size * 0.75;
      const descent = m.actualBoundingBoxDescent || size * 0.3;
      const padX = Math.round(size * 0.12);
      const padY = Math.round(size * 0.08);

      const w = Math.ceil(m.width + padX * 2);
      const h = Math.ceil(ascent + descent + padY * 2);

      canvas.width = w * ratio;
      canvas.height = h * ratio;

      // Sizing the canvas resets the context, so everything is set again here.
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#0f2d45';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${size}px ${family}`;
      ctx.fillText(value, padX, padY + ascent);

      onChange(canvas.toDataURL('image/png'), 'typed');
    })();

    return () => {
      cancelled = true;
    };
    // onChange identity changes on every parent render; depending on it would
    // re-render the signature in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, mode]);

  // --------------------------------------------------------------- uploaded
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  // A saved signature lives in localStorage, on this device only. It is a
  // convenience, not a credential: it never leaves the browser on its own, and
  // the attestation still has to be ticked for every note.
  useEffect(() => {
    if (mode !== 'uploaded' || uploadPreview) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUploadPreview(saved);
        setRemember(true);
        onChange(saved, 'uploaded');
      }
    } catch {
      // Private browsing blocks localStorage. Not being able to reuse a
      // signature is not worth surfacing as an error.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleFile(file: File) {
    setUploadError(null);

    if (!file.type.startsWith('image/')) {
      setUploadError('That is not an image. Use a PNG or JPG photo of your signature.');
      return;
    }
    if (file.size > 8_000_000) {
      setUploadError('That image is very large. Crop it to just the signature and try again.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await normalizeImage(file);
      setUploadPreview(dataUrl);
      onChange(dataUrl, 'uploaded');
      if (remember) persist(dataUrl);
    } catch {
      setUploadError('That image could not be read. Try a PNG or JPG.');
    } finally {
      setUploading(false);
    }
  }

  function persist(dataUrl: string | null) {
    try {
      if (dataUrl) window.localStorage.setItem(STORAGE_KEY, dataUrl);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // See above — storage may be unavailable.
    }
  }

  function clearUpload() {
    setUploadPreview(null);
    setUploadError(null);
    persist(null);
    onChange(null, 'uploaded');
    if (fileRef.current) fileRef.current.value = '';
  }

  // ------------------------------------------------------------------- view
  function switchTo(next: Mode) {
    if (mode === next) return;
    // Whatever was captured in the old mode no longer applies, and leaving it
    // set would let someone sign with a signature they can no longer see.
    onChange(null, next);
    setMode(next);
  }

  const tab = (value: Mode, label: string, Icon: typeof PenLine) => (
    <button
      key={value}
      type="button"
      onClick={() => switchTo(value)}
      disabled={disabled}
      aria-pressed={mode === value}
      className={
        mode === value
          ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-brand-navy shadow-sm'
          : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand-slate hover:text-brand-navy'
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-xl bg-brand-sand/70 p-1">
        {tab('drawn', 'Draw', PenLine)}
        {tab('typed', 'Type', Type)}
        {tab('uploaded', 'Upload', ImageUp)}
      </div>

      {mode === 'drawn' ? (
        <>
          <div className="relative rounded-xl border border-brand-navy/15 bg-white">
            <canvas
              ref={canvasRef}
              className="signature-canvas h-36 w-full rounded-xl"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              onPointerCancel={end}
            />
            {empty ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-brand-slate">
                Sign here
              </p>
            ) : null}
            <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-brand-navy/20" />
          </div>

          <button
            type="button"
            onClick={clearDrawing}
            disabled={disabled || empty}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear signature
          </button>
        </>
      ) : null}

      {mode === 'typed' ? (
        <>
          <label htmlFor="typed-signature" className="sr-only">
            Type your name to sign
          </label>
          <input
            id="typed-signature"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={disabled}
            placeholder="Type your full name"
            autoComplete="off"
            className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />

          <div className="relative mt-3 flex h-36 items-center rounded-xl border border-brand-navy/15 bg-white px-6">
            {typed.trim() ? (
              <span
                className="truncate text-5xl leading-[1.4] text-brand-navy"
                style={{ fontFamily: `var(--font-fb-signature), ${SCRIPT_STACK}` }}
              >
                {typed}
              </span>
            ) : (
              <span className="w-full text-center text-sm text-brand-slate">
                Your signature appears here
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-brand-navy/20" />
          </div>

          <p className="mt-2 text-xs text-brand-slate">
            A typed signature is legally equivalent to a drawn one when paired with the
            attestation below.
          </p>
        </>
      ) : null}

      {mode === 'uploaded' ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          <div className="relative flex h-36 items-center justify-center rounded-xl border border-dashed border-brand-navy/25 bg-white px-6">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand-slate" />
            ) : uploadPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={uploadPreview}
                alt="Your signature"
                className="max-h-28 max-w-full object-contain"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                className="flex flex-col items-center gap-1.5 text-sm font-semibold text-brand-teal hover:underline"
              >
                <ImageUp className="h-5 w-5" />
                Choose a signature image
              </button>
            )}
          </div>

          {uploadError ? (
            <p className="mt-2 text-xs font-medium text-status-missing">{uploadError}</p>
          ) : (
            <p className="mt-2 text-xs text-brand-slate">
              A photo of your signature on white paper works well.
            </p>
          )}

          {uploadPreview ? (
            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-teal"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    persist(e.target.checked ? uploadPreview : null);
                  }}
                />
                <span className="text-xs text-brand-slate">
                  Remember this signature on this device. You still confirm the attestation on
                  every note.
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={clearUpload}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Decode an uploaded image, scale it into the signature box, and re-encode as
 * PNG.
 *
 * Re-encoding is the point: it caps the size so the upload fits the API limit,
 * normalizes JPEG/WebP to the PNG the renderer expects, and drops any EXIF the
 * original carried — a phone photo of a signature otherwise ships GPS
 * coordinates of the house into the note record.
 */
function normalizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('unreadable'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('undecodable'));
      img.onload = () => {
        const scale = Math.min(MAX_WIDTH / img.width, MAX_HEIGHT / img.height, 1);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas'));
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
