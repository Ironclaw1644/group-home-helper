// Render the films for the landing page.
//
//   node films/render.mjs                 # all four -> public/demo/
//   node films/render.mjs note form       # some
//   node films/render.mjs --draft note    # half size, to tmp/films/render/ only
//
// Writes public/demo/flipbrief-<flow>.mp4 (H.264, no audio, faststart, under
// CAP so it also goes through Telegram's 5 MB limit), poster-<flow>.jpg and
// flipbrief-<flow>.vtt (the burned-in captions, for screen readers).
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const TMP = path.join(root, 'tmp', 'films', 'render');
const OUT = path.join(root, 'public', 'demo');
const CAP = 4.6 * 1024 * 1024;
const FPS = 30;
const B0 = 72; // keep in step with src/Film.tsx

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const flows = args.filter((a) => !a.startsWith('--'));
const ids = flows.length ? flows : ['note', 'form', 'setup', 'letterhead'];
const specs = JSON.parse(fs.readFileSync(path.join(here, 'specs.json'), 'utf8'));
fs.mkdirSync(TMP, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts'), publicDir: path.join(here, 'public') });
// bundle() copies public/ into $TMPDIR on every run; do not leave it there.
process.on('exit', () => fs.rmSync(serveUrl, { recursive: true, force: true }));

const stamp = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
};

for (const id of ids) {
  const comp = await selectComposition({ serveUrl, id });
  const ev = comp.props.ev;
  const master = path.join(TMP, `${id}${draft ? '-draft' : ''}.mp4`);
  const t = Date.now();
  await renderMedia({
    composition: comp, serveUrl, codec: 'h264', outputLocation: master, crf: draft ? 23 : 12, muted: true,
    imageFormat: 'jpeg', jpegQuality: 95, scale: draft ? 0.5 : 1, concurrency: 6, overwrite: true
  });
  console.log(`${id}: rendered ${(comp.durationInFrames / FPS).toFixed(1)}s in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  if (draft) continue;

  // Web copy: the lowest CRF that fits under CAP.
  const out = path.join(OUT, `flipbrief-${id}.mp4`);
  for (const crf of [22, 24, 26, 28, 30, 32]) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow',
      '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out]);
    const sz = fs.statSync(out).size;
    console.log(`  crf ${crf}: ${(sz / 1048576).toFixed(2)} MB`);
    if (sz < CAP) break;
  }

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
