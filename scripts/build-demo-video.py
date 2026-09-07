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
SRC = os.path.join(ROOT, "tmp", "demo-video")
OUT = os.path.join(ROOT, "public", "demo", "flipbrief-demo.mp4")

W, H = 1080, 1920
BAND_H = 300
FOREST = (20, 69, 47)
PAPER = (251, 248, 243)
SAND = (217, 179, 130)

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]

# beat -> caption. A beat absent from here shows nothing, which is how the
# quiet moments stay quiet.
CAPTIONS = {
    "demo-start": "Six notes a shift.\nTen minutes each, on paper.",
    "roster": "Your house. Your people. Tonight.",
    "open-note": "One tap starts the note.",
    "chips": "Tap what happened.",
    "plan": "Their plan is in the same list.",
    "draft": "The note writes itself\nfrom what you tapped.",
    "narrative": "Nothing invented.\nNothing you did not say.",
    "sign": "Sign it on the phone.",
    "lock": "Signed is locked.\nNobody can edit it. Including us.",
    "end": "$100 a month.\nAny number of beds.",
}

# Held over the closing shot of the real printed page.
LETTERHEAD_CAPTION = "It prints on your letterhead."
LETTERHEAD_SECONDS = 4.5


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


def main() -> None:
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
    for png, _, _ in timed:
        inputs += ["-i", png]

    chain = [f"[0:v]scale=-2:{H},pad={W}:{H}:({W}-iw)/2:0:0x14452F,format=yuv420p[bg]"]
    last = "bg"
    for idx, (_, start, end) in enumerate(timed, start=1):
        label = f"v{idx}"
        chain.append(
            f"[{last}][{idx}:v]overlay=x=0:y={H - BAND_H}:"
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

    tail = letterhead_tail(SRC)
    if tail:
        listing = os.path.join(SRC, "concat.txt")
        with open(listing, "w") as fh:
            fh.write(f"file '{os.path.abspath(body)}'\nfile '{os.path.abspath(tail)}'\n")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", listing, "-c", "copy", "-movflags", "+faststart", OUT],
            check=True,
        )
    else:
        os.replace(body, OUT)

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
