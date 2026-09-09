# Competitive Landscape — I/DD Documentation Software

**Research date:** 2026-09-08
**Subject:** FlipBrief (flipbrief.com) vs. the field
**Method:** vendor sites first, then review sites (labelled). Where a vendor does not publish a price, this document says **"not published"** and does not estimate.

> **Sourcing note.** A large number of "pricing" pages for this category (ITQlick, SaaSworthy, Zoftwarehub, SoftwareFinder, Techimply, SaaS Adviser, findEMR) publish invented or inferred numbers for vendors that publish nothing. Those are **not cited as pricing** anywhere in this document. Where a *review* site (G2, Capterra, Software Advice, GetApp, SelectHub) reports a figure, it is labelled as a review-site report, not a vendor claim.

---

## 1. Market shape

The I/DD documentation market is barbelled, and the middle is where FlipBrief is trying to stand. At the top, Therap Services is the de facto standard — it is a full waiver-operations platform (eMAR, GER incident reporting, ISP/person-centred planning, EVV, billing and claims, case management, waiver slot management) and it publishes no price at all; its only public CTA is "Request a Demo" ([therapservices.net/products](https://www.therapservices.net/products/)), and both [G2](https://www.g2.com/products/therap-services/pricing) and [Capterra](https://www.capterra.com/p/124101/Therap/) confirm the vendor has declined to provide pricing. Alongside it sit the enterprise EHRs — Qualifacts/Credible, ContinuumCloud/Welligent, Foothold's AWARDS, Netsmart, WellSky, MediSked — which are aimed at multi-programme agencies and priced accordingly; Foothold's own buyer guide places configurable systems of AWARDS' type in a **$15,000–$100,000 annually** band ([footholdtechnology.com](https://footholdtechnology.com/human-services-software/ehr-costs-pricing/)). At the bottom, and this is the important part, a cohort of small, fast, transparent entrants has appeared in the last few years and is attacking exactly the 4–20 bed provider FlipBrief is aiming at: **CareHub by DSPlife**, **Sereniq**, **Giv**, **Statewise**, **AL Cloud Care/Sushoo**, and **iCareManager**. Several of these already publish prices, ship state-specific form libraries, run phone-first DSP apps, offer free trials with no salesperson, and — critically — advertise AI note drafting constrained to what staff actually entered. The gap FlipBrief was built for is real but it is **no longer empty**, and the strongest competitor in it (CareHub) matches nearly every structural differentiator FlipBrief claims while also shipping eMAR, incident reporting, scheduling, payroll and Medicaid claims.

---

## 2. Comparison table

| Vendor | Target size / type | Pricing (public) | Mobile note entry | Immutable signed notes | State forms | Source |
|---|---|---|---|---|---|---|
| **FlipBrief** | 4–20 bed I/DD residential, HCBS waiver | **$100/mo flat**, unlimited beds & staff, no setup fee | Phone-first, chip-based | **Yes — Postgres trigger, append-only audit log** | 50 states + DC templates; 22 cite the state rule | (subject) |
| **Therap Services** | All sizes; dominant in I/DD; G2 says 70.9% mid-market | **Not published** — vendor declined to provide to G2/Capterra | Yes — Mobile Applications module | Not advertised. Related workflow (Individual Plans) is editable in Draft/Pending Approval, restricted once Approved | Not advertised as printing named state forms | [products](https://www.therapservices.net/products/), [G2 pricing](https://www.g2.com/products/therap-services/pricing), [Capterra](https://www.capterra.com/p/124101/Therap/) |
| **CareHub by DSPlife** | I/DD waiver providers: group homes, sponsored residential, day, in-home | **Not published** — per-location, same-day quote. No setup fee, no minimum contract, month-to-month default, ~5% off annual, free migration | Yes; voice dictation on every narrative box | Not advertised as immutable; signatures enforced at submit, incomplete records cannot be filed | **Yes** — 50-state form library "kept current with your state"; dedicated Virginia/DBHDS page | [pricing](https://carehub.mydsplife.com/pricing), [Virginia](https://carehub.mydsplife.com/states/virginia) |
| **Sereniq** | I/DD group-home and host-home providers; Texas live, other states on request | **Not published** (no pricing page) | **Yes — mobile-first, offline-tolerant DSP app** | Not advertised | **Yes** — "true-to-form HHSC documents" in Texas; state-adaptive elsewhere | [Foothold alternative page](https://sereniqcare.com/alternatives/foothold) |
| **Giv** | I/DD group homes | **$18 per active client/mo** (Essential). Empower = customizable. One-click billing +$3/client; pharmacy integration from $8/client, setup fee may apply | Yes — DSP mobile app | Not advertised | Not advertised | [pricing](https://givhealthcare.com/pricing), [group home](https://givhealthcare.com/lp/group-home) |
| **Statewise** | Medicaid providers incl. I/DD; 38 states pre-configured | **"Starting at $1,000/month"** — implementation included, annual standard agreements | Yes — mobile documentation, "Archie AI voice documentation" | Not advertised | State-by-state waiver/EVV rules pre-configured | [pricing](https://statewise.com/pricing), [implementation](https://statewise.com/implementation), [IDD](https://statewise.com/idd-ehr) |
| **AL Cloud Care (Sushoo)** | Assisted living, group home, behavioral health, I/DD | **Published:** eMAR-only $3.99/bed/mo (setup fees apply); Premium $10.00/bed/mo ($0 setup); Elite $12.00/bed/mo. **Minimums: $50/EIN/mo eMAR-only, $120/EIN/mo Premium & Elite** | Not established | Not advertised | Not advertised | [pricing](https://al-cloudcare.com/SushooACCPricing.html) |
| **iCareManager** | I/DD residential & group homes | **Not published** | Not established from public pages | Not advertised | Not advertised | [residential](https://www.icaremanager.com/residential-care-services) |
| **SETWorks** | Disability service agencies; employment, day, community, personal care, residential | **Not published** — tiered by *average number of individuals served annually*, not per user; all features + unlimited storage included | Not established | Not advertised | Per-state marketing pages (OH, IA, CA) | [FAQ](https://set-works.com/faq/), [home](https://set-works.com/) |
| **Foothold Technology (AWARDS)** | Human services / behavioral health / I/DD; 1,000+ agencies | **Not published.** Own buyer guide bands configurable systems at **$15,000–$100,000/yr**; states basic EHR costs include implementation fees | DSP role supported | Not advertised | Configurable via FormBuilder (agency builds it) | [costs guide](https://footholdtechnology.com/human-services-software/ehr-costs-pricing/) |
| **MITC / Agency Workforce Mgmt** | I/DD & behavioral health agencies, 30–3,000 employees | **Not published** — "best price guarantee", custom quote | Time & attendance / EVV focused | Not advertised | No | [mitcagencies.com](https://mitcagencies.com/), [solutions](https://mitcsoftware.com/solutions/) |
| **Sandata** (acquired by HHAeXchange) | Home health, MCOs, I/DD providers, state payers | **Not published** — quote-based, annual billing | EVV-centric | Not advertised | No — EVV aggregator, not a notes tool | [HHAeXchange–Sandata FAQ](https://www.hhaexchange.com/hhaexchange-sandata-faq) |
| **HHAeXchange** | Homecare agencies & payers | Not published by vendor. *SelectHub (review site) reports "starts at $375 per month"* | Yes | Not advertised | No | [SelectHub](https://www.selecthub.com/p/home-care-software/hhaexchange/) |
| **Qualifacts / Credible** | Large agencies: CMHC, CCBHC, SUD, I/DD, residential | Not published by vendor. *GetApp/Software Advice (review sites) report from **$45,000/yr*** | Yes | Not advertised | No | [GetApp](https://www.getapp.com/healthcare-pharmaceuticals-software/a/credible-behavioral-health/), [Qualifacts](https://www.qualifacts.com/about/credible-ehr-platform/) |
| **ContinuumCloud / Welligent** | Behavioral health, SUD, child & family, I/DD, school health | **Not published** — G2 lists no entry-level pricing | Yes | Not advertised | No | [G2](https://www.g2.com/products/welligent-part-of-continuumcloud/reviews) |
| **AlayaCare** | Home care / community care, enterprise | Not published by vendor. *Review sites report conflicting figures (~$1,000/mo; also $1,650/mo + $5,000 one-time) — treat as unreliable* | Yes | Not advertised | No | [Capterra](https://www.capterra.com/p/147424/AlayaCare/), [SelectHub](https://www.selecthub.com/p/home-care-software/alayacare/) |
| **DSP Suite** | Individual DSPs / small orgs; 6 offline Android apps | Not published on landing page | Yes — fully offline, on-device | No — device-local PDF export | No | [dspsuite.app](https://dspsuite.app/) |
| **Lumary / Brevity** | **Australian NDIS market**, not US Medicaid | Brevity publishes AU pricing | — | — | No US state forms | [Brevity AU](https://www.brevity.com.au/pricing/) |
| **MedSys** | Home care / HCBS | **Not published**; no I/DD residential documentation positioning found | — | — | No | — |
| **"DSPeasy"** | **No such product found.** Searches surface DSP Suite, dspworkplace (different market) and DSP training providers. Treat as non-existent until a URL is produced. | — | — | — | — | — |

---

## 3. What they have that we don't — the honest gap list

Ranked by how often a 4–20 bed prospect will actually raise it on a first call.

**1. eMAR / medication administration.** This is the number-one objection and it is not close. A group home's single largest compliance risk is the med pass, not the progress note. Therap ships a Medication Administration Record module ([products](https://www.therapservices.net/products/)); CareHub ships "full MAR, plus controlled counts, disposal records, and transfer sheets" ([pricing](https://carehub.mydsplife.com/pricing)); Giv includes eMAR in the $18 Essential tier ([pricing](https://givhealthcare.com/pricing)); AL Cloud Care sells eMAR *alone* for $3.99/bed/mo ([pricing](https://al-cloudcare.com/SushooACCPricing.html)); iCareManager has pharmacy-integrated eMAR ([residential](https://www.icaremanager.com/residential-care-services)); Sereniq shows tonight's med pass in the DSP app with refusal alerts routed to supervisors and nurses ([page](https://sereniqcare.com/alternatives/foothold)). FlipBrief has none of this. Every provider on paper is *also* on a paper MAR, and they will want both solved in one purchase.

**2. Incident reporting.** Second-most-asked, and in some states it is the legally sharper obligation. Therap's GER is arguably the most-used incident module in the sector; CareHub does incidents with root cause analysis, quarterly review and *state-specific deadline clocks* — its Virginia page tracks the 24-hour CHRIS reporting deadline explicitly ([Virginia](https://carehub.mydsplife.com/states/virginia)). FlipBrief has none.

**3. Medicaid billing / claims submission.** The thing that actually pays the provider. Therap has a Billing Solutions suite and Individual Budgeting & Billing; Statewise includes "pre-submission scrubbing, automated 835 remittance posting, state portal integrations" ([pricing](https://statewise.com/pricing)); Giv sells one-click billing at +$3/active client; CareHub is an "Approved DMAS Service Center for 835 Electronic Remittance Advice" in Virginia ([Virginia](https://carehub.mydsplife.com/states/virginia)). FlipBrief does not touch claims. Note the counter-argument: Sereniq deliberately does not submit claims either and says so plainly — so a narrow scope is defensible, but it must be *argued*, not left silent.

**4. ISP / person-centred plan management, and goal-linked notes.** This is the gap that most undermines FlipBrief's core pitch. Competitors don't just store the ISP — they *pull plan goals through onto the note*. CareHub: outcomes "flow forward into daily notes and monthly progress notes automatically — no rekeying goal language between documents." Sereniq: "the right note format loads with the person's plan goals attached," with a hard goal-link gate where the programme requires it. Virginia's actual rule ([12VAC35-105-680](https://law.lis.virginia.gov/admincode/title12/agency35/chapter105/section680/)) requires notes documenting "the implementation of the goals and objectives contained in the ISP." A note that is not linked to an ISP goal is arguably not a compliant note. **This is a compliance gap, not just a feature gap.**

**5. Scheduling, time & attendance, payroll.** Giv, CareHub, Statewise, MITC and iCareManager all include some or all of it. For an owner-operator of three homes, "one app instead of four" is the whole value proposition.

**6. EVV.** Mandated federally for many HCBS services. Statewise includes Sandata / AuthentiCare / HHAeXchange aggregator connections with no per-aggregator fee; Therap has an EVV/Scheduling module. FlipBrief has none. Mitigating: EVV applicability for *residential* group-home services is narrower than for in-home supports, so this may not bite for the core buyer — but the prospect will ask.

**7. Staff credential / training expiry tracking.** DBHDS and equivalents check this at licensing review. CareHub, Giv and iCareManager all track document expirations.

**8. Free data migration.** CareHub offers free migration and does the work; Sereniq includes white-glove migration; Statewise brings client and employee profiles over as part of implementation. FlipBrief has no stated migration story. For a provider on paper this matters little; for anyone leaving Therap it is decisive.

**9. Offline capability.** Sereniq is "offline-tolerant"; Statewise advertises offline mode for rural coverage; DSP Suite is 100% offline. A group home with bad wifi in a basement med room will ask.

**10. Behaviour support plans and data.** CareHub ships behaviour plans, data sheets and trend graphs; iCareManager has behaviour plans. Common in I/DD residential.

**11. Family/guardian portals and external signature capture.** AL Cloud Care Elite adds a Family Portal; CareHub sends signature requests to guardians and coordinators who don't work in the system.

**12. Track record.** Therap has been operating since 2003 and holds 20+ US patents ([footer](https://www.therapservices.net/products/)). FlipBrief has **zero customers**. Every competitor above has at least a customer story page.

---

## 4. What we have that they don't — ranked by what matters to a 4–20 bed provider

**1. A published, flat, unconditional price.** This is the strongest remaining differentiator, and it is narrower than it looks — but it is real. Therap, CareHub, SETWorks, Foothold, ContinuumCloud, Sandata, MITC, iCareManager and Sereniq all require a conversation to learn a number. Of the vendors that *do* publish, FlipBrief still wins on total cost at the top of the range and on predictability everywhere:

| Beds | FlipBrief | Giv Essential ($18/client) | AL Cloud Care Premium ($10/bed, $120 min) | Statewise (from $1,000) |
|---|---|---|---|---|
| 4 | **$100** | $72 | $120 (minimum) | $1,000+ |
| 6 | **$100** | $108 | $120 (minimum) | $1,000+ |
| 12 | **$100** | $216 | $120 | $1,000+ |
| 20 | **$100** | $360 | $200 | $1,000+ |

Note honestly: **Giv is cheaper than FlipBrief below ~6 beds** and includes eMAR, scheduling and claims. FlipBrief's flat price only starts winning around 6 beds and wins decisively at 12–20. The pitch is not "cheapest" — it is "flat, and it never moves when you grow."

**2. Immutability that is actually enforced.** No competitor found in this research advertises cryptographically or structurally immutable signed notes. The closest anyone comes is workflow-level: Therap restricts editing of Individual Plans once Approved ([help](https://help.therapservices.net/app/answers/detail/a_id/2038/~/edit,-update,-and-sign-individual-plan)), and CareHub enforces required signatures at submit time so incomplete records cannot be filed. **Enforcing the lock in a Postgres trigger rather than app code is a genuinely stronger guarantee than anything else in this market**, and it is the right answer to the question "could a manager have gone back and changed this after the incident?" The catch, addressed below: no buyer currently asks that question unprompted. This is a differentiator that must be *taught* before it can be sold.

**3. Time to first note.** Statewise publishes a **14-week average go-live** ([implementation](https://statewise.com/implementation)). Foothold notes that basic EHR costs include implementation fees. FlipBrief's self-serve start is materially faster than the enterprise tier. But note the erosion: CareHub offers a **14-day free trial, no card required, no setup fee, free migration** and same-day quotes with "no discovery call to sit through"; Giv runs a "Try Before You Buy". Self-serve trial is **no longer unique** — it is now table stakes among the new entrants.

**4. Scope discipline.** FlipBrief does one thing. For an owner who has been burned by a half-configured platform, "this does progress notes, completely, and nothing else" is a real pitch — Sereniq makes essentially this argument against Foothold and it reads well. This is a positioning asset, not a feature.

**5. Printing on the agency's own letterhead.** Not advertised by any competitor found. Small but genuinely differentiating for a provider who hands paper to a licensing specialist.

---

## 5. The wedge

The buyer is the **owner-operator of two to six licensed homes who is still doing this on paper or in a shared Google Doc, and who has never bought software before.** They are not evaluating Therap and finding it expensive — they have not called Therap at all, because they assume anything with a "Request a Demo" button is aimed at agencies bigger than theirs and will involve a salesperson, a quote, an implementation project and a contract. That assumption is broadly correct: Therap publishes no price and its only CTA is a demo request; Foothold's own guide puts configurable systems in a $15,000–$100,000/yr band; Statewise starts at $1,000/month on annual agreements with a 14-week go-live. For a provider billing maybe $400–900k a year across five beds, a 14-week project and an annual contract is not a purchase decision, it is a second job. The wedge is not "cheaper than Therap." It is **"you can be documenting properly this afternoon, for a price you already know, without talking to anyone."** The person who buys this is the one whose actual alternative is not a competitor — it is a binder, a shift log, and the quiet knowledge that if a licensing specialist pulled three months of notes tomorrow, some of them would be missing and some would be written in the same handwriting on the same day.

The second, sharper wedge is **the note that cannot be changed after it is signed.** Every provider in this sector knows what a back-dated note looks like, and every provider knows that the reason paper survives is precisely that it is forgiving. The honest sales conversation is: *the reason your documentation is a risk is not that it is on paper, it is that it can be edited into existence after the fact — and a surveyor who suspects that will find it.* FlipBrief's Postgres-enforced lock and append-only audit log answer that specific fear better than anything else on the market. But this only works as a wedge if FlipBrief tells the buyer the fear is real first, because **nobody is shopping for immutability** — they are shopping for "stop the med errors" and "help me pass my next review." That means the realistic entry point is a provider who has *already had a bad licensing review or a citation on documentation*, and is motivated by a specific, recent scare. Outside that trigger, the flat price and the fast start will get FlipBrief a trial, but the eMAR gap will lose the purchase to CareHub or Giv, both of which offer the same friction-free start plus the med pass.

---

## 6. Objections we cannot currently answer

Blunt. These are the ones that end calls.

**"Does it do the MAR?"** No. And there is no good answer today. The prospect's med pass is a higher-stakes daily risk than the progress note, and a competitor at a comparable price (Giv at $18/client, AL Cloud Care at $10/bed) does both. Expect to lose deals on this single question more than all others combined. There is no messaging fix — this is a roadmap problem.

**"So I still need something else for incidents / billing / scheduling / staff files?"** Yes, and the honest total-cost answer gets worse for FlipBrief the moment a second tool is required. $100/mo flat stops being cheap when it is $100 + an eMAR + a scheduler.

**"How is this different from CareHub?"** This is the hardest question in the deck and there is currently no prepared answer. CareHub matches free trial, no setup fee, no minimum contract, month-to-month, unlimited staff, per-state form libraries maintained by the vendor, AI drafting that "never invents anything a staff member did not document," free migration and same-day quotes — **and adds MAR, incidents, ISP, scheduling, payroll, claims and behaviour support** ([pricing](https://carehub.mydsplife.com/pricing)). The only defensible answers are (a) FlipBrief publishes its price and CareHub does not, and (b) enforced immutability. Both are true. Neither is currently articulated anywhere.

**"You say you ship Virginia's DBHDS Form #680 — what is that?"** ⚠️ **This claim appears to be wrong and should be corrected before it goes on a public page.** `12VAC35-105-680` is a *regulation section*, not a form. Its title is "Progress notes or other documentation" and its entire operative text is one sentence: *"The provider shall use signed and dated progress notes or other documentation to document the services provided and the implementation of the goals and objectives contained in the ISP."* ([law.lis.virginia.gov](https://law.lis.virginia.gov/admincode/title12/agency35/chapter105/section680/)). DBHDS numbers its licensing forms with an `OL-` prefix — e.g. [OL-3007eLic](https://dbhds.virginia.gov/library/licensing/OL-3007eLic.pdf), [OL-3121eLic](https://dbhds.virginia.gov/library/licensing/ol-3121elic.pdf). No "DBHDS Form #680" was found. Virginia does not mandate a progress-note *form* at all; it mandates note *content*. A knowledgeable Virginia provider or a licensing specialist will catch this immediately, and it damages credibility precisely with the audience that most values regulatory precision. Recommended reframing: *"meets the documentation requirement in 12VAC35-105-680."* Related risk: if "22 states cite the state's actual documentation rule" was assembled the same way, **the whole state library should be audited for form-vs-regulation confusion before launch.**

**"Show me a provider like mine who uses this."** Zero customers. No case study, no reference call, no logo. Every competitor has this. For a compliance purchase by a risk-averse buyer, absence of a reference is close to disqualifying.

**"What happens when a DSP writes the note wrong and it's already signed?"** Immutability is a benefit right up until it collides with reality. Notes get signed with the wrong date, on the wrong individual, or with a typo in a medication name. Unless there is a documented, surveyor-defensible **correction/addendum workflow** (append a correcting entry, never mutate the original), immutability reads to an operator as "the software will not let me fix my own mistake." This objection is answerable — but only if the workflow exists and is documented. It is the most likely reason a trial converts to a cancellation.

**"Is my data locked in? What if I leave?"** Competitors lead with free migration *in*. Nothing found on FlipBrief export/offboarding. A single-purpose tool holding the legal record of care must have a credible "you can take everything with you" answer.

**"Who are you, and will you exist in two years?"** Therap has traded since 2003 with 20+ patents. A zero-customer single-product vendor holding a provider's licensing evidence is a continuity risk, and sophisticated buyers will name it. There is no BAA, SOC 2, HIPAA attestation or uptime commitment referenced in the brief — competitors advertise "HIPAA compliant by default" (CareHub) and 99.9%+ availability (SETWorks) as standard.

**"Does it work when the wifi drops?"** Unknown from the brief. Sereniq, Statewise and DSP Suite all advertise offline handling. A phone-first product in a basement med room needs an answer.

**"Does the note pull my ISP goals in automatically?"** If not, FlipBrief is asking a DSP to re-type goal language that CareHub and Sereniq carry forward automatically — and, per 12VAC35-105-680, goal-and-objective implementation is the *substance* of what the note must document. This is the gap most likely to be raised by someone who actually knows the regulation.

---

### Appendix — vendors that publish nothing

Reported honestly, per brief: **Therap Services, CareHub by DSPlife, SETWorks, MITC, Foothold Technology, ContinuumCloud/Welligent, Sandata, iCareManager, Sereniq, MedSys** publish no price. **CareHub is the only one that explains why**, arguing a published ladder "either overcharges the first or undercharges the second" and committing to same-day quotes with no discovery call ([pricing](https://carehub.mydsplife.com/pricing)) — which is a materially better answer than silence, and blunts FlipBrief's transparency advantage.

**Vendors excluded as out-of-market:** Lumary and Brevity (Australian NDIS, not US Medicaid HCBS); dspworkplace (different "DSP" — not disability services). **"DSPeasy" could not be found and is presumed not to exist.**

---

## Addendum — 2026-09-09: a vendor the sweep missed

**APDHQ** (`apdhq.com`) — Florida-specific compliance and documentation software for APD
iBudget providers. Its own description: *"compliance and documentation software for Florida
APD iBudget providers — consumer and staff records, an AI documentation partner for your
session notes and reports, and built-in e-sign. Survey-ready, without the spreadsheets."*

Found incidentally while searching for Florida's official APD forms library — it ranks for
that query because it publishes an "APD Forms & Required Documents" index of its own.

Why it matters more than its size suggests: it is the closest competitor found so far to
what FlipBrief actually is. Not a waiver-operations platform, not an enterprise EHR — a
documentation tool with AI note drafting, e-signature and a state-specific form index,
sold to exactly the provider FlipBrief targets, in a state we cite. Pricing not yet
checked. It belongs in the comparison table above once someone reads its pricing and
feature pages properly.
