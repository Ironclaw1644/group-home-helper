#!/usr/bin/env python3
"""Write the app icons from the FlipBrief mark.

    python3 scripts/generate-brand-icons.py [--check]

WHY THIS EXISTS

public/icon-192.png, public/icon-512.png and public/apple-touch-icon.png were
At Home Family Services' logo -- a customer's, resized three ways. They are
what site.webmanifest names as FlipBrief's icons and what app/layout.tsx names
as its favicon and Apple touch icon, so the product shipped a customer's
trademark as its own identity: on every browser tab, on the home screen of
anybody who installed it, and in the icon `purpose: maskable` hands to Android.
The manifest's own `name` has said "FlipBrief" the whole time. It was left over
from when the product was built for that one agency and nobody looked again.

That agency's logo still ships, and should: /brand/AHFS_logo.png is seeded as
*their organisation's* letterhead, which is the branding feature working as
intended. Their logo on their documents is right. Their logo as the
application's icon is not.

--check re-renders and compares, so the suite fails if a shipped icon stops
matching the mark. The point is not that these files are hard to draw; it is
that the last time one of them was wrong, it stayed wrong for months because
nothing looked.
"""

import os
import sys

from PIL import Image, ImageChops

from brand_mark import render_icon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")

# name -> pixel size. These are the three the manifest and layout.tsx name;
# adding a size here is not enough on its own, it has to be referenced too.
ICONS = {
    "icon-192.png": 192,
    "icon-512.png": 512,
    "apple-touch-icon.png": 180,
}


def main() -> None:
    check = "--check" in sys.argv
    bad = []

    for name, size in ICONS.items():
        path = os.path.join(PUBLIC, name)
        fresh = render_icon(size).convert("RGB")

        if not check:
            fresh.save(path, format="PNG", optimize=True)
            print(f"  wrote {name} ({size}x{size})")
            continue

        if not os.path.exists(path):
            bad.append(f"{name} is missing")
            continue
        current = Image.open(path).convert("RGB")
        if current.size != fresh.size:
            bad.append(f"{name} is {current.size[0]}px, expected {size}px")
            continue
        # Not byte equality: PNG encoders differ between versions. Compare the
        # pixels, and allow the small amount of noise a re-encode can leave.
        diff = ImageChops.difference(current, fresh)
        worst = max(band.getextrema()[1] for band in diff.split())
        if worst > 8:
            bad.append(f"{name} does not match the FlipBrief mark (max channel diff {worst})")

    if not check:
        print("\nRegenerated. site.webmanifest and app/layout.tsx already point at these.")
        return

    if bad:
        print("\nShipped app icons are not the FlipBrief mark:\n")
        for b in bad:
            print(f"  FAIL  {b}")
        print("\nRun: python3 scripts/generate-brand-icons.py\n")
        raise SystemExit(1)
    print(f"All {len(ICONS)} app icons are the FlipBrief mark.")


if __name__ == "__main__":
    main()
