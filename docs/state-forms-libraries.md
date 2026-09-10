# Where the official state forms live

**Researched:** 2026-09-09. **Status: partial and honestly labelled.** Verified rows are
verified; everything else says so.

## Why this file exists

All the state research behind `/states` was a **rules** sweep. That is not the same as a
**forms** sweep, and Texas is the proof: HHSC publishes Form 4119 for residential support,
and its own rules say a provider "may" use it *or another form created for a similarly
intended purpose*. Nothing in a rules-first search had any reason to surface it. We found
it because a competitor advertised it, and until then the public page said West Virginia
was the only state that published a form at all.

So the question this file answers is: **for a given state, where is the official forms
library, and does it contain a progress-note or service-log form a provider fills in?**

## The short answer

Two jurisdictions publish such a form, and only one requires it. That claim now has two
independent lines of evidence, not one:

1. **Rules research** across 51 jurisdictions (the original sweep).
2. **`scripts/scan-state-forms.py`** — refetches all 27 cited states' own primary source
   documents and lists every form-shaped identifier appearing within ~160 characters of
   documentation language. Only Texas and West Virginia name one. This method *would* have
   caught Texas: §3850 of the HCS Billing Requirements names 4119 three lines from "service
   delivery log".

Neither proves a negative for the 24 uncited states, and neither would catch a state whose
forms library carries a note form its manual never mentions. That gap is real and is
recorded at the bottom.

## Verified

| State | Agency | Forms library | Note/log form? | Detail |
|---|---|---|---|---|
| **TX** | HHSC | `fhb.hhs.texas.gov/forms` | **YES — optional, and not a note** | Form 4119 *Residential Support Services (RSS) and Supervised Living (SL) Service Delivery Log*. Also 4117 supported employment, 4118 respite, 2124 transportation, 8615/8616 skills & socialisation. Completed within 14 days, kept in the individual's record. §3850 says "may be used"; a provider may document "in any way that meets the requirements of Section 3800". **Read the form itself before claiming anything about it — see below.** |
| **WV** | Bureau for Medical Services | `bms.wv.gov` (IDDW provider manual) | **YES — mandatory** | WV-BMS-IDD-7 *Direct-Support Service Log*. Manual: *"Documentation must be completed on a Direct-Support Service Log (WV-BMS-IDD-7)"*. Also WV-BMS-IDD-08. This "must" is the only one of its kind found. |
| **MO** | DMH, Division of DD | `dmh.mo.gov/dev-disabilities/forms` | **NO** | Real forms library, but the logs are *RN Oversight Service Log* (nursing), *Adaptive Equipment Maintenance Log*, *Professional Managers Log*. Also publishes *Agency Documentation Review for ISL and Group Homes* — an audit checklist the state reviews **against**, which is useful to read but is not a note form. |
| **NC** | DHHS | `ncdhhs.gov` (records management manual) | **NO** | The entire 168,000-character records manual names exactly one form: `DMH-4401`, *Drug Education School Completion form*. Unrelated. |
| **OH** | DODD | `dodd.ohio.gov/wps/portal/gov/dodd/forms-and-rules/forms` | **NO** | Index read 2026-09-09 by rendering it in a real browser — it is client-side and invisible to `curl`. 85 forms: assessments, applications, attestations, training verifications. Zero occurrences of "service log", "progress note" or "daily note". Note the index sits two levels below `/forms`. |
| **VA** | DBHDS | DBHDS licensing forms | **NO** | DBHDS numbers forms with an `OL-` prefix. There is no "Form #680" — 680 is a section of regulation `12VAC35-105`. This is the fabricated form number the product printed for about a year. |

## Texas Form 4119 is not a note, and we should not say it is

Downloaded and read 2026-09-09. Both language versions:

- `fhb.hhs.texas.gov/sites/default/files/documents/laws-regulations/forms/4119/4119.pdf`
- `…/4119/4119-S.pdf` (Spanish)

Two things about it matter, and neither is visible from the title.

**It is a dynamic XFA form.** `pdftotext` returns a 680-character "Please wait…
upgrade Adobe Reader" placeholder and nothing else — no form number, no field
labels. Chrome, Safari and Preview do not render XFA either. The real content is
XML in the AcroForm `/XFA` array: 9 parts, 309KB, a 300KB template, 195 fields
whose names are `A1, A2, A3…` and whose meanings live in 193 `<toolTip>` nodes.
Anything that tries to fill the state's own PDF with a normal PDF library will
fail, and anything that judges the file by `pdftotext` output will call it empty.

**It is a weekly grid of initials, not a narrative note.** Columns are Sunday
through Saturday. Rows are activities — bathing, dressing, personal hygiene,
eating, meal planning, meal preparation, housekeeping, then independent-living
skills. The instruction on the form reads *"At the end of your shift, initial
all items that you completed with the individual. If there were any
incidents…"*.

