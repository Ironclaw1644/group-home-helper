/**
 * One FlipBrief film: an intro card, the recording in a phone, an outro card.
 *
 * Everything inside the phone's screen is the screencast, untouched. What this
 * file adds sits around it or on top of it and is never mistaken for the app:
 * the device, the camera, a ring where a finger landed, the captions, and a
 * pill that says when time has been sped up or how long a wait really took.
 */
import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

export const FPS = 30;
export const W = 1080;
export const H = 1920;
/**
 * Frames of intro before the recording starts playing. The title is up by
 * frame ~44 and the whole card by ~54; it holds until INTRO_OUT (about 3 s
 * of title) and fades out before the phone rises. At 72 frames it was gone
 * before anyone could read it.
 */
export const B0 = 180;
/** Where the intro starts to fade out; it is gone by B0 - 18. */
const INTRO_OUT = B0 - 44;
export const OUTRO = 100;

export const C = {
  forest: '#14452F',
  moss: '#1E6244',
  sand: '#D9B382',
  amber: '#916A39',
  paper: '#FBF8F3',
  card: '#FFFDFA',
  ink: '#12241C',
  slate: '#5B6862'
};

export type Events = {
  flow: string;
  question: string;
  title: string;
  /** A line under the title on the intro card. */
  subtitle?: string | null;
  seconds: number;
  view: { width: number; height: number };
  taps: { t: number; x: number; y: number }[];
  captions: { t: number; text: string; y?: number; zoom?: number }[];
  focus?: { t: number; y: number; zoom?: number | null }[];
  sped: { from: number; to: number; speed: number; realSeconds: number }[];
  timer: { from: number; to: number; realSeconds: number; label: string } | null;
};

/* ---------------------------------------------------------------- fonts */

if (typeof document !== 'undefined') {
  const h = delayRender('archivo');
  new FontFace('Archivo', `url(${staticFile('fonts/archivo-latin-var.woff2')}) format('woff2')`, {
    weight: '100 900',
    stretch: '62% 125%'
  })
    .load()
    .then((f) => {
      document.fonts.add(f);
      continueRender(h);
    })
    .catch((e) => {
      console.error(e);
      continueRender(h);
    });
}
const FONT = 'Archivo, system-ui, sans-serif';

/* --------------------------------------------------------------- timing */

