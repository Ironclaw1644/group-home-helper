// Render the films for the landing page.
//
//   node films/render.mjs                 # all four -> public/demo/
//   node films/render.mjs note form       # some
//   node films/render.mjs --draft note    # half size, to tmp/films/render/ only
//   node films/render.mjs --reuse note    # skip Remotion, re-encode the last master
//
// Writes public/demo/flipbrief-<flow>.mp4 (H.264 + an AAC music bed,
// faststart, under CAP so it also goes through Telegram's 5 MB limit),
// poster-<flow>.jpg and flipbrief-<flow>.vtt (the burned-in captions, for
// screen readers).
//
// The music is one theme for all four (films/music/theme.m4a, made with
// ACE-Step 1.5 on the MacBook worker; films/music/README.md has the prompt
// and seed). Each film gets it from the top, cut to its length, faded in and
// out, and normalised to LUFS / TP below. There is no voice over, so the
// bed is the only sound; it is kept quiet because it is a demo, not an ad.
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const TMP = path.join(root, 'tmp', 'films', 'render');
const OUT = path.join(root, 'public', 'demo');
const CAP = 4.6 * 1024 * 1024;
const THEME = path.join(here, 'music', 'theme.m4a');
const LUFS = -20;
const TP = -1.5; // measured after AAC encoding; must stay at or under -1 dBTP
const FADE_IN = 1.2;
const FADE_OUT = 3.0;
const AUDIO_KBPS = 80; // a soft bed; every byte not spent here goes to the picture
const FPS = 30;
const B0 = 180; // keep in step with src/Film.tsx

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const reuse = args.includes('--reuse');
const flows = args.filter((a) => !a.startsWith('--'));
const ids = flows.length ? flows : ['note', 'form', 'setup', 'letterhead'];
const specs = JSON.parse(fs.readFileSync(path.join(here, 'specs.json'), 'utf8'));
fs.mkdirSync(TMP, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts'), publicDir: path.join(here, 'public') });
// bundle() copies public/ into $TMPDIR on every run; do not leave it there.
process.on('exit', () => fs.rmSync(serveUrl, { recursive: true, force: true }));

/** loudnorm's JSON summary from ffmpeg's stderr. */
const loudnormJson = (stderr) => JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
};

/**
 * The music bed for one film: the theme from 0 s, cut to `seconds`, faded,
 * then two-pass loudnorm in linear mode (it fails rather than letting
 * loudnorm fall back to dynamic, which pumps), encoded to AAC and measured
 * again from the encoded file.
 */
function bed(id, seconds) {
  const cut = path.join(TMP, `${id}-bed.wav`);
  ff(['-y', '-i', THEME, '-t', seconds.toFixed(3), '-af',
    `afade=t=in:d=${FADE_IN},afade=t=out:st=${(seconds - FADE_OUT).toFixed(3)}:d=${FADE_OUT}`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', cut]);
  const ln = `loudnorm=I=${LUFS}:TP=${TP}:LRA=11`;
  const m = loudnormJson(ff(['-i', cut, '-af', `${ln}:print_format=json`, '-f', 'null', '-']));
  const out = path.join(TMP, `${id}-bed.m4a`);
  const r = loudnormJson(ff(['-y', '-i', cut, '-af',
    `${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=48000`,
    '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, out]));
  if (r.normalization_type !== 'linear') throw new Error(`${id}: loudnorm went ${r.normalization_type}`);
  // Measure what was actually encoded.
  const e = ff(['-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary')))?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(e.slice(e.lastIndexOf('True peak')))?.[1]);
  console.log(`  music: ${I} LUFS, ${peak} dBTP (${r.normalization_type})`);
  if (!(Math.abs(I - LUFS) <= 1 && peak <= -1)) throw new Error(`${id}: music bed off target (${I} LUFS, ${peak} dBTP)`);
  return out;
}

const stamp = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
};

for (const id of ids) {
  const comp = await selectComposition({ serveUrl, id });
  const ev = comp.props.ev;
  const master = path.join(TMP, `${id}${draft ? '-draft' : ''}.mp4`);
  const t = Date.now();
  if (!(reuse && fs.existsSync(master))) {
    await renderMedia({
      composition: comp, serveUrl, codec: 'h264', outputLocation: master, crf: draft ? 23 : 12, muted: true,
      imageFormat: 'jpeg', jpegQuality: 95, scale: draft ? 0.5 : 1, concurrency: 6, overwrite: true
    });
  }
  console.log(`${id}: rendered ${(comp.durationInFrames / FPS).toFixed(1)}s in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  if (draft) continue;

  // Web copy, with the music bed: CRF 22 if that fits under CAP, otherwise a
  // two-pass encode at whatever bitrate fills CAP after the audio, which
  // looks better than stepping CRF until it fits.
  const seconds = comp.durationInFrames / FPS;
  const music = bed(id, seconds);
  const out = path.join(OUT, `flipbrief-${id}.mp4`);
  const enc = (rate) => ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', ...rate, '-pix_fmt', 'yuv420p', '-r', String(FPS)];
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-i', music, '-map', '0:v', '-map', '1:a',
    ...enc(['-crf', '22']), '-c:a', 'copy', '-movflags', '+faststart', out]);
  if (fs.statSync(out).size >= CAP) {
    const kbps = Math.floor(((CAP * 0.97 - fs.statSync(music).size) * 8) / seconds / 1000);
    const log = path.join(TMP, `${id}-2pass`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, ...enc(['-b:v', `${kbps}k`]), '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4', '/dev/null']);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-i', music, '-map', '0:v', '-map', '1:a',
      ...enc(['-b:v', `${kbps}k`]), '-pass', '2', '-passlogfile', log, '-c:a', 'copy', '-movflags', '+faststart', out]);
    console.log(`  two-pass video ${kbps} kb/s`);
  }
  const sz = fs.statSync(out).size;
  console.log(`  ${(sz / 1048576).toFixed(2)} MiB`);
  if (sz >= CAP) throw new Error(`${id}: ${sz} bytes is over the cap`);

  // Poster: a moment with the app close up and a caption under it.
  const pc = ev.captions[specs[id].poster ?? 2];
  const pframe = Math.min(comp.durationInFrames - 1, Math.round(B0 + pc.t * FPS + 24));
  const png = path.join(TMP, `${id}-poster.png`);
  await renderStill({ composition: comp, serveUrl, frame: pframe, output: png, imageFormat: 'png', overwrite: true });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=720:1280:flags=lanczos', '-q:v', '4', path.join(OUT, `poster-${id}.jpg`)]);

  // Captions as WebVTT, on the same clock as the burned-in ones.
  const lines = ['WEBVTT', ''];
  ev.captions.forEach((c, i) => {
    const a = (B0 + c.t * FPS) / FPS;
    const next = ev.captions[i + 1];
    const b = next ? (B0 + next.t * FPS) / FPS : (B0 + ev.seconds * FPS) / FPS;
    lines.push(`${i + 1}`, `${stamp(a)} --> ${stamp(b)}`, c.text, '');
  });
  fs.writeFileSync(path.join(OUT, `flipbrief-${id}.vtt`), lines.join('\n'));
}
