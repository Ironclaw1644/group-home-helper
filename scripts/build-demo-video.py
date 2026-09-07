#!/usr/bin/env python3
"""Cut the demo film from the footage capture-demo-video.ts recorded.

    npm run video:capture   # drive the real product, write the webm + beats
    npm run video:build     # this: captions, letterbox, encode

Captions land on the beat timestamps the capture wrote, not on offsets typed in
here. The draft takes as long as the model takes on the day, so hard offsets
would slide every later caption out of sync the first time it ran slow -- and
nobody would notice until the film had already been sent to somebody.

The captions are rendered to PNG and composited rather than drawn by ffmpeg.
The ffmpeg on this machine is built without libfreetype, so `drawtext` does not
exist; `overlay` does. Rendering them here also means the type is set with the
same care as the product, instead of whatever a filter string can express.

The order of the film is deliberate and it is not the order a software demo
usually takes:

  * It opens on the paperwork, not on the product. The buyer's problem is the
    paperwork.
  * AI is never mentioned. The draft is shown writing itself and the viewer can
    call that whatever they want to call it. Saying "AI" to somebody who is
    frightened of an audit buys nothing and costs trust.
  * It closes on the lock and the letterhead -- the two things a person afraid
    of an audit is actually buying -- and then the price, plainly, because the
    competition costs thousands to onboard and that is the whole argument.
"""

import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The note film lives at tmp/demo-video; every other flow gets a subdirectory
# named after it, with its own captions and cards in flow.json. Passing no
# argument builds the note film, which is the one this script started as.
FLOW = sys.argv[1] if len(sys.argv) > 1 else None
SRC = os.path.join(ROOT, "tmp", "demo-video", FLOW) if FLOW else os.path.join(ROOT, "tmp", "demo-video")
OUT = os.path.join(
    ROOT, "public", "demo", f"flipbrief-{FLOW}.mp4" if FLOW else "flipbrief-demo.mp4"
)

TITLE = ["FlipBrief"]
SUBTITLE = "Shift notes for group homes"

W, H = 1080, 1920
BAND_H = 300
FOREST = (20, 69, 47)
PAPER = (251, 248, 243)
SAND = (217, 179, 130)

