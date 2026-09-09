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
| **TX** | HHSC | `fhb.hhs.texas.gov/forms` | **YES — optional** | Form 4119 *Residential Support Services (RSS) and Supervised Living (SL) Service Delivery Log*. Also 4117 supported employment, 4118 respite, 2124 transportation, 8615/8616 skills & socialisation. Completed within 14 days, kept in the individual's record. §3850 says "may be used"; a provider may document "in any way that meets the requirements of Section 3800". |
| **WV** | Bureau for Medical Services | `bms.wv.gov` (IDDW provider manual) | **YES — mandatory** | WV-BMS-IDD-7 *Direct-Support Service Log*. Manual: *"Documentation must be completed on a Direct-Support Service Log (WV-BMS-IDD-7)"*. Also WV-BMS-IDD-08. This "must" is the only one of its kind found. |
| **MO** | DMH, Division of DD | `dmh.mo.gov/dev-disabilities/forms` | **NO** | Real forms library, but the logs are *RN Oversight Service Log* (nursing), *Adaptive Equipment Maintenance Log*, *Professional Managers Log*. Also publishes *Agency Documentation Review for ISL and Group Homes* — an audit checklist the state reviews **against**, which is useful to read but is not a note form. |
| **NC** | DHHS | `ncdhhs.gov` (records management manual) | **NO** | The entire 168,000-character records manual names exactly one form: `DMH-4401`, *Drug Education School Completion form*. Unrelated. |
| **VA** | DBHDS | DBHDS licensing forms | **NO** | DBHDS numbers forms with an `OL-` prefix. There is no "Form #680" — 680 is a section of regulation `12VAC35-105`. This is the fabricated form number the product printed for about a year. |

## Located but not fully searched

| State | Agency | Where | Obstacle |
|---|---|---|---|
| **OH** | DODD | `dodd.ohio.gov/forms`, `/wps/portal/gov/dodd/forms-and-rules` | JavaScript portal; the form index is not in the served HTML. |
| **NY** | OPWDD | `opwdd.ny.gov/system/files/documents/…` | Site returns 403 to scripted fetches. Numbered forms confirmed to exist (e.g. OPWDD Form 108, 108a) but the ones found are registration/background-check, not notes. |
| **FL** | APD | `apd.myflorida.com` | 403/404 on guessed paths. Note that Florida's *documentation rules* are settled: 59G-13.070 incorporates the iBudget Handbook, which defines "Daily Progress Note" in prose, not as a numbered form. |
| **AR** | DHS DDS | `humanservices.arkansas.gov` | 403, and the cited source is a legacy `.doc` our extractor cannot read. |

## California is structurally different — worth knowing

California has **no single state forms library**. DDS delegates to **21 Regional Centers**,
each publishing its own vendor/provider forms (e.g. Westside Regional Center). So "the
California form" is not a thing that exists to be found, and any vendor claiming a
California form library means a regional centre's, not the state's.

## What works, and what does not

**Works.** Reading the state's own provider manual and searching it for form numbers —
that is `scripts/scan-state-forms.py`, and it is how both real hits are corroborated. A
state that mandates a form nearly always names it in the manual that mandates it.

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
