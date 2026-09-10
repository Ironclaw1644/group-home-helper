# Where the buyers are

**Researched:** 2026-09-10, from public TikTok tag pages and the official oEmbed
endpoint. 8 tags, 24 videos each, 192 videos, 145 distinct accounts.
Method: `~/.openclaw/workspace/tools/tiktok-niche.py`.

## Why this file exists

The public site and the ad cuts were built on an assumption nobody had checked:
that I/DD group home operators are not reachable on social, and that the buyer
is found some other way. That assumption was stated confidently in this
project's own conversation on 2026-09-09 — *"your buyers are group-home owners
and administrators; they are not on TikTok"* — and it is wrong. They are there,
they post constantly, and they use consistent hashtags.

The interesting result is not "they exist". It is **which tag holds the buyer**,
because the obvious tags do not.

## The tag map, measured

Each tag's 24 videos were classified by caption language: does it read like
somebody who *runs* one of these (operator), does it use I/DD-specific language,
and does it belong to an adjacent market that shares the hashtags — youth/QRTP,
assisted living, sober living, transitional housing?

| Tag | n | operator | I/DD | adjacent | What it actually is |
|---|---|---|---|---|---|
| **#waiverservices** | 21 | **12** | **17** | 2 | **The buyer.** Only tag high on both axes. |
| #grouphomestartup | 18 | 12 | 1 | 3 | Operators, wrong vertical |
| #grouphomeowner | 20 | 12 | 3 | 2 | Operators, wrong vertical |
| #grouphome | 22 | 9 | 4 | 5 | Mixed; noisiest tag |
| #idd | 22 | 5 | 21 | 3 | I/DD, but families and advocacy |
| #dsp | 24 | 4 | 21 | 1 | **The user, not the buyer** |
| #directsupportprofessional | 20 | 4 | 14 | 0 | Same |
| #developmentaldisabilities | 21 | 1 | 13 | 1 | Families and advocacy |

Three conclusions fall straight out:

**`#waiverservices` is the one to be in.** It is the only tag where operator
language and I/DD language overlap — 12 and 17 out of 21. Every other tag has
one without the other. If we post in one place, it is this.

**`#grouphomestartup` and `#grouphomeowner` are a trap.** They look perfect —
12 of ~19 talk like operators — but only 1 and 3 use I/DD language. That
audience is opening assisted living, youth/QRTP, sober living and transitional
housing. They are running a different business under the same words, and a
FlipBrief pitch aimed there will bounce.

**`#dsp` is the user, and it needs the other message.** 21 of 24 are I/DD, only
4 read as operators. These are direct support professionals posting about
overnight shifts and what the work is actually like. They do not buy software —
but they are exactly who *"get your shift notes done in 1 minute, not 30"* was
written for. Two audiences, two messages, and we had been aiming one message at
both.

## Accounts worth a human look

Public business accounts, posting commercially about running I/DD homes. Listed
because their own content says they have the problem this product solves — not
scraped contact details, just what they published.

| Account | Why | Tags |
|---|---|---|
| `@healthbizfixer` | *"Virginia: Rates for DD waiver services increased as of July 1st. Remember this if you bill weekly…"* — **Virginia**, DD waiver, billing. Our existing customer's state. Prospect or partner. | waiverservices |
| `@prettyeducatednurse` (Joy, LPN) | *"just because you paid someone for policies and procedures doesn't mean your learning stops there. The state is always updating requirements"* — that is our pitch, in their words, to our audience. | waiverservices |
| `@aszloyn` — "Licensed Group Homes" | *"My licensed group home for Adults with Disabilities…"* 4 videos across 2 tags. Explicitly licensed, explicitly I/DD. | grouphome, grouphomeowner |
| `@shaycason_` | *"A safe, structured, and caring home for IDD/MI individuals"* | grouphomeowner, idd |
| `@pr3ttypoodl3` | *"#grouphome #idd #medicaidwaiver #newbusiness"* — a **brand-new** I/DD operator, which is when documentation habits get set. | idd |
| `@nursekeat` | NC Innovations Waiver, autism/IDD | developmentaldisabilities, waiverservices |
| `@deonlovell` | NC, appears across all three group-home tags, `#autism` | grouphome, grouphomeowner, grouphomestartup |

`@twiyamichele` (*"5 things you need to know before opening a group home"*) has
the broadest reach of any account found — 3 tags, 4 videos — but no I/DD
language. An educator for the adjacent market, useful to watch, not a prospect.

DSP accounts found (`@jordyn_kiser`, `@absolutelynotjaycee`, `@xorahleenxo`,
`@dizzityler`, `@iam.derick`) are deliberately **not** listed as targets. They
are individuals describing their working day, not businesses. They are an
audience to speak to, not a list to contact.

## Method, and its limits

Discovery reads `/tag/<name>`, which TikTok's robots.txt explicitly *Allows*;
metadata comes from TikTok's official `/oembed` endpoint, no account or app.
Search paths, which robots.txt disallows, are refused by the tool.

Three limits worth holding:

1. **24 videos per tag is a sample**, and TikTok orders tag pages by its own
   ranking, not chronologically. Rerun before treating any count as stable.
2. **Classification is keyword matching**, so it is directionally right and
   individually fallible. The tag-level pattern is strong enough to act on; a
   single account's flags are not.
3. **No engagement data.** View and like counts sit behind TikTok's signed
   internal API and are deliberately not collected, so "reach" here means
   appearing across tags, not audience size.

## Related

- `docs/competitive-landscape.md` — who else sells to this buyer
- `~/.openclaw/workspace/tools/tiktok-niche.py` — the sweep, rerunnable
- `~/.openclaw/workspace/skills/fetch-blocked-pages` — the fetch ladder and
  where it stops
