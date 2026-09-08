#!/usr/bin/env python3
"""Put the demo films on a CapCut timeline, ready to finish.

    python3 scripts/make-capcut-draft.py

Writes a project into CapCut's own drafts folder. Open CapCut and it is there,
four clips already laid out in order, ready for music, voiceover, transitions
and whatever else Pro is for.

WHY THIS AND NOT CLICKING AROUND CAPCUT

A CapCut project is a directory of JSON. Editing that JSON is deterministic,
reviewable and repeatable; driving the application's interface with synthetic
clicks is none of those things. This machine already had drafts edited this
way -- root_meta_info.json.bak_prev5, .bak_prev5b, .bak_prev6 next to the LUZIQ
ad are the fingerprint of a script, not of a mouse.

The draft is CLONED from an existing working project rather than built from
nothing. A video material carries about eighty keys, most of them defaults that
matter and none of them documented, and every segment points at a handful of
extra materials -- speeds, canvases, sound channel mappings -- that must exist
or the project will not open. Cloning keeps all of that intact and changes only
what has to change: which file each segment plays, how long it runs, and where
it sits on the timeline.

So this does not know how to make a CapCut project. It knows how to take one
that works and point it somewhere else, which is the part that is actually
needed and the part that can be verified by opening it.
"""

import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRAFTS = os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft")
PROJECT = "FLIPBRIEF DEMOS"

# Order matters: this is the reel a prospect would be walked through.
FILMS = [
    ("flipbrief-demo.mp4", "The shift note"),
    ("flipbrief-roster.mp4", "Your people"),
    ("flipbrief-branding.mp4", "Your letterhead"),
    ("flipbrief-oversight.mp4", "What an auditor sees"),
]


def duration_us(path: str) -> int:
    """Clip length in microseconds, which is CapCut's unit."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True,
    )
    return int(float(out.stdout.strip()) * 1_000_000)


def newest_source_draft() -> str:
    """A working project to clone. Most recently modified wins."""
    candidates = [
        os.path.join(DRAFTS, d)
        for d in os.listdir(DRAFTS)
        if os.path.isdir(os.path.join(DRAFTS, d))
        and os.path.exists(os.path.join(DRAFTS, d, "draft_info.json"))
        and d != PROJECT
    ]
    if not candidates:
        raise SystemExit(
            "No existing CapCut project to clone. Make one by hand first — this "
            "script deliberately does not invent the schema."
        )
    return max(candidates, key=os.path.getmtime)


def main() -> None:
    films = []
    for name, label in FILMS:
        path = os.path.join(ROOT, "public", "demo", name)
        if not os.path.exists(path):
            print(f"  skipping {name} — not built yet")
            continue
        films.append((path, label, duration_us(path)))

    if not films:
        raise SystemExit("No films built. Run npm run video:build first.")

    source = newest_source_draft()
    target = os.path.join(DRAFTS, PROJECT)
    print(f"cloning {os.path.basename(source)!r} -> {PROJECT!r}")
    if os.path.exists(target):
        shutil.rmtree(target)
    shutil.copytree(source, target)
    # A lock file from the source project would make CapCut think this one is
    # already open somewhere.
    for junk in (".locked", "draft_info.json.bak"):
        p = os.path.join(target, junk)
        if os.path.exists(p):
            os.remove(p)

    info_path = os.path.join(target, "draft_info.json")
    info = json.load(open(info_path))

    video_track = next(t for t in info["tracks"] if t["type"] == "video")
    segments = video_track["segments"]
    if len(segments) < len(films):
        raise SystemExit(
            f"The cloned project has {len(segments)} video segments and this reel "
            f"needs {len(films)}. Clone a project with at least that many, or add "
            "clips by hand once and re-run."
        )

    # Keep one segment per film and repoint it. Segments carry references to
    # extra materials that have to exist, so they are reused rather than built.
    keep = segments[: len(films)]
    materials = {m["id"]: m for m in info["materials"]["videos"]}

    cursor = 0
    for seg, (path, label, dur) in zip(keep, films):
        mat = materials[seg["material_id"]]
        mat["path"] = path
        mat["media_path"] = path
        mat["material_name"] = os.path.basename(path)
        mat["duration"] = dur
        mat["width"], mat["height"] = 1080, 1920
        mat["has_audio"] = False

        seg["source_timerange"] = {"start": 0, "duration": dur}
        seg["target_timerange"] = {"start": cursor, "duration": dur}
        seg["speed"] = 1.0
        seg["volume"] = 1.0
        seg["desc"] = label
        cursor += dur

    video_track["segments"] = keep

    # These films are silent on purpose — the music pass is the reason to open
    # CapCut at all. A leftover audio track would point at a file that is not
    # part of this project.
    info["tracks"] = [t for t in info["tracks"] if t["type"] == "video"]
    info["materials"]["audios"] = []

    info["duration"] = cursor
    info["canvas_config"] = {"ratio": "original", "width": 1080, "height": 1920,
                             "background": None}
    info["name"] = PROJECT
    json.dump(info, open(info_path, "w"), indent=1)

    meta_path = os.path.join(target, "draft_meta_info.json")
    if os.path.exists(meta_path):
        meta = json.load(open(meta_path))
        meta["draft_name"] = PROJECT
        meta["draft_fold_path"] = target
        meta["tm_duration"] = cursor
        json.dump(meta, open(meta_path, "w"), indent=1)

    print(f"\n{PROJECT} — {len(films)} clips, {cursor / 1_000_000:.1f}s")
    for path, label, dur in films:
        print(f"  {dur / 1_000_000:6.1f}s  {label}")
    print("\nOpen CapCut; it is in your project list.")


if __name__ == "__main__":
    main()