const EOUT = Easing.bezier(0.22, 1, 0.36, 1);
const EINOUT = Easing.bezier(0.65, 0, 0.35, 1);
const tw = (f: number, a: number, b: number, e = EOUT) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });
const mix = (t: number, a: number, b: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* --------------------------------------------------------------- layout */

/** CSS px of the recorded page -> canvas px. */
const K = 1.575;
const SB = 44; // status bar, CSS px
const BEZEL = 18;
const SCREEN_W = 390 * K;
const PHONE_W = SCREEN_W + BEZEL * 2;
const PHONE_H = (SB + 800) * K + BEZEL * 2;
const PHONE_X = (W - PHONE_W) / 2;
const PHONE_Y = 104;
/** The part of the canvas the phone lives in; captions sit below it. */
const STAGE = { top: 40, bottom: 1540 };
const BAND_Y = 1556;
const ZOOM = 1.55;

/** A point on the recorded page, in canvas px with the phone at rest. */
const pagePoint = (x: number, y: number) => ({
  x: PHONE_X + BEZEL + x * K,
  y: PHONE_Y + BEZEL + (SB + y) * K
});

/* --------------------------------------------------------------- camera */

type Cam = { s: number; fx: number; fy: number };

/**
 * The phone shown whole is too small to read on the phone somebody watches
 * this on, so after the first beat the camera sits close (the screen fills
 * the width, so it only ever pans up and down) and follows the action: a
 * little before each tap it moves to where the finger will land, and each
 * caption can point it somewhere (`y`, page px) or pull back (`zoom: 1`).
 * Computed once and smoothed twice, so moves ease in and out.
 */
function useCamera(ev: Events, total: number): Cam[] {
  return useMemo(() => {
    const rest = pagePoint(195, 400);
    const marks = [
      ...ev.captions.map((c) => ({ t: c.t - 0.2, y: c.y ?? 400, s: c.zoom ?? ZOOM })),
      ...(ev.focus ?? []).map((c) => ({ t: c.t, y: c.y, s: c.zoom ?? ZOOM })),
      ...ev.taps.map((tp) => ({ t: tp.t - 0.6, y: tp.y, s: ZOOM }))
    ].sort((p, q) => p.t - q.t);
    const out: Cam[] = [];
    let a = { s: 1, fx: rest.x, fy: rest.y };
    let b = { ...a };
    const k = 0.1;
    for (let f = 0; f < total; f++) {
      const t = (f - B0) / FPS;
      let target = { s: 1, fx: rest.x, fy: rest.y };
      for (const m of marks) if (m.t <= t) target = { s: m.s, fx: rest.x, fy: pagePoint(195, m.y).y };
      if (t > ev.seconds - 1.0) target = { s: 1, fx: rest.x, fy: rest.y };
      a = { s: mix(k, a.s, target.s), fx: mix(k, a.fx, target.fx), fy: mix(k, a.fy, target.fy) };
      b = { s: mix(k, b.s, a.s), fx: mix(k, b.fx, a.fx), fy: mix(k, b.fy, a.fy) };
      out.push({ ...b });
    }
    return out;
  }, [ev, total]);
}

function clampAxis(pos: number, size: number, lo: number, hi: number) {
  return size <= hi - lo ? clamp(pos, lo, hi - size) : clamp(pos, hi - size, lo);
}

/** translate/scale that brings the focus to the middle without showing empty stage. */
function camTransform(c: Cam) {
  const pull = clamp((c.s - 1) / (ZOOM - 1), 0, 1);
  const dy = mix(pull, c.fy, (STAGE.top + STAGE.bottom) / 2);
  let left = W / 2 - (PHONE_W * c.s) / 2;
  let top = dy + (PHONE_Y - c.fy) * c.s;
  left = clampAxis(left, PHONE_W * c.s, 0, W);
  top = clampAxis(top, PHONE_H * c.s, STAGE.top, STAGE.bottom);
  return `translate(${left}px, ${top}px) scale(${c.s})`;
}

/* ---------------------------------------------------------------- parts */

const Mark: React.FC<{ size: number; f?: number; animate?: boolean }> = ({ size, f = 99, animate = false }) => {
  const g = (a: number, b: number) => (animate ? tw(f, a, b) : 1);
  const tip = animate ? spring({ frame: f - 14, fps: FPS, config: { damping: 9, stiffness: 120, mass: 0.6 } }) : 1;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path fill={C.forest} d="M12 8h12v48H12z" style={{ transform: `scaleY(${g(0, 12)})`, transformOrigin: '18px 56px' }} />
      <path fill={C.forest} d="M12 8h34v12H12z" style={{ transform: `scaleX(${g(5, 16)})`, transformOrigin: '12px 14px' }} />
      <path fill={C.forest} d="M12 30h26v11H12z" style={{ transform: `scaleX(${g(9, 20)})`, transformOrigin: '12px 35px' }} />
      <path
        fill={C.sand}
        d="M38 30h4l12-9v11l-12 9h-4z"
        style={{ transform: `rotate(${(1 - tip) * 70}deg)`, transformOrigin: '38px 41px', opacity: animate ? clamp(tip * 3, 0, 1) : 1 }}
      />
    </svg>
  );
};

const Wordmark: React.FC<{ size: number; color?: string }> = ({ size, color = C.forest }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.32 }}>
    <Mark size={size * 1.25} />
    <span style={{ font: `700 ${size}px/1 ${FONT}`, fontStretch: '108%', color, letterSpacing: '-0.01em' }}>FlipBrief</span>
  </div>
);