# The product's own face, not the system's. Archivo SemiBold is what the app
# and the landing page set, and it is bundled by next/font as woff2; PIL cannot
# read woff2, so scripts/extract-brand-fonts.py converts it once. A film in
# Arial that sells software set in Archivo looks like somebody else made it.
FONTS = [
    os.path.join(ROOT, "tmp", "fonts", "Archivo-SemiBold.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]

# beat -> caption. A beat absent from here shows nothing, which is how the
# quiet moments stay quiet.
CAPTIONS = {
    # Not "ten minutes each, on paper" — nobody timed that, and an opening
    # frame is a poor place to guess. What is true and lands harder is that
    # writing them is the part of the job nobody wants.
    "demo-start": "Six notes a shift.\nNobody wants to write them.",
    "roster": "Your house. Your people. Tonight.",
    "open-note": "One tap starts the note.",
    "chips": "Tap what happened.",
    "plan": "Their plan is in the same list.",
    "draft": "So nobody writes one.\nIt drafts from what you tapped.",
    "narrative": "Nothing invented.\nNothing you did not say.",
    "sign": "Sign it on the phone.",
    "lock": "Signed is locked.\nNobody can edit it. Including us.",
    "end": "$100 a month.\nAny number of beds.",
}

# Held over the closing shot of the real printed page.
LETTERHEAD_CAPTION = "It prints on your letterhead."
LETTERHEAD_SECONDS = 4.5


def load_flow() -> None:
    """Captions and cards for a named flow, if there is one."""
    global CAPTIONS, TITLE, SUBTITLE
    meta_path = os.path.join(SRC, "flow.json")
    if not os.path.exists(meta_path):
        return
    meta = json.load(open(meta_path))
    CAPTIONS = meta.get("captions", {})
    TITLE = [meta.get("title", "FlipBrief")]
    SUBTITLE = meta.get("subtitle", "")


def font(size: int):
    for path in FONTS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def render_caption(text: str, path: str) -> None:
    """A caption band: forest, mostly opaque, paper type, a sand rule above."""
    img = Image.new("RGBA", (W, BAND_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Fully opaque. At 87% the chips behind the band showed through and
    # fought the type, which on a phone in bad light is the difference
    # between reading a caption and squinting at one.
    d.rectangle([0, 0, W, BAND_H], fill=FOREST + (255,))
    d.rectangle([0, 0, W, 4], fill=SAND + (255,))

    lines = text.split("\n")
    size = 62 if len(lines) == 1 else 54
    f = font(size)
    gap = 14
    heights = [d.textbbox((0, 0), ln, font=f)[3] for ln in lines]
    total = sum(heights) + gap * (len(lines) - 1)
    y = (BAND_H - total) // 2
    for ln, h in zip(lines, heights):
        w = d.textbbox((0, 0), ln, font=f)[2]
        d.text(((W - w) // 2, y), ln, font=f, fill=PAPER + (255,))
        y += h + gap
    img.save(path)


def render_card(lines, path: str, sub: str = "") -> None:
    """A full-frame forest card with the brand mark above centred type.

    The film had neither an opening nor a close: it started mid-scroll on a
    stranger's phone and ended on a document, so a viewer never learned whose
    software it was or where to get it. A demo that does not say its own name
    is an odd thing to send to somebody.
    """
    img = Image.new("RGB", (W, H), FOREST)
    d = ImageDraw.Draw(img)

    # The mark on a paper badge, not straight onto the card.
    #
    # It is two flat colours and one of them is forest, so dropped onto a
    # forest ground the F disappeared and only the sand tip of the turning page
    # survived — a small beige comma floating above the wordmark.
    # Centre the whole block, rather than starting it at a fixed height. The
    # first version pinned the badge near the top and left the bottom two
    # thirds of a 1920px frame empty, which reads as a mistake rather than as
    # space.
    mark_path = os.path.join(SRC, "mark.png")
    block = 380 + len(lines) * 108 + (len(sub.split("\n")) * 62 + 30 if sub else 0)
    y = (H - block) // 2 + 380
    if os.path.exists(mark_path):
        badge = 300
        pad = 44
        plate = Image.new("RGBA", (badge, badge), PAPER + (255,))
        rounded = Image.new("L", (badge, badge), 0)
        ImageDraw.Draw(rounded).rounded_rectangle([0, 0, badge - 1, badge - 1], radius=68, fill=255)
        plate.putalpha(rounded)
        mark = Image.open(mark_path).convert("RGBA").resize(
            (badge - pad * 2, badge - pad * 2), Image.LANCZOS
        )
        plate.paste(mark, (pad, pad), mark)
        img.paste(plate, ((W - badge) // 2, y - 380), plate)

    f = font(84)
    for line in lines:
        w = d.textbbox((0, 0), line, font=f)[2]
        d.text(((W - w) // 2, y), line, font=f, fill=PAPER)
        y += 108

    if sub:
        fs = font(46)
        y += 30
        for line in sub.split("\n"):
            w = d.textbbox((0, 0), line, font=fs)[2]
            d.text(((W - w) // 2, y), line, font=fs, fill=SAND)
            y += 62

    img.save(path)


def card_clip(lines, sub: str, seconds: float, name: str) -> str:
    """Encode one still card as a clip, with a short fade at each end."""
    png = os.path.join(SRC, f"card-{name}.png")
    render_card(lines, png, sub)
    out = os.path.join(SRC, f"card-{name}.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", str(seconds), "-i", png,
         "-vf", f"fade=t=in:st=0:d=0.5,fade=t=out:st={seconds - 0.5:.2f}:d=0.5,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-r", "25", out],
        check=True,
    )
    return out


def main() -> None:
    load_flow()

    # Largest, not first. Downloading the PDF opens a second page context and
    # Playwright writes a video file for it too — a fraction of a second long.
    # Sorted-first picked that one and produced a film that was over before it
    # started.
    webms = [os.path.join(SRC, f) for f in os.listdir(SRC) if f.endswith(".webm")]
    raw = max(webms, key=os.path.getsize) if webms else None
    beats_path = os.path.join(SRC, "beats.json")
    if not raw or not os.path.exists(beats_path):
        raise SystemExit("No footage. Run: npm run video:capture")

    beats = json.load(open(beats_path))

    # Trim the provisioning lead-in and rebase the beats onto the trimmed
    # footage. The capture clock runs in video time so captions stay aligned;
    # the cost is however long the sandbox took to build sitting at the front,
    # which is dead air nobody should watch.
    lead_in = next((b["at"] for b in beats if b["name"] == "open"), 0.0)
    if lead_in > 0.5:
        trimmed = os.path.join(SRC, "trimmed.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{lead_in:.2f}", "-i", raw,
             "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "25", "-an", trimmed],
            check=True,
        )
        raw = trimmed
        beats = [{"name": b["name"], "at": max(0.0, b["at"] - lead_in)} for b in beats]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    caption_dir = os.path.join(SRC, "captions")
    os.makedirs(caption_dir, exist_ok=True)

    # Each caption runs from its own beat until the next one starts.
    timed = []
    for i, b in enumerate(beats):
        text = CAPTIONS.get(b["name"])
        if not text:
            continue
        start = b["at"]
        end = beats[i + 1]["at"] if i + 1 < len(beats) else beats[-1]["at"] + 3.5
        png = os.path.join(caption_dir, f"{i:02d}-{b['name']}.png")
        render_caption(text, png)
        timed.append((png, start, end))

    # Phone footage is taller than 9:16, so fit its height and letterbox the
    # sides in forest rather than cropping. Cropping a phone screen removes the
    # top or bottom of the very UI the film is about.
    inputs = ["-i", raw]
    for png, start, end in timed:
        # Offset each caption onto the timeline it will be shown at, so a fade
        # written at st=0 means "when this caption appears" rather than "when
        # the film starts". Without itsoffset the fades all fired in the first
        # half second and every caption simply popped.
        inputs += ["-loop", "1", "-t", f"{max(0.1, end - start):.2f}",
                   "-itsoffset", f"{start:.2f}", "-i", png]

    chain = [f"[0:v]scale=-2:{H},pad={W}:{H}:({W}-iw)/2:0:0x14452F,format=yuv420p[bg]"]
    last = "bg"
    FADE = 0.28
    for idx, (_, start, end) in enumerate(timed, start=1):
        hold = max(0.1, end - start)
        # Fade the band in and out on its own alpha rather than snapping it.
        # A hard cut on a full-width bar is the single most amateur thing a
        # screen recording can do, and it is one filter away from not being.
        chain.append(
            f"[{idx}:v]format=rgba,"
            f"fade=t=in:st=0:d={FADE}:alpha=1,"
            f"fade=t=out:st={max(0.0, hold - FADE):.2f}:d={FADE}:alpha=1[c{idx}]"
        )
        label = f"v{idx}"
        chain.append(
            f"[{last}][c{idx}]overlay=x=0:y={H - BAND_H}:"
            f"enable='between(t,{start:.2f},{end:.2f})'[{label}]"
        )
        last = label

    cmd = (
        ["ffmpeg", "-y", "-loglevel", "error"]
        + inputs
        + [
            "-filter_complex", ";".join(chain),
            "-map", f"[{last}]",
            "-c:v", "libx264", "-preset", "slow", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-r", "25", "-an", OUT,
        ]
    )
    body = os.path.join(SRC, "body.mp4")
    cmd[-1] = body
    print(f"encoding {len(timed)} captions")
    subprocess.run(cmd, check=True)

    segments = [
        card_clip(TITLE, SUBTITLE, 2.6, "open"),
        body,
    ]
    # Only the note film ends on the printed page; the others end on their own
    # last frame and then the card.
    tail = letterhead_tail(SRC) if not FLOW else ""
    if tail:
        segments.append(tail)
    segments.append(
        card_clip(["flipbrief.com"], "$100 a month, flat\nAny number of beds", 3.4, "end")
    )

    listing = os.path.join(SRC, "concat.txt")
    with open(listing, "w") as fh:
        for seg in segments:
            fh.write(f"file '{os.path.abspath(seg)}'\n")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", listing, "-c", "copy", "-movflags", "+faststart", OUT],
        check=True,
    )

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,size", "-show_entries", "stream=width,height",
         "-of", "default=noprint_wrappers=1", OUT],
        capture_output=True, text=True,
    )
    print(probe.stdout.strip())
    print(f"done: {OUT}")


def letterhead_tail(tmp: str) -> str:
    """Encode the closing shot: page one of the PDF the app just produced.

    Not a screenshot of the app showing a PDF button -- the document itself,
    rasterised from the file. The letterhead is what the buyer is paying for
    and the first cut asserted it over a picture of something else.
    """
    png = next(
        (os.path.join(SRC, f) for f in sorted(os.listdir(SRC))
         if f.startswith("letterhead") and f.endswith(".png")),
        None,
    )
    if not png:
        return ""

    band = os.path.join(SRC, "captions", "zz-letterhead.png")
    render_caption(LETTERHEAD_CAPTION, band)
    out = os.path.join(tmp, "tail.mp4")
    # The page is portrait but a different ratio to 9:16, so it is fitted and
    # letterboxed in forest like the phone footage, for one continuous frame.
    # Fit inside the frame, do not just match its height. A Letter page is
    # 8.5x11, so scaling to the full height made it 1252px wide inside a 1080px
    # frame and pad was handed a negative offset. force_original_aspect_ratio
    # keeps the page whole either way — a cropped letterhead would defeat the
    # entire point of showing it.
    chain = (
        f"[0:v]scale={W}:{H - BAND_H}:force_original_aspect_ratio=decrease,"
        f"pad={W}:{H}:({W}-iw)/2:(({H}-{BAND_H})-ih)/2:0x14452F,"
        f"format=yuv420p[bg];[bg][1:v]overlay=x=0:y={H - BAND_H}[v]"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-loop", "1", "-t", str(LETTERHEAD_SECONDS), "-i", png,
         "-loop", "1", "-t", str(LETTERHEAD_SECONDS), "-i", band,
         "-filter_complex", chain, "-map", "[v]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-pix_fmt", "yuv420p", "-r", "25", out],
        check=True,
    )
    return out


if __name__ == "__main__":
    main()
