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
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (compatible; FlipBrief citation check; +https://flipbrief.com)"

# A primary source is published by the state (or by the federal government).
# Cornell's LII is a faithful mirror of state codes and is how the Ohio
# template was cross-checked, so it is allowed as corroboration -- but only
# alongside a state-run URL, never instead of one.
STATE_DOMAIN = re.compile(
    r"\.(gov|us)(/|:|$)|\.state\.[a-z]{2}\.us|codes\.[a-z]+\.gov", re.I
)
MIRROR_DOMAIN = re.compile(r"law\.cornell\.edu|casetext\.com|justia\.com", re.I)

# Not every state publishes its own code on a .gov. These are state publishers
# on other TLDs, each allowed by name rather than by a pattern, because "it
# looks official" is how a vendor summary gets treated as primary source.
# Each entry is checked by scripts/check-allowlisted-publishers.py, which
# refuses any that stops looking state-operated.
OFFICIAL_NON_GOV = {
    # The Florida Administrative Code and Register, published under the
    # authority of the Florida Department of State.
    "flrules.org",
    # The Georgia Department of Behavioral Health and Developmental
    # Disabilities -- the state agency itself, on a .org.
    "dbhdd.org",
}


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


BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def fetch(url: str, browser: bool = False) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": BROWSER_UA if browser else UA,
            "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read(8_000_000)
        ctype = resp.headers.get("Content-Type", "")

    # Several states publish the rule as a PDF. pdftotext is present on this
    # machine and the researchers used it; without this the check would reject
    # a real citation for the format it was published in.
    if "pdf" in ctype.lower() or url.lower().endswith(".pdf"):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            fh.write(raw)
            pdf_path = fh.name
        try:
            out = subprocess.run(
                ["pdftotext", "-q", pdf_path, "-"], capture_output=True, text=True
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout
        finally:
            os.unlink(pdf_path)
        return ""

    body = raw.decode("utf-8", errors="replace")
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", body)
    return re.sub(r"(?s)<[^>]+>", " ", body)


def rule_identifiers(citation: str) -> list:
    """The section numbers inside a citation, most specific first.

    An early version of this pulled out every loose digit and demanded they all
    appear in sequence. That rejected almost everything, and wrongly: Indiana's
    citation names four rules ('460 IAC 6-24-2 (with 460 IAC 6-17-2, 6-17-3 and
    6-17-4)'), so the check was looking for fourteen numbers in a row that no
    page could ever contain. California's carries a title number and a section
    number that sit in different places on the page. Both are real citations
    that were being thrown away.

    What identifies a rule is a contiguous section number -- 5123-9-30,
    245D.095, 6100.226, 56026 -- so those are what gets extracted, and finding
    any one of them is enough. Loose one- and two-digit fragments are dropped:
    a page containing "3" proves nothing.
    """
    found = re.findall(r"\d+[a-z]?(?:[.\-:]\d+[a-z]?)+|\d{4,}", citation.lower())
    # Most components first: '6-24-2' is better evidence than '460'.
    return sorted(set(found), key=lambda s: (-len(re.split(r"[.\-:]", s)), -len(s)))


# A researcher saying, in some phrasing or other, that the rule they found is
# not about progress notes.
#
# The first version of this was a list of exact phrases lifted from Alabama and
# Connecticut. South Dakota then arrived saying the same thing in different
# words -- "describes the contents of the participant's record, not the
# contents of a per-shift progress note" -- and sailed straight through. Phrase
# matching is whack-a-mole against a writer who has infinite ways to say it.
#
# So this matches the shape instead: a negation within a short distance of the
# word "note". That deliberately over-catches, because the two outcomes are not
# symmetric. A false catch costs a footer that says nothing, which is a fine
# document. A miss puts a false regulatory claim on a filed Medicaid record.
# Aimed at one claim, because the footer only makes one: "Layout built to
# satisfy <rule>". That is true when the rule says what documentation must
# contain, and false otherwise.
#
# A first attempt matched any negation near "note" and caught twenty-six
# states, but for three different reasons piled together: rules that genuinely
# do not describe note content, rules that simply require no SIGNATURE, and
# states that merely publish no numbered FORM. Only the first bears on whether
# the footer's claim is true -- a rule can enumerate a note perfectly well and
# demand nobody sign it. So this looks for a negated content verb: not
# enumerating, not prescribing, not specifying what a note contains.
NOT_ABOUT_NOTES = re.compile(
    # not ... enumerate ... note        ("does not enumerate what a note contains")
    r"\b(?:not|no|never)\b[^.;]{0,40}"
    r"\b(?:enumerat|prescrib|specif|describ|mandat)\w*"
    r"[^.;]{0,60}\b(?:notes?|content)"
    # note/content ... not ... enumerate ("notes be kept but does NOT prescribe")
    r"|\b(?:notes?|content)\w*[^.;]{0,40}\b(?:not|no)\b[^.;]{0,25}"
    r"\b(?:enumerat|prescrib|specif|describ)\w*"
    # describe ... not ... note          South Dakota puts the negation last:
    # "describes the contents of the participant's record, not the contents of
    # a per-shift progress note". Same claim, reversed, and it escaped a
    # pattern that only looked for negation first.
    r"|\b(?:enumerat|prescrib|specif|describ)\w*[^.;]{0,70}"
    r"\bnot\b[^.;]{0,40}\bnotes?\b"
    r"|\bdo not print\b|\bdelegates entirely\b",
    re.I,
)

# A negation that turns out to be about who signs, or whether a numbered form
# exists, rather than about what the note must contain.
#
# Both are extremely common in this material and neither bears on the footer's
# claim: a rule can enumerate a note in exact detail and still require no
# credential and publish no form. Left in, these produced false positives on
# Indiana ("No credential is specified for the signer"), Georgia ("No DSP
# credential is specified for routine progress notes"), Hawaii ("no specific
# form is mandated - only required content") and New York ("No numbered OPWDD
# form - the ADM prescribes format and content"), the last two of which say
# outright that the content requirement exists.
ABOUT_SIGNING_OR_FORMS = re.compile(
    r"credential|signer|signature|licen|numbered|\bform\b", re.I
)

# States where a human read the flagged sentence and decided the citation is
# still the right thing to print. Nothing gets in here without a reason
# somebody wrote down, because the whole point of over-catching above is that
# the override is where the thinking has to be visible.
RELEVANCE_REVIEWED = {
    # "a daily note is not required" is about FREQUENCY, not content. North
    # Carolina requires a daily grid for Residential Supports under NC
    # Innovations and a monthly note for the state-funded equivalent. The rule
    # does enumerate what the note contains -- twelve elements, read and
    # recorded -- so it is the right citation for the layout. Worth knowing in
    # a sales conversation, not a reason to drop the citation.
    "US-NC": "negation concerns note frequency by funding stream, not note content",
}


def relevance_warning(state: dict) -> str:
    """Why this citation must not be printed, even though it is real.

    Everything else here proves a citation EXISTS. Nothing proves it is ABOUT
    anything. Those are different questions and the gap between them is exactly
    where this shipped a wrong answer: Alabama's r. 580-5-30-.04 is a real,
    current, correctly quoted rule about record management that says nothing
    whatever about what a progress note contains -- its own researcher wrote
    "DO NOT print an Alabama note-content rule number on a filed record" -- and
    it went onto the printed page saying "Layout built to satisfy" it.
    Connecticut was the same shape: nine required elements that turn out to be
    the contents of an individual's file, not fields of a note.

    A footer claiming a layout satisfies a rule the layout has nothing to do
    with is a false claim to an auditor, which is the one reader who matters.

    This is a backstop, not a substitute for reading. It catches the case where
    the researcher noticed and said so. Nobody should sell into a state on the
    strength of a citation they have not read themselves.
    """
    if not (state.get("required_elements") or []):
        return "researcher recorded no note-content requirements from this rule"

    blob = " ".join(
        str(state.get(k) or "") for k in ("notes", "service_type", "signature_rule")
    )
    for hit in NOT_ABOUT_NOTES.finditer(blob):
        snippet = " ".join(hit.group(0).split())
        if ABOUT_SIGNING_OR_FORMS.search(snippet):
            continue  # about a credential or a form number, not about content
        if RELEVANCE_REVIEWED.get(state.get("code")):
            return ""  # a human read it and wrote down why it still stands
        return (
            "researcher wrote that this rule does not describe note content: "
            f"{snippet[:90]!r}"
        )
    return ""


def check(state: dict) -> tuple:
    """Return (ok, reason). ok=False means: ship this state without a citation."""
    cite, url = state.get("citation"), state.get("source_url")
    if state.get("confidence") != "primary-source-read":
        return False, "not claimed as read"
    if not cite or not url:
        return False, "claims primary-source-read but has no citation/url"

    irrelevant = relevance_warning(state)
    if irrelevant:
        return False, irrelevant

    host = urllib.parse.urlparse(url).hostname or ""
    allowlisted = any(host == d or host.endswith("." + d) for d in OFFICIAL_NON_GOV)
    if not STATE_DOMAIN.search(url) and not allowlisted:
        if MIRROR_DOMAIN.search(url):
            return False, f"mirror, not a state-run primary source: {host}"
        return False, f"not a state-run domain: {host}"

    try:
        page = fetch(url)
    except urllib.error.HTTPError as err:
        # A 403 is a bot filter, not evidence about the citation. Try once as a
        # plain browser before giving up, and say so if it still refuses --
        # "could not check" and "checked and found false" must not look alike.
        if err.code in (301, 302, 403, 406, 429):
            try:
                page = fetch(url, browser=True)
            except Exception:
                return False, f"HTTP {err.code}: source blocked the check, not verified either way"
        else:
            return False, f"HTTP {err.code} fetching source"
    except Exception as err:  # DNS, TLS, timeout, redirect loop
        return False, f"could not fetch source: {type(err).__name__}"

    flat = normalise(page)

    ids = rule_identifiers(cite)
    if not ids:
        return False, f"citation names no rule number to check: {cite!r}"
    if not any(normalise(i) in flat for i in ids):
        return False, f"page contains none of the rule numbers {', '.join(ids[:3])}"

    evidence = (state.get("evidence") or "").strip()
    if not evidence:
        return False, "no verbatim evidence quoted"
    matched, total = quote_overlap(evidence, flat)
    if total < 3:
        return False, "evidence too short to prove anything"
    if matched / total < QUOTE_THRESHOLD:
        return False, f"only {matched}/{total} of the quoted phrases appear on the cited page"

    return True, f"rule number and {matched}/{total} quoted phrases present at source"


# How much of a claimed quotation must actually be on the page.
#
# Set from the measured distribution rather than picked as a round number, and
# the distribution turned out to be sharply bimodal. Across forty researched
# states, every quotation that came off the cited page scored between 0.64 and
# 1.00; every one that did not scored 0.00 -- including a deliberately
# fabricated control, and Florida, whose URL pointed at a rule's index page
# instead of the document holding the text. Nothing landed between 0.00 and
# 0.64.
#
# So the honest threshold sits in that empty gap, not inside either cluster.
# 0.7 was the first guess and it cut through the middle of the genuine group,
# rejecting real citations from real state code sites for the crime of eliding
# a sentence. This is chosen after seeing the data, which is only legitimate
# because the gap is empty: it is not tuned to admit any particular state, and
# moving it anywhere in 0.1-0.6 changes no verdict.
QUOTE_THRESHOLD = 0.5


def quote_overlap(evidence: str, page_flat: str) -> tuple:
    """(phrases found, phrases checked) for a claimed quotation.

    Overlapping four-word phrases, rather than the whole string. Requiring the
    quotation to appear contiguously rejected fifteen states whose citations
    were real -- Arkansas quoted two sentences joined by an ellipsis, Oregon
    prefixed the rule number to the quote in its own words. Both were reported
    as "quoted evidence does not appear on the cited page", which was untrue
    and would have thrown away good work.

    Four words is long enough that matching one by chance is unlikely and short
    enough to survive an elision in the middle of the quotation.
    """
    words = normalise(evidence).split()
    if len(words) < 4:
        return (0, 0)
    shingles = [" ".join(words[i:i + 4]) for i in range(len(words) - 3)]
    found = sum(1 for s in shingles if s in page_flat)
    return (found, len(shingles))


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
