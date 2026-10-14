#!/usr/bin/env python3
"""
Re-read every cited state's source and write what the public state pages may say.

    python3 scripts/build-state-page-rules.py            # fetch, check, write
    python3 scripts/build-state-page-rules.py --offline  # reuse the last downloads

/states/:code used to show one line per state: the citation the printed form
carries. A provider searching "<state> group home documentation requirements"
wants the next thing too, which is what that rule actually asks a note to show.
data/state-documentation-rules.json already records it, but that file was
written by a research pass in September, and a page that repeats a research file
nobody re-read is how a fabricated form number stayed live for a year.

So nothing reaches a page from the research file directly. This script fetches
each cited state's source document again and keeps only what it can find there:

  * the quote, kept only if every quoted fragment appears in the source, in
    order, allowing for page breaks and running headers in between;
  * each required element, kept only if at least 85% of its content words sit
    within one 240-word stretch of the source. Elements drawn from a second
    document the research also read (New Jersey's DDD guidance, Pennsylvania's
    § 6100.227 page) fail here and stay off the page, which is the point.

A state whose source cannot be fetched (bot walls: Georgia, Mississippi, New
Hampshire, New York on 2026-10-14) gets no entry, and its page shows only the
citation it already carried. Demoted states never get one: the app cites
nothing for them, so neither does the page.

Output: lib/state-page-rules.data.json. Commit it with the date it was checked.
It lives in lib/, not data/, because .vercelignore keeps data/ out of the
deploy; lib/ is also already a surface verify:wv-form scans for form numbers.
"""
from __future__ import annotations

import datetime
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESEARCH = os.path.join(ROOT, 'data', 'state-documentation-rules.json')
OUT = os.path.join(ROOT, 'lib', 'state-page-rules.data.json')
CACHE = os.path.join(tempfile.gettempdir(), 'flipbrief-state-sources')
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/129.0 Safari/537.36')

# Extra passages the shift-note guide (/guides/dsp-shift-notes) quotes, checked
# the same way. A passage that is not found is left out of the output and the
# guide drops the point that rests on it.
GUIDE_QUOTES = [
    {'id': 'tx-vague', 'code': 'US-TX', 'where': 'HCS Billing Requirements § 3820(c), Unacceptable Content',
     'quote': 'non-specific statements such as "had a good day," "did ok," or "no problem today"'},
    {'id': 'tx-ditto', 'code': 'US-TX', 'where': 'HCS Billing Requirements § 3820(c), Unacceptable Content',
     'quote': 'ditto marks'},
    {'id': 'tx-incident', 'code': 'US-TX', 'where': 'HCS Billing Requirements § 3820(b)',
     'quote': 'must include a description of any unusual incident that occurs such as a seizure, illness or '
              'behavioral outburst, and any action taken by the service provider in response to the incident'},
]

STOP = set(('the a an of and or to in on for by with each any be is are must shall which that this from as at '
            'its it their who was were not no if into per all both either other than include includes including').split())


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKC', s)
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('–', '-'), ('—', '-')):
        s = s.replace(a, b)
    s = re.sub(r'-\s*\n\s*', '', s)  # words hyphenated across a line
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def stem(w: str) -> str:
    return re.sub(r'(ies|es|s|ed|ing)$', '', w) if len(w) > 4 else w


def fetch(code: str, url: str, offline: bool) -> str | None:
    raw = os.path.join(CACHE, code + '.raw')
    if not offline:
        subprocess.run(['curl', '-sSL', '-m', '60', '-A', UA, '-o', raw, url], check=False)
    if not os.path.exists(raw) or os.path.getsize(raw) < 1000:
        return None
    head = open(raw, 'rb').read(8)
    txt = os.path.join(CACHE, code + '.txt')
    if head.startswith(b'%PDF'):
        subprocess.run(['pdftotext', raw, txt], check=True)
    elif head.startswith(b'PK') or head.startswith(b'\xd0\xcf'):
        tmp = raw + ('.docx' if head.startswith(b'PK') else '.doc')
        os.replace(raw, tmp)
        try:
            subprocess.run(['textutil', '-convert', 'txt', '-output', txt, tmp], check=True)
        finally:
            os.replace(tmp, raw)
    else:
        page = open(raw, 'rb').read().decode('utf8', 'replace')
        page = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', page)
        open(txt, 'w').write(html.unescape(re.sub(r'<[^>]+>', ' ', page)))
    text = norm(open(txt, errors='replace').read())
    # A bot wall is a page, too. Anything this short is not a regulation.
    return text if len(text) > 2000 else None


