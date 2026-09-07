#!/usr/bin/env python3
"""Convert the app's bundled woff2 faces to TTF so the film can set type in them.

next/font ships Archivo and Allura as woff2 inside .next/static/media. PIL
cannot read woff2, and a demo film for software set in Archivo should not be
captioned in Arial -- it reads as though somebody else made it.

Run `npm run build` (or `next dev`) at least once first, so the fonts exist.

    python3 scripts/extract-brand-fonts.py
"""

import glob
import os
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tmp", "fonts")
WANT = {"Archivo SemiBold": "Archivo-SemiBold.ttf", "Allura Regular": "Allura-Regular.ttf"}


def latin_coverage(path: str) -> int:
    """How many of the 52 basic Latin letters a subset actually contains."""
    try:
        cmap = TTFont(path, lazy=True).getBestCmap()
    except Exception:
        return -1
    return sum(1 for c in list(range(65, 91)) + list(range(97, 123)) if c in cmap)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    # Choose by coverage, not by filename.
    #
    # next/font emits one file per unicode-range, all carrying the same family
    # name. Taking the first alphabetically took the latin-ext subset: 262
    # glyphs, exactly one letter of the alphabet. The font loaded without
    # error, measured a plausible width for a test string, and rendered every
    # caption in the film as tofu boxes.
    best = {}
    for path in sorted(glob.glob(os.path.join(ROOT, ".next", "static", "media", "*.woff2"))):
        try:
            name = TTFont(path, lazy=True)["name"].getDebugName(4)
        except Exception:
            continue
        if name not in WANT:
            continue
        score = latin_coverage(path)
        if score > best.get(name, (-1, None))[0]:
            best[name] = (score, path)

    found = {}
    for name, (score, path) in best.items():
        if score < 52:
            print(f"  skipping {name}: best subset has only {score}/52 Latin letters")
            continue
        out = os.path.join(OUT, WANT[name])
        full = TTFont(path)
        full.flavor = None
        full.save(out)
        found[name] = out
        print(f"  {name} -> {out}  ({score}/52 Latin letters)")
    missing = set(WANT) - set(found)
    if missing:
        raise SystemExit(
            f"missing {', '.join(sorted(missing))} — run a build first so next/font emits them"
        )


if __name__ == "__main__":
    main()
