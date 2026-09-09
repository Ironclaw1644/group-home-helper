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
    # Was "Nothing invented. Nothing you did not say." Once the capture waited
    # for a real draft, the grounding check fired on the footage underneath it
    # -- an amber box reading "the draft mentions something that was not in
    # your entries". A caption promising nothing was invented, sitting on top
    # of the app saying something was, is precisely the contradiction the
    # signing beat below was rewritten to avoid.
    #
    # What is on screen is the check catching it, so that is what this says. It
    # is also true on a take where nothing gets flagged, which matters because
    # whether the flag appears depends on the model that day. It stops short of
    # "you cannot sign until you fix it": the flag warns, it does not block.
    "narrative": "Every line is checked\nagainst what you tapped.",
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


def render_caption(text: str, path: str, note: str = "") -> None:
    """A caption band: forest, mostly opaque, paper type, a sand rule above.

    `note` is a smaller sand line under the caption, for saying something about
    the footage rather than about the product -- currently only that a wait was
    shortened. It is set quieter than the caption because it is a disclosure,
    not a selling line, but it is on screen for as long as the thing it
    discloses.
    """
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

    nf = font(34)
    nh = d.textbbox((0, 0), note, font=nf)[3] if note else 0
    if note:
        total += nh + 18

    y = (BAND_H - total) // 2
    for ln, h in zip(lines, heights):
        w = d.textbbox((0, 0), ln, font=f)[2]
        d.text(((W - w) // 2, y), ln, font=f, fill=PAPER + (255,))
        y += h + gap
    if note:
        w = d.textbbox((0, 0), note, font=nf)[2]
        d.text(((W - w) // 2, y + 4), note, font=nf, fill=SAND + (255,))
    img.save(path)


def render_mark(size: int) -> Image.Image:
    """The FlipBrief mark, drawn rather than loaded.

    It used to be read from tmp/demo-video/mark.png, and render_card skipped
    the badge in silence when that file was not there. Nothing in the repository
    ever created it — somebody put it there once — so the first time tmp was
    cleared every title card went out as plain green type, including the four
    poster frames on the public page, and nothing reported it.

    public/icon-512.png is not a substitute: that file is At Home Family
    Services' logo, not ours, so reaching for it puts a customer's branding on
    our own films.

    So the mark is drawn here from the same geometry as
    public/brand/flipbrief-mark.svg — an F on a 64 grid whose middle arm lifts
    at the tip, in two flat colours. Keep the two in step if either changes.
    Drawn at 4x and reduced, because PIL's polygon edges are hard otherwise.
    """
    s = 4
    box = size * s
    u = box / 64.0  # one SVG unit
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([12 * u, 8 * u, 24 * u, 56 * u], fill=FOREST + (255,))   # stem
    d.rectangle([12 * u, 8 * u, 46 * u, 20 * u], fill=FOREST + (255,))   # top arm
    d.rectangle([12 * u, 30 * u, 38 * u, 41 * u], fill=FOREST + (255,))  # middle arm
    d.polygon(                                                            # the lifting tip
        [(38 * u, 30 * u), (42 * u, 30 * u), (54 * u, 21 * u),
         (54 * u, 32 * u), (42 * u, 41 * u), (38 * u, 41 * u)],
        fill=SAND + (255,),
    )
    return img.resize((size, size), Image.LANCZOS)


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
    block = 380 + len(lines) * 108 + (len(sub.split("\n")) * 62 + 30 if sub else 0)
    y = (H - block) // 2 + 380
    badge = 300
    pad = 44
    plate = Image.new("RGBA", (badge, badge), PAPER + (255,))
    rounded = Image.new("L", (badge, badge), 0)
    ImageDraw.Draw(rounded).rounded_rectangle([0, 0, badge - 1, badge - 1], radius=68, fill=255)
    plate.putalpha(rounded)
    mark = render_mark(badge - pad * 2)
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


# The longest any one beat may hold the screen before the footage under it is
# sped up. Only the drafting wait has ever exceeded it.
MAX_BEAT_SECONDS = 8.0

# Beats whose footage was sped up, so the caption can say so on screen.
COMPRESSED: dict = {}


def compress_long_beats(raw: str, beats: list) -> tuple:
    """Speed up any beat that holds the screen longer than MAX_BEAT_SECONDS.

    The draft is the reason this exists. Asking a 9B model on a laptop to write
    a shift note takes the better part of a minute, and the capture now waits
    for the text to actually arrive rather than cutting away from an empty box.
    Truthful footage, unwatchable film: a caption reading "it drafts from what
    you tapped" would sit over forty-nine seconds of a turning spinner.

    Cutting the wait out entirely is the normal thing to do and is the one
    option not taken here. A demo that jumps from the button to a finished
    paragraph tells a buyer the draft is instant, and for a product sold on
    saving time that is a claim worth being careful with. So the wait is sped
    up rather than removed -- the spinner is visibly still turning -- and the
    caption says how long it really took. A viewer who wants to know what they
    are waiting for is told.
    """
    spans = []
    for i, b in enumerate(beats):
        end = beats[i + 1]["at"] if i + 1 < len(beats) else None
        if end is None:
            break
        spans.append([b["name"], b["at"], end])
    over = [s for s in spans if s[2] - s[1] > MAX_BEAT_SECONDS]
    if not over:
        return raw, beats

    parts, shift, moved = [], 0.0, {}
    for name, start, end in spans:
        real = end - start
        speed = max(1.0, real / MAX_BEAT_SECONDS)
        kept = real / speed
        moved[name] = start - shift
        if speed > 1.0:
            COMPRESSED[name] = real
        parts.append((start, end, speed))
        shift += real - kept

    chain, streams = [], []
    for idx, (start, end, speed) in enumerate(parts):
        chain.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},"
            f"setpts=(PTS-STARTPTS)/{speed:.4f}[p{idx}]"
        )
        streams.append(f"[p{idx}]")
    # Everything after the last beat -- the closing hold -- is kept as it is.
    chain.append(f"[0:v]trim=start={parts[-1][1]:.3f},setpts=PTS-STARTPTS[tailv]")
    streams.append("[tailv]")
    chain.append("".join(streams) + f"concat=n={len(streams)}:v=1:a=0[v]")

    out = os.path.join(SRC, "paced.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
         "-filter_complex", ";".join(chain), "-map", "[v]",
         "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "25", "-an", out],
        check=True,
    )
    for name, real in COMPRESSED.items():
        print(f"  sped up '{name}': {real:.1f}s of real waiting -> {MAX_BEAT_SECONDS:.0f}s")
    last = beats[-1]["name"]
    moved.setdefault(last, beats[-1]["at"] - shift)
    return out, [{"name": b["name"], "at": moved[b["name"]]} for b in beats]


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

    raw, beats = compress_long_beats(raw, beats)
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
        # If the footage under this beat was sped up, say so, and say how long
        # the real wait was. The alternative is a film that quietly implies the
        # draft lands the moment you ask for it.
        # Worded without naming what was waited for. It said "the draft took N
        # seconds", which is true of the note film and false of the roster
        # film, where the long wait is the assistant reading a pasted list and
        # no draft is involved.
        real = COMPRESSED.get(b["name"])
        note = f"this wait was really {real:.0f} seconds — shortened here" if real else ""
        render_caption(text, png, note)
        timed.append((png, start, end))

    # Phone footage is taller than 9:16, so fit its height and letterbox the
    # sides in forest rather than cropping. Cropping a phone screen removes the
    # top or bottom of the very UI the film is about.
    # Every caption input runs from zero on the film's own clock.
    #
    # These used to be offset into place with -itsoffset, so each caption
    # existed only for the seconds it was on screen. Exactly one caption
    # survived that. Chained overlays share a framesync, and an overlay whose
    # second input has produced no frame yet does not wait politely -- the
    # first band composited and every later one silently did not. The films
    # shipped with ten captions encoded and one visible: the note film said
    # "Six notes a shift" and then went quiet for forty-five seconds, and the
    # roster, letterhead and audit films carried no caption at all between
    # their title and end cards. Nothing errored. The build printed
    # "encoding 10 captions" every time.
    #
    # So each image is now available for the whole film up to the moment it
    # leaves, and the fades are written at absolute timestamps rather than at
    # st=0 -- which is what -itsoffset was compensating for in the first place.
    inputs = ["-i", raw]
    for png, _start, end in timed:
        inputs += ["-loop", "1", "-t", f"{end + 0.5:.2f}", "-i", png]

    chain = [f"[0:v]scale=-2:{H},pad={W}:{H}:({W}-iw)/2:0:0x14452F,format=yuv420p[bg]"]
    last = "bg"
    FADE = 0.28
    for idx, (_, start, end) in enumerate(timed, start=1):
        # Fade the band in and out on its own alpha rather than snapping it.
        # A hard cut on a full-width bar is the single most amateur thing a
        # screen recording can do, and it is one filter away from not being.
        chain.append(
            f"[{idx}:v]format=rgba,"
            f"fade=t=in:st={start:.2f}:d={FADE}:alpha=1,"
            f"fade=t=out:st={max(0.0, end - FADE):.2f}:d={FADE}:alpha=1[c{idx}]"
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