def quoted_fragments(evidence: str) -> list[str]:
    quotes = re.findall(r'"([^"]{12,})"', evidence) or [evidence]
    return [f.strip(' .:;') for q in quotes for f in re.split(r'\.\.\.|…', q) if len(norm(f)) > 10]


def appears_in_order(fragment: str, tokens: list[str], index: dict, max_gap: int = 25) -> bool:
    """Every word of the fragment, in order, each within max_gap tokens of the last."""
    words = norm(fragment).split()
    for start in index.get(words[0], []):
        pos, ok = start, True
        for w in words[1:]:
            nxt = next((p for p in index.get(w, []) if pos < p <= pos + max_gap), None)
            if nxt is None:
                ok = False
                break
            pos = nxt
        if ok:
            return True
    return False


def element_score(element: str, stems: list[str], stem_index: dict, window: int = 120) -> float:
    text = re.sub(r'\((?:subsec|sec|§)[^)]*\)', '', element)
    text = re.sub(r'^[A-Z ]+:\s*', '', text)
    words = list(dict.fromkeys(stem(w) for w in norm(text).split()
                               if w not in STOP and len(w) > 2 and not re.fullmatch(r'\d+|[ivx]+', w)))
    if not words:
        return 0.0
    rarest = min((stem_index.get(w, []) for w in words), key=len)
    best = 0.0
    for a in rarest[:400]:
        near = set(stems[max(0, a - window):a + window])
        best = max(best, sum(w in near for w in words) / len(words))
    return best


def main() -> None:
    offline = '--offline' in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    research = json.load(open(RESEARCH))
    states: dict[str, dict] = {}
    texts: dict[str, tuple[list[str], dict]] = {}
    for row in research:
        code = row['code']
        if row.get('demoted_reason') or row['confidence'] != 'primary-source-read':
            continue
        text = fetch(code, row['source_url'], offline)
        if text is None:
            print(f'{code}  skipped: source could not be fetched')
            continue
        tokens = text.split()
        index: dict[str, list[int]] = {}
        for p, w in enumerate(tokens):
            index.setdefault(w, []).append(p)
        texts[code] = (tokens, index)
        frags = quoted_fragments(row['evidence'])
        if not all(appears_in_order(f, tokens, index) for f in frags):
            print(f'{code}  skipped: quote not found in source')
            continue
        stems = [stem(w) for w in tokens]
        stem_index: dict[str, list[int]] = {}
        for p, w in enumerate(stems):
            stem_index.setdefault(w, []).append(p)
        kept = [e for e in row['required_elements'] or [] if element_score(e, stems, stem_index) >= 0.85]
        dropped = len(row['required_elements'] or []) - len(kept)
        states[code] = {
            'citation': row['citation'],
            'citationTitle': row['citation_title'],
            'quote': ' … '.join(frags),
            'elements': kept,
            'elementsDropped': dropped,
            'sourceUrl': row['source_url']
        }
        print(f'{code}  quote ok, {len(kept)} elements kept, {dropped} dropped')
    guide: dict[str, dict] = {}
    for g in GUIDE_QUOTES:
        if g['code'] in texts and appears_in_order(g['quote'].replace('"', ''), *texts[g['code']]):
            row = next(r for r in research if r['code'] == g['code'])
            guide[g['id']] = {'code': g['code'], 'where': g['where'], 'quote': g['quote'], 'sourceUrl': row['source_url']}
            print(f"guide {g['id']}  ok")
        else:
            print(f"guide {g['id']}  NOT FOUND, left out")
    out = {
        '_about': 'Generated by scripts/build-state-page-rules.py. Every quote and element here was found in the '
                  'source document on checkedOn. Do not hand-edit; re-run the script.',
        'checkedOn': datetime.date.today().isoformat(),
        'states': states,
        'guideQuotes': guide
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'\nwrote {len(states)} states to {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
