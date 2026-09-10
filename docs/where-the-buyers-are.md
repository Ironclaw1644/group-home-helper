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

## @healthbizfixer is a partner, not a prospect — and the best lead found

Read 2026-09-10, 18 videos from their public profile. They do not run a group
home. **They are a consultant who helps other people open and maintain HCBS and
waiver programs**, concentrated in Virginia, with clients in Georgia, Texas and
South Carolina. *"Since Friday, three of our client agencies in Virginia have
had unannounced licensing inspections."*

That makes them the wrong shape for a $100/month subscription and the right
shape for a referral relationship, because their audience is our buyer and
they reach it continuously.

**They already teach our exact pitch, unprompted:**

> *"When Licensing sees copy-paste notes, they don't ask why. They ask: 'How
> long has this agency been falsifying records? How are you monitoring staff
> documentation?'"*

That is the argument for signed, timestamped, uneditable notes, made better
than our own marketing makes it, to precisely the people who need to hear it.
Two more in the same vein:

> *"These compliance mistakes show up EVERY week — Policies ≠ Operations, weak
> documentation, unclear roles."*

> *"Most providers think passing licensing means they're good. But if your staff
> isn't trained… if your documentation isn't right… if your services can't be
> verified…"*

**And they are already sold on the mechanism.** *"Providers can't afford to
waste time on admin work. This is just one example of how I use AI to take hours
off my work."* We do not have to convince them that AI-assisted documentation is
legitimate; they advocate it publicly.

**They run a funnel that manufactures our buyer.** *"How to start a group home
in Virginia in under 60 seconds 🔑 Comment 'VIRGINIA' for the full checklist."*
Every person who comments is a brand-new Virginia provider who has just been
told their documentation will get them cited — before they have chosen a system.
That is the moment FlipBrief is easiest to adopt and hardest to displace later.

**The economics argue for us.** They publish revenue benchmarks for their
audience — roughly $6,380/month in Texas, $11,107 in South Carolina, $12,557 in
Virginia. At $100 flat, FlipBrief is about **0.8% of a Virginia provider's
monthly revenue**. That framing is theirs, not ours, and it is a better one than
any we have used.

Also worth knowing from their content: Virginia has a **Sponsored Residential**
model that is distinct from licensed group homes, and DBHDS stopped accepting
something as of 31 August 2026 (post references a memo with dates). Both are
worth understanding before any Virginia conversation.

**Not contacted.** Nothing has been sent, and nothing will be without Ironclaw
saying so. The recommendation is a referral or partner-code arrangement, not a
sales pitch.

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
