"""The FlipBrief mark, drawn rather than loaded, in one place.

public/brand/flipbrief-mark.svg is the design source: an F on a 64 grid whose
middle arm lifts at the tip, in two flat colours, deliberately simple so it
survives a 16px tab and a one-colour letterhead. There is no SVG rasteriser on
this machine, so anything that needs the mark as pixels draws it from the same
path data here.

This module exists because the alternative kept failing. The film build read
the mark from a PNG under tmp/ that nothing ever created, and silently skipped
the badge when it was missing — so the title cards shipped unbranded twice.
Reaching for public/icon-512.png instead was worse: that file was a customer's
logo. Two callers now share these numbers, and if the SVG changes, this is the
one place to change with it.
"""

from PIL import Image, ImageDraw

# The brand's flat colours, matching app/globals.css and the SVG.
FOREST = (20, 69, 47)      # #14452F
PAPER = (251, 248, 243)    # #FBF8F3
SAND = (217, 179, 130)     # #D9B382

# The mark's ink, in SVG user units on the 64 grid. Everything outside this
# box is empty, which is why callers centre on the drawn bounds rather than on
# the canvas — the F sits left of centre in its own viewBox.
INK = (12, 8, 54, 56)


def render_mark(size: int, supersample: int = 4) -> Image.Image:
    """The mark on a transparent square of `size`, drawn from the SVG geometry.

    Drawn large and reduced because PIL's polygon edges are hard otherwise, and
    the lifting tip is the one diagonal in the design.
    """
    box = size * supersample
    u = box / 64.0  # one SVG user unit
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([12 * u, 8 * u, 24 * u, 56 * u], fill=FOREST + (255,))   # stem
    d.rectangle([12 * u, 8 * u, 46 * u, 20 * u], fill=FOREST + (255,))   # top arm
    d.rectangle([12 * u, 30 * u, 38 * u, 41 * u], fill=FOREST + (255,))  # middle arm
    d.polygon(                                                           # lifting tip
        [(38 * u, 30 * u), (42 * u, 30 * u), (54 * u, 21 * u),
         (54 * u, 32 * u), (42 * u, 41 * u), (38 * u, 41 * u)],
        fill=SAND + (255,),
    )
    return img.resize((size, size), Image.LANCZOS)


def render_icon(size: int, coverage: float = 0.58) -> Image.Image:
    """A square app icon: the mark centred on paper.

    `coverage` is how much of the canvas edge the mark's ink spans, and it is
    set by the maskable safe zone rather than by eye. Android may crop an icon
    to a circle of radius 40% of the canvas, so any ink further than that from
    the centre is lost on some launchers. Measured: 0.62 put the corner of the
    top arm at 41.0% and clipped, 0.58 lands at 38.4%. Paper rather than
    transparent, because iOS composites a transparent icon onto black.
    """
    img = Image.new("RGBA", (size, size), PAPER + (255,))

    # Draw the mark large, then place it by its ink rather than its canvas: the
    # F is not centred in the 64 grid, so centring the canvas would sit it
    # visibly left and low.
    scratch = render_mark(size * 2)
    ink = scratch.crop(scratch.getbbox())
    target = int(size * coverage)
    w, h = ink.size
    scale = target / max(w, h)
    ink = ink.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    img.paste(ink, ((size - ink.width) // 2, (size - ink.height) // 2), ink)
    return img
