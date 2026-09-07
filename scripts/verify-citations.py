#!/usr/bin/env python3
"""Check that every legal citation a template claims is real.

docs/adding-a-state.md draws the line this enforces: a form number is a claim
that a numbered state document exists, and a citation is a claim that somebody
read the rule. Both get printed at the foot of a Medicaid record. An invented
one is worse than a blank page, because a blank page does not get filed.

These citations were gathered by research agents reading state code sites. That
is a reasonable way to gather them and a terrible way to trust them: a language
model producing a plausible rule number is the single most likely failure here,
and a plausible rule number is indistinguishable from a real one by eye. So
nothing is taken on the researcher's word. For each state claiming a citation:

  1. Fetch source_url. It must resolve, and it must be a state-run domain --
     a vendor summary is not a primary source no matter how accurate.
  2. The cited rule identifier must appear in the fetched page.
  3. The verbatim `evidence` snippet must appear in the fetched page.

(3) is the one that catches fabrication. A researcher that invented a rule can
usually invent a matching number too, but it cannot invent forty words that
happen to be present in a page it never read.

Anything that fails is not an error to fix -- it is demoted to a state with no
citation, which is a perfectly good row. Coverage is not worth a false claim.

  python3 scripts/verify-citations.py /tmp/states-all.json          # report
  python3 scripts/verify-citations.py /tmp/states-all.json --write  # + demote
"""

import json
import re
import sys
import urllib.error
import urllib.request

UA = "Mozilla/5.0 (compatible; FlipBrief citation check; +https://flipbrief.com)"

# A primary source is published by the state (or by the federal government).
# Cornell's LII is a faithful mirror of state codes and is how the Ohio
# template was cross-checked, so it is allowed as corroboration -- but only
# alongside a state-run URL, never instead of one.
STATE_DOMAIN = re.compile(
    r"\.(gov|us)(/|$)|\.state\.[a-z]{2}\.us|codes\.[a-z]+\.gov", re.I
)
MIRROR_DOMAIN = re.compile(r"law\.cornell\.edu|casetext\.com", re.I)


def normalise(text: str) -> str:
    """Collapse whitespace and punctuation so quoting differences do not matter.

    Code sites vary section signs, non-breaking spaces, curly quotes and hyphen
    styles between the rendered page and anything quoted out of it. Comparing
    raw strings produces false failures, and a false failure here trains people
    to pass --write without reading, which defeats the point.
    """
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace(" ", " ")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read(4_000_000)
    body = raw.decode("utf-8", errors="replace")
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", body)
    return re.sub(r"(?s)<[^>]+>", " ", body)


def citation_tokens(citation: str) -> list:
    """The numeric spine of a rule number, e.g. '5123-9-30' -> ['5123','9','30'].

    Matching on the whole formatted citation fails constantly, because a page
    writes 'rule 5123-9-30' where the citation says 'Ohio Admin. Code
    5123-9-30'. The digits and their order are the part that identifies the
    rule, and the part a fabrication has to get right.
    """
    return re.findall(r"\d+[a-z]?", citation.lower())


def check(state: dict) -> tuple:
    """Return (ok, reason). ok=False means: ship this state without a citation."""
    cite, url = state.get("citation"), state.get("source_url")
    if state.get("confidence") != "primary-source-read":
        return False, "not claimed as read"
    if not cite or not url:
        return False, "claims primary-source-read but has no citation/url"

    if not STATE_DOMAIN.search(url):
        if MIRROR_DOMAIN.search(url):
            return False, f"mirror, not a state-run primary source: {url}"
        return False, f"not a state-run domain: {url}"

    try:
        page = fetch(url)
    except urllib.error.HTTPError as err:
        return False, f"HTTP {err.code} fetching source"
    except Exception as err:  # DNS, TLS, timeout, redirect loop
        return False, f"could not fetch source: {type(err).__name__}"

    flat = normalise(page)

    tokens = citation_tokens(cite)
    if not tokens:
        return False, f"citation has no rule number to check: {cite!r}"
    spine = " ".join(tokens)
    if spine not in normalise(cite):
        spine = None
    # The tokens must appear close together, in order, somewhere in the page.
    window = r"\D{0,12}".join(re.escape(t) for t in tokens)
    if not re.search(window, flat):
        return False, f"page does not contain rule number {'-'.join(tokens)}"

    evidence = (state.get("evidence") or "").strip()
    if not evidence:
        return False, "no verbatim evidence quoted"
    ev = normalise(evidence)
    if len(ev.split()) < 4:
        return False, "evidence too short to prove anything"
    if ev not in flat:
        # Allow the quote to have been trimmed mid-sentence at either end.
        words = ev.split()
        core = " ".join(words[1:-1]) if len(words) > 5 else ev
        if core not in flat:
            return False, "quoted evidence does not appear on the cited page"

    return True, "citation, rule number and quoted text all present at source"


def main() -> None:
    path = sys.argv[1]
    write = "--write" in sys.argv
    states = json.load(open(path))

    kept, demoted = [], []
    for s in sorted(states, key=lambda x: x["code"]):
        ok, reason = check(s)
        mark = "ok  " if ok else "DROP"
        print(f"  {mark} {s['code']}  {s['name']:22} {reason}")
        if ok:
            kept.append(s["code"])
        else:
            demoted.append(s["code"])
            if write:
                s["citation"] = None
                s["citation_title"] = None
                s["form_number"] = None
                s["effective_date"] = None
                s["confidence"] = "not-found"
                s["demoted_reason"] = reason

    print(f"\n  {len(kept)} verified citation(s): {', '.join(kept) or 'none'}")
    print(f"  {len(demoted)} state(s) will ship with no citation, which is honest.")

    if write:
        json.dump(states, open(path, "w"), indent=2, sort_keys=True)
        print(f"\n  rewrote {path} with unverifiable claims removed")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main()
