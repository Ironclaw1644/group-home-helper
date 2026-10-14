#!/usr/bin/env python3
"""
Lay a screencast on a 30 fps clock and cut it to the film's segments.

    python3 films/assemble.py note        # tmp/films/note -> films/public/note/

The screencast (scripts/films/record.ts) sends a frame whenever the page
repaints, so a still screen sends nothing and a scroll sends sixty a second.
Each output frame shows the newest screencast frame at or before its moment,
which is exactly what the screen showed at that moment.

Writes films/public/<flow>/screen.mp4 and events.json: taps, captions, the
draft timer and the sped-up spans, all in seconds of the cut. The Remotion
composition reads both. Nothing here draws on the footage.
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
from bisect import bisect_right
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30


def main(flow: str) -> None:
    spec = json.loads((ROOT / 'films' / 'specs.json').read_text())[flow]
    # A film is usually one recording, but a segment, caption or focus can
    # name another (`src`), e.g. a second form read by the same importer.
    caps: dict[str, dict] = {}

    def source(name: str) -> dict:
        if name not in caps:
            d = ROOT / 'tmp' / 'films' / name
            c = json.loads((d / 'capture.json').read_text())
            beats = {b['name']: b['t'] for b in c['beats']}
            t0 = beats['begin']
            caps[name] = {'dir': d, 'cap': c, 'beats': beats, 't0': t0,
                          'times': [f['t'] - t0 for f in c['frames']]}
        return caps[name]

    cap = source(flow)['cap']

    def at(expr: str, src: str = flow) -> float:
        S = source(src)
        m = re.fullmatch(r'([a-z][a-z-]*?)([+-]\d+(?:\.\d+)?)?', expr)
        if not m or m.group(1) not in S['beats']:
            raise SystemExit(f'{flow}: no beat in {src} for "{expr}" (have {", ".join(S["beats"])})')
        return S['beats'][m.group(1)] - S['t0'] + float(m.group(2) or 0)

    # Segments in source seconds, and where each lands in the cut.
    segs = []
    out = 0.0
    for s in spec['segments']:
        src = s.get('src', flow)
        a, b, speed = at(s['from'], src), at(s['to'], src), float(s.get('speed', 1))
        n = round((b - a) / speed * FPS)
        segs.append({'src': src, 'a': a, 'b': b, 'speed': speed, 'out': out, 'n': n})
        out += n / FPS
    total = out

    def to_out(t: float, src: str = flow) -> float | None:
        for s in segs:
            if s['src'] == src and s['a'] - 1e-6 <= t <= s['b'] + 1e-6:
                return s['out'] + (t - s['a']) / s['speed']
        return None

    # Frame picks.
    picks = []
    for s in segs:
        S = source(s['src'])
        for k in range(s['n']):
            t = s['a'] + k * s['speed'] / FPS
            i = max(0, bisect_right(S['times'], t) - 1)
            picks.append(S['dir'] / 'frames' / S['cap']['frames'][i]['file'])

    dst = ROOT / 'films' / 'public' / flow
    dst.mkdir(parents=True, exist_ok=True)
    w, h = cap['view']['width'] * cap['dpr'], cap['view']['height'] * cap['dpr']
    ff = subprocess.Popen(
        ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
         '-vf', f'scale={w}:{h}:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
         '-g', '30', '-movflags', '+faststart', str(dst / 'screen.mp4')],
        stdin=subprocess.PIPE,
    )
    cache: dict[Path, bytes] = {}
    for p in picks:
        if p not in cache:
            cache.clear()
            cache[p] = p.read_bytes()
        ff.stdin.write(cache[p])
    ff.stdin.close()
    if ff.wait() != 0:
        raise SystemExit('ffmpeg failed')

    taps = []
    for name, S in caps.items():
        for tp in S['cap']['taps']:
            o = to_out(tp['t'] - S['t0'], name)
            if o is not None:
                taps.append({'t': round(o, 3), 'x': tp['x'], 'y': tp['y']})
    taps.sort(key=lambda tp: tp['t'])

    captions = []
    for c in spec['captions']:
        o = to_out(at(c['at'], c.get('src', flow)), c.get('src', flow))
        if o is None:
            raise SystemExit(f'{flow}: caption at {c["at"]} falls in a cut')
        cap_ = {'t': round(max(0.0, o), 3), 'text': c['text']}
        # Where the camera should look while this caption is up (page CSS
        # px), and how close. Taps move it on from there.
        for k in ('y', 'zoom'):
            if k in c:
                cap_[k] = c[k]
        captions.append(cap_)

    # Camera moves with no caption of their own (page CSS px).
    focus = []
    for fc in spec.get('focus', []):
        o = to_out(at(fc['at'], fc.get('src', flow)), fc.get('src', flow))
        if o is not None:
            focus.append({'t': round(o, 3), 'y': fc.get('y', 400), 'zoom': fc.get('zoom')})

    sped = [
        {'from': round(s['out'], 3), 'to': round(s['out'] + s['n'] / FPS, 3), 'speed': s['speed'],
         'realSeconds': round(s['b'] - s['a'], 1)}
        for s in segs if s['speed'] != 1
    ]

    timer = None
    if 'timer' in spec:
        a, b = at(spec['timer']['from']), at(spec['timer']['to'])
        oa, ob = to_out(a), to_out(b)
        timer = {'from': round(oa, 3), 'to': round(ob, 3), 'realSeconds': round(b - a, 1),
                 'label': spec['timer']['label']}

    events = {
        'flow': flow,
        'question': spec['question'],
        'title': spec['title'],
        'subtitle': spec.get('subtitle'),
        'seconds': round(total, 3),
        'view': cap['view'],
        'taps': taps,
        'captions': captions,
        'focus': focus,
        'sped': sped,
        'timer': timer,
        'recordedFrom': cap['base'],
    }
    (dst / 'events.json').write_text(json.dumps(events, indent=1))
    print(f'{flow}: {total:.1f}s cut, {len(taps)} taps, {len(captions)} captions -> {dst}')


if __name__ == '__main__':
    for f in sys.argv[1:] or ['note', 'form', 'setup', 'letterhead']:
        main(f)
