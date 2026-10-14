#!/usr/bin/env python3
"""
Fail if a caption is on screen for less time than it takes to read.

    python3 films/check-captions.py            # all four, from films/public/<flow>/events.json

A caption is up from its own time to the next caption's, less about half a
second of fade in and out. The rule is about 3 words a second at most.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAX_WPS = 3.0
FADES = 0.5

bad = 0
for flow in sys.argv[1:] or ['note', 'form', 'setup', 'letterhead']:
    ev = json.loads((ROOT / 'public' / flow / 'events.json').read_text())
    caps = ev['captions']
    for i, c in enumerate(caps):
        end = caps[i + 1]['t'] if i + 1 < len(caps) else ev['seconds'] + 0.33
        words = len(c['text'].split())
        wps = words / max(0.1, end - c['t'] - FADES)
        if wps > MAX_WPS:
            bad += 1
            print(f'{flow} {c["t"]:.1f}s: {words} words at {wps:.1f}/s  {c["text"]!r}')
print('captions: all readable' if not bad else f'captions: {bad} too fast')
sys.exit(1 if bad else 0)