const StatusBar: React.FC = () => (
  <div
    style={{
      position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SB * K, background: '#FEFEFE',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${26 * K}px 0 ${30 * K}px`,
      boxSizing: 'border-box', font: `600 ${15 * K}px/1 ${FONT}`, color: C.ink
    }}
  >
    <span>9:41</span>
    <span style={{ position: 'absolute', left: SCREEN_W / 2 - 6 * K, top: SB * K / 2 - 6 * K, width: 12 * K, height: 12 * K, borderRadius: 99, background: '#0B120F' }} />
    <svg viewBox="0 0 72 13" width={62 * K * 0.8} height={11 * K * 0.8}>
      <g fill={C.ink}>
        <rect x="0" y="9" width="3.2" height="4" rx=".8" /><rect x="4.8" y="6.5" width="3.2" height="6.5" rx=".8" />
        <rect x="9.6" y="3.8" width="3.2" height="9.2" rx=".8" /><rect x="14.4" y="1" width="3.2" height="12" rx=".8" />
        <path d="M30.5 2.2c2.9 0 5.5 1.1 7.5 3l1.3-1.4C37 1.6 33.9.3 30.5.3S24 1.6 21.7 3.8L23 5.2c2-1.9 4.6-3 7.5-3zm0 3.9c1.8 0 3.4.7 4.7 1.8l1.3-1.4c-1.6-1.4-3.7-2.3-6-2.3s-4.4.9-6 2.3l1.3 1.4c1.3-1.1 2.9-1.8 4.7-1.8zm0 3.9c.8 0 1.5.3 2 .8l-2 2.2-2-2.2c.5-.5 1.2-.8 2-.8z" />
        <rect x="46" y=".8" width="22" height="11.4" rx="3.4" fill="none" stroke={C.ink} strokeOpacity=".4" strokeWidth="1" />
        <rect x="47.8" y="2.6" width="16.5" height="7.8" rx="2" />
      </g>
    </svg>
  </div>
);

const TapRing: React.FC<{ t: number; x: number; y: number }> = ({ t, x, y }) => {
  const f = useCurrentFrame();
  const at = B0 + t * FPS;
  const d = f - at;
  if (d < -6 || d > 22) return null;
  const press = tw(f, at - 6, at); // finger arrives
  const ring = tw(f, at, at + 20);
  const r = 26 * K;
  return (
    <>
      <div
        style={{
          position: 'absolute', left: x * K - r, top: (SB + y) * K - r, width: r * 2, height: r * 2, borderRadius: 999,
          background: 'rgba(20,69,47,.22)', transform: `scale(${mix(press, 1.25, 0.82) * mix(ring, 1, 1.05)})`,
          opacity: press * (1 - ring)
        }}
      />
      <div
        style={{
          position: 'absolute', left: x * K - r, top: (SB + y) * K - r, width: r * 2, height: r * 2, borderRadius: 999,
          border: `${3}px solid ${C.sand}`, boxSizing: 'border-box', transform: `scale(${mix(ring, 0.8, 1.9)})`,
          opacity: d < 0 ? 0 : 0.95 * (1 - ring)
        }}
      />
    </>
  );
};

const Phone: React.FC<{ ev: Events; videoFrame: number }> = ({ ev, videoFrame }) => (
  <div
    style={{
      position: 'absolute', left: 0, top: 0, width: PHONE_W, height: PHONE_H, borderRadius: 82, background: '#16211C',
      boxShadow: '0 60px 120px rgba(18,36,28,.22), 0 18px 40px rgba(18,36,28,.16), inset 0 0 0 2px rgba(255,255,255,.08)',
      transformOrigin: '0 0'
    }}
  >
    {/* side buttons */}
    <i style={{ position: 'absolute', right: -5, top: 300, width: 5, height: 120, borderRadius: 3, background: '#1E2B25' }} />
    <i style={{ position: 'absolute', left: -5, top: 260, width: 5, height: 80, borderRadius: 3, background: '#1E2B25' }} />
    <i style={{ position: 'absolute', left: -5, top: 360, width: 5, height: 80, borderRadius: 3, background: '#1E2B25' }} />
    <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: (SB + 800) * K, borderRadius: 64, overflow: 'hidden', background: '#FEFEFE' }}>
      <div style={{ position: 'absolute', left: 0, top: SB * K, width: SCREEN_W, height: 800 * K }}>
        <Freeze frame={videoFrame}>
          <OffthreadVideo src={staticFile(`${ev.flow}/screen.mp4`)} muted style={{ width: SCREEN_W, height: 800 * K, display: 'block' }} />
        </Freeze>
      </div>
      <StatusBar />
      {ev.taps.map((tp, i) => (
        <TapRing key={i} {...tp} />
      ))}
    </div>
  </div>
);

/** "Sped up 4×" while time is compressed; a live stopwatch while the assistant writes. */
const Pill: React.FC<{ ev: Events }> = ({ ev }) => {
  const f = useCurrentFrame();
  const t = (f - B0) / FPS;
  let text: React.ReactNode = null;
  let vis = 0;
  for (const s of ev.sped) {
    const v = tw(f, B0 + s.from * FPS - 4, B0 + s.from * FPS + 8) * (1 - tw(f, B0 + s.to * FPS, B0 + s.to * FPS + 10));
    if (v > 0) {
      vis = v;
      text = (
        <>
          <svg width="30" height="22" viewBox="0 0 30 22"><path d="M2 2l12 9-12 9zM15 2l12 9-12 9z" fill={C.sand} /></svg>
          <span>Sped up {s.speed}×</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>· took {Math.round(s.realSeconds)} s</span>
        </>
      );
    }
  }
  const tm = ev.timer;
  if (tm) {
    const a = B0 + tm.from * FPS;
    const b = B0 + tm.to * FPS;
    const v = tw(f, a - 4, a + 6) * (1 - tw(f, b + 75, b + 87));
    if (v > 0) {
      vis = v;
      const running = t < tm.to;
      // Real elapsed time: this span plays at 1×, so footage time is wall time.
      const secs = running ? Math.max(0, t - tm.from) : tm.realSeconds;
      text = (
        <>
          <span style={{ width: 16, height: 16, borderRadius: 99, background: running ? C.sand : '#7FC39B', opacity: running ? 0.6 + 0.4 * Math.sin(f / 3) : 1 }} />
          <span>{running ? tm.label : 'Written in'}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 92 }}>{secs.toFixed(1)} s</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>· real time</span>
        </>
      );
    }
  }
  if (!text) return null;
  return (
    <div style={{ position: 'absolute', top: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: vis, transform: `translateY(${(1 - vis) * -16}px)` }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', borderRadius: 999, background: 'rgba(20,69,47,.94)',
          color: C.paper, font: `600 32px/1 ${FONT}`, boxShadow: '0 12px 30px rgba(18,36,28,.25)'
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Captions: React.FC<{ ev: Events; fadeOut: number }> = ({ ev, fadeOut }) => {
  const f = useCurrentFrame();
  return (
    <>
      {ev.captions.map((c, i) => {
        const a = B0 + c.t * FPS;
        const next = ev.captions[i + 1];
        const b = next ? B0 + next.t * FPS : B0 + ev.seconds * FPS + 10;
        if (f < a || f > b + 3) return null;
        // The outgoing line is gone before the next one rises, so two
        // captions are never on screen at once.
        const inn = tw(f, a + 3, a + 17);
        const out = tw(f, b - 7, b + 2, EINOUT);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: 70, right: 70, top: BAND_Y + 58, textAlign: 'center',
              font: `640 58px/1.18 ${FONT}`, fontStretch: '104%', color: C.forest, letterSpacing: '-0.012em', whiteSpace: 'pre-line',
              opacity: inn * (1 - out) * fadeOut, transform: `translateY(${(1 - inn) * 22 - out * 14}px)`
            }}
          >
            {c.text}
          </div>
        );
      })}
    </>
  );
};

/* ------------------------------------------------------------------ film */

export const Film: React.FC<{ ev: Events }> = ({ ev }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const bodyFrames = Math.round(ev.seconds * FPS);
  const end = B0 + bodyFrames;
  const cams = useCamera(ev, durationInFrames);
  const cam = cams[Math.min(f, cams.length - 1)];

  // Intro out, phone in.
  const introOut = tw(f, INTRO_OUT, B0 - 18, EINOUT);
  const phoneIn = spring({ frame: f - (B0 - 18), fps: FPS, config: { damping: 16, stiffness: 90, mass: 0.9 } });
  // Phone out, outro in.
  const phoneOut = tw(f, end + 4, end + 26, EINOUT);
  const outroIn = f - (end + 16);
  const videoFrame = clamp(f - B0, 0, bodyFrames - 1);
  const progress = clamp((f - B0) / bodyFrames, 0, 1);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT }}>
      {/* Paper with a little warmth in it. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 900px at 50% 38%, rgba(217,179,130,.20), rgba(217,179,130,0) 70%), radial-gradient(900px 700px at 85% 95%, rgba(20,69,47,.07), rgba(20,69,47,0) 70%)`
        }}
      />

      {/* The phone, on its camera. */}
      {f >= B0 - 20 && f < end + 30 ? (
        <div
          style={{
            position: 'absolute', inset: 0, opacity: Math.min(clamp(phoneIn * 1.4, 0, 1), 1 - phoneOut),
            transform: `translateY(${(1 - phoneIn) * 220 + phoneOut * 60}px) scale(${1 - phoneOut * 0.04})`, transformOrigin: '50% 45%'
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, transform: camTransform(cam), transformOrigin: '0 0' }}>
            <Phone ev={ev} videoFrame={videoFrame} />
          </div>
        </div>
      ) : null}

      {/* Caption band. */}
      {f >= B0 - 10 && f < end + 30 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: BAND_Y - 70, bottom: 0, opacity: Math.min(tw(f, B0 - 10, B0 + 6), 1 - phoneOut) }}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, rgba(251,248,243,0) 0px, ${C.paper} 70px)` }} />
          <div style={{ position: 'absolute', left: 120, right: 120, top: 70 + 22, height: 4, borderRadius: 4, background: 'rgba(20,69,47,.10)' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 4, background: C.sand }} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center', opacity: 0.85 }}>
            <Wordmark size={26} />
          </div>
        </div>
      ) : null}
      <Captions ev={ev} fadeOut={1 - phoneOut} />
      <Pill ev={ev} />

      {/* Intro card. */}
      {f < B0 + 4 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - introOut, transform: `translateY(${-introOut * 90}px)` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 90px', marginTop: -120 }}>
            <Mark size={150} f={f} animate />
            <div style={{ marginTop: 64, font: `700 34px/1.2 ${FONT}`, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.amber, opacity: tw(f, 10, 24), transform: `translateY(${(1 - tw(f, 10, 24)) * 14}px)` }}>
              {ev.question}
            </div>
            <div style={{ marginTop: 30, font: `760 96px/1.04 ${FONT}`, fontStretch: '106%', letterSpacing: '-0.025em', color: C.forest }}>
              {ev.title.split(' ').map((w, i) => {
                const t = tw(f, 16 + i * 2.2, 32 + i * 2.2);
                return (
                  <span key={i} style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 26}px)`, marginRight: '0.24em' }}>
                    {w}
                  </span>
                );
              })}
            </div>
            {ev.subtitle ? (
              <div style={{ marginTop: 40, font: `500 40px/1.35 ${FONT}`, color: C.slate, opacity: tw(f, 40, 54) }}>
                {ev.subtitle}
              </div>
            ) : null}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Outro card. */}
      {outroIn > -2 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -80 }}>
            <Mark size={130} f={outroIn} animate />
            <div style={{ marginTop: 56, font: `760 84px/1.06 ${FONT}`, fontStretch: '106%', letterSpacing: '-0.025em', color: C.forest, opacity: tw(outroIn, 8, 22), transform: `translateY(${(1 - tw(outroIn, 8, 22)) * 22}px)` }}>
              FlipBrief
            </div>
            <div
              style={{
                marginTop: 52, padding: '24px 44px', borderRadius: 999, background: C.forest, color: C.paper, font: `650 38px/1 ${FONT}`,
                opacity: tw(outroIn, 26, 40), transform: `translateY(${(1 - tw(outroIn, 26, 40)) * 16}px)`, boxShadow: '0 16px 36px rgba(20,69,47,.25)'
              }}
            >
              flipbrief.com · Try it yourself
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
