// node films/stills.mjs <flow> <frame,frame,...> -> tmp/films/stills/<flow>-<frame>.jpg
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'tmp', 'films', 'stills');
fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts'), publicDir: path.join(here, 'public') });
process.on('exit', () => fs.rmSync(serveUrl, { recursive: true, force: true }));
const [flow, frames] = process.argv.slice(2);
const comp = await selectComposition({ serveUrl, id: flow });
console.log(flow, comp.durationInFrames, 'frames');
for (const fr of frames.split(',').map(Number)) {
  await renderStill({ composition: comp, serveUrl, frame: fr, output: path.join(out, `${flow}-${fr}.jpg`), imageFormat: 'jpeg', jpegQuality: 85, overwrite: true });
}