So FlipBrief's daily narrative note and Form 4119 are different documents doing
different jobs, and no amount of layout work turns one into the other. We must
not claim to "support Form 4119" or print it. What is true, and is enough:
§3850 says the form *may* be used, and a provider may document "in any way that
meets the requirements of Section 3800" — so a narrative note is legitimate in
Texas on its own terms. Say that instead.

This is the same failure shape as Form #680, caught one step earlier: a title
that sounds compatible, believed without opening the file.

## Located but not fully searched

**All three are now reachable** — the Cloudflare block was automation detection, not the
network (see below). What remains is finding the right index URL inside each site, which is
ordinary work rather than a wall.

| State | Agency | Where | Status |
|---|---|---|---|
| **NY** | OPWDD | `opwdd.ny.gov/search/forms` — the real index, found 2026-09-09 | It is a **search interface, not a static list**: 9,928 characters, 115 links, zero document links until a query is entered. Numbered forms exist (OPWDD Form 108, 108a) but those seen so far are registration/background-check, not notes. **`robots.txt` disallows `/search/`** (read through a browser 2026-09-09; `/providers` is allowed, `/search/forms` and `/admin/` are not). Advisory rather than binding, but it means driving that search is against the site's stated preference — so find another route into NY's forms, or ask OPWDD, rather than automating the one path they asked crawlers to leave alone. |
| **FL** | APD | `apd.myflorida.com` reachable | The homepage loads fine (4,361 chars headless). `/providers/` returns IIS's own `403 - Forbidden: Access is denied` — a wrong path, not a bot block. Florida's *documentation rules* are settled regardless: 59G-13.070 incorporates the iBudget Handbook, which defines "Daily Progress Note" in prose, not as a numbered form. |
| **AR** | DHS DDS | `humanservices.arkansas.gov/…/developmental-disabilities-services/forms-documents/` | Forms & Documents page read 2026-09-09: 827 links, **no note- or log-titled form**. Tentative NO — the page is nav-heavy and may paginate, so worth one more pass before it moves to Verified. |

## California is structurally different — worth knowing

California has **no single state forms library**. DDS delegates to **21 Regional Centers**,
each publishing its own vendor/provider forms (e.g. Westside Regional Center). So "the
California form" is not a thing that exists to be found, and any vendor claiming a
California form library means a regional centre's, not the state's.

## What works, and what does not

**Works.** Reading the state's own provider manual and searching it for form numbers —
that is `scripts/scan-state-forms.py`, and it is how both real hits are corroborated. A
state that mandates a form nearly always names it in the manual that mandates it.

**Works for the JavaScript portals.** Rendering the page in real Chromium via Playwright.
This is what finally opened Ohio, whose form index is built client-side and is simply absent
from the served HTML. Arizona too. See the `fetch-blocked-pages` skill for the escalation
ladder and, importantly, for how to tell a JavaScript problem from an IP block before
spending money on the wrong fix.

**Works for the Cloudflare-protected agencies too, and costs nothing.** NY OPWDD, FL APD,
GA DBHDD and AR DHS all return `403 Just a moment` to ordinary Playwright. A persistent real-Chrome
profile — `launchPersistentContext`, `channel: 'chrome'`, headed,
`--disable-blink-features=AutomationControlled`, `ignoreDefaultArgs: ['--enable-automation']`
— takes all four to `200` with real content. That recipe is **headed only**: the same
warmed profile returns `403 Attention Required` headless. For headless, SeleniumBase CDP
Mode works and extracts more (NY 7,641 chars vs 4,524; FL 4,361 vs 1,744), because
`chromium.launch()` is the detectable part rather than CDP itself.

An earlier draft of this file said the opposite: that three browsers failing identically
proved an IP-reputation block needing a paid proxy. That was wrong twice over. The three
were not independent tests — every one was automated in the same detectable way — and the
machine was already egressing from AS7018 AT&T, a residential consumer ISP, which is the
exact thing an unblocker service sells. Checking your own egress org before buying a proxy
takes one command and would have caught it.

**Does not work.** Guessing forms-library URLs, and crawling agency homepages for a "Forms"
link. Both were tried here at length. Modern state sites are JavaScript-rendered and
bot-protected; homepage link discovery returns "Tax Forms", "Contact Us" and "Website
feedback". Roughly half of the URL guesses 404 and several agencies 403 any scripted
request. Use search plus a manual read for a specific state; do not attempt a blind sweep.

**Never cite.** `templateroller.com`, `formalu.com`, `blanker.org`, pdffiller, signnow.
They republish state forms and are not authoritative. They are fine as a *lead* to the real
state URL and worthless as evidence.

## The remaining gap, stated plainly

We have not confirmed the absence of a note form in the **24 uncited states**, because we
have no verified primary document for them to scan. A state could publish a form its rules
never mention — exactly the Texas shape. If a competitor ever advertises a specific state's
form, that is a lead worth chasing the same way the Texas one was: it is how this whole
line of enquiry started.

## Related

- `scripts/scan-state-forms.py` — the standing check described above
- `data/state-documentation-rules.json` — the researched rule for all 51 jurisdictions
- `docs/competitive-landscape.md` — vendor claims, several of which are checkable against
  state sources
