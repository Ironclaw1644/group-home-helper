# Outreach list — TikTok, 2026-09-10

**Source:** 12 tags × 28 videos = 336 videos, 256 distinct accounts, swept with
`~/.openclaw/workspace/tools/tiktok-leads.py` from robots-permitted tag pages
and TikTok's official oEmbed endpoint. No account, no app, no key.

**Importable copy:** `~/.openclaw/workspace/flipbrief-leads.csv` — drag into
Notion to get a sortable database with a Status column.

**Nobody here has been contacted.**

## How this is ordered, and why it is not the raw score

The scorer ranks by role, I/DD language, compliance language, tag breadth, and
penalises the adjacent markets that share our vocabulary. Its first run put a
DD Waiver **family advocate** in first place — she says *"I help families
understand their options and guide them through the process"*, which is
textbook consultant language pointed in exactly the wrong direction. She
reaches waiver **recipients**; our buyer is the **provider** who serves them.

The scorer now has an audience axis (`facing`: PROVIDER / FAMILY / UNCLEAR) and
a −45 penalty for family-facing accounts. The list below is still hand-checked
on top of that, because the general lesson from this project holds: trust the
tag-level pattern, verify the individual row.

## Tier 1 — Partners. Contact these first.

They do not buy a per-agency subscription. They stand in front of everyone who
does, and each one is worth more than a single operator.

| Account | Where | Why them |
|---|---|---|
| **[@waivergroup](https://www.tiktok.com/@waivergroup)** — Waiver Consulting Group | — | A company whose entire business is HCBS waiver providers. Sells an *"HCBS Operator's Playbook… launching, surviving audits, and scaling a Medicaid waiver program."* **Best single target:** we are the missing execution layer under their playbook. |
| **[@mtqdigitaldesigns](https://www.tiktok.com/@mtqdigitaldesigns)** | VA | Onboards new **Virginia DBHDS** providers and openly fields *"What policies and procedures do I need? How do I stay compliant?"* — the exact question we answer, in the state where our template is strongest and our only customer lives. |
| **[@healthbizfixer](https://www.tiktok.com/@healthbizfixer)** | VA (+GA/TX/SC) | Teaches our pitch unprompted: *"When Licensing sees copy-paste notes, they don't ask why. They ask: 'How long has this agency been falsifying records?'"* Already advocates AI for admin. Runs a *"comment VIRGINIA for the checklist"* funnel that manufactures brand-new providers. Full profile in `where-the-buyers-are.md`. |
| **[@iam_th3danielle](https://www.tiktok.com/@iam_th3danielle)** — The Healthcare Compliance Officer | — | Runs a weekly *"PUSHING PROVIDERS THURSDAYS — as a compliance officer, how can I assist you?"* segment, openly asking providers what they need. Lowest-friction opening on the list. |
| **[@bizwithmonique](https://www.tiktok.com/@bizwithmonique)** | — | Writes customised **Policies & Procedures manuals** for providers. Natural bundle: they sell the policy, we are the system that proves the policy was followed. |

## Tier 2 — Direct prospects. I/DD operators.

| Account | Where | Why them |
|---|---|---|
| [@melaineyoung0](https://www.tiktok.com/@melaineyoung0) | — | *"I own a waiver case management company called Champion Support Services."* Named business, waiver-funded. |
| [@aszloyn](https://www.tiktok.com/@aszloyn) | — | Licensed group home for adults with disabilities. Frames the business in revenue terms, so the "0.8% of monthly revenue" argument lands. |
| [@shaycason_](https://www.tiktok.com/@shaycason_) | — | *"A safe, structured, and caring home for IDD/MI individuals."* |
| [@pr3ttypoodl3](https://www.tiktok.com/@pr3ttypoodl3) | — | Brand-new I/DD operator (`#idd #medicaidwaiver #newbusiness`). Month one is when documentation habits get set. |
| [@nursekeat](https://www.tiktok.com/@nursekeat) | NC | NC Innovations Waiver, autism/IDD. Qualify first. |
| [@deonlovell](https://www.tiktok.com/@deonlovell) | NC | Appears across all three group-home tags, `#autism`. |

## Tier 3 — Do not contact. Recorded so nobody re-finds them.

| Account | Why not |
|---|---|
| @theabbyarnold | Highest raw score in the whole sweep and **not a lead**. Family-facing: reaches people applying for the DD Waiver, not providers. The reason the scorer now has an audience axis. |
| @raisingrosie_dravet | Parent advocate on paid family caregiving. Not commercial. |
| @_theofficialarianajay_ | Residential Assisted Living — the adjacent market that shares our vocabulary. |
| @startinghomecarebusiness | Home care (TX/MI). Adjacent, not I/DD residential. |
| @kwadvancedconsulting | Telehealth compliance training. Compliance-fluent, wrong setting. |
| @sallardconsulting_coding | Medical coding, not I/DD — **but** the best line in the sweep: *"THINK LIKE AN INVESTIGATOR 🔎 The same sentence in 30 patient notes…"* Worth stealing for our own copy. |

## Who is deliberately absent

**DSPs.** `#dsp` and `#directsupportprofessional` are 21-of-24 I/DD but only
4-of-24 operators — they are individuals describing their working day, not
businesses. They are the **user** of this product and the audience for *"get
your shift notes done in 1 minute, not 30"*. An audience to speak to; not a
list to contact. Same for family members.

## Limits

- 28 videos per tag is a sample, and TikTok orders tag pages by its own ranking
  rather than chronologically. Rerun for fresh numbers; treat counts as
  directional.
- Classification is keyword matching. It was wrong about the #1 account until a
  human read it. Verify any row before acting on it.
- No engagement data — view and like counts sit behind TikTok's signed internal
  API, which we do not touch. "Reach" here means presence across tags, not
  audience size.
- 204 of 256 accounts were `UNCLEAR` on role. That is expected: most captions
  are too short to classify, and a bigger per-tag sample would convert some.

## Related

- `docs/where-the-buyers-are.md` — which tag holds the buyer, and why the
  obvious ones do not
- `~/.openclaw/workspace/tools/tiktok-leads.py` — the sweep and scorer
