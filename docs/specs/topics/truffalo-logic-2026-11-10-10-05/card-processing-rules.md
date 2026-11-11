# Card processing rules

_Generated 2026-11-10T10:05:52.856Z from the live code and database of this deployment._

How a parsed, scored source item becomes a Truffalo card. The system decides WHETHER there is a card (from the signals); the card LLM writes only the content.

## 1. Signal gate — which items become a card

- An item whose signal band is `none` (score 0) never reaches the card LLM (`isBelowCardThreshold`, SQL gate in `src/server/source-item-groups.ts`).
- A `state` code (Kind = state) never scores and never makes a card; it CLOSES open cards (§ 5).
- One card per item. At most one OPEN card per thread (`card_thread_open_uidx`); a newer card supersedes the old one.
- Card generation is serialised by thread.
- Per run: at most 50 items, 3 in parallel.

## 2. Card score → priority → delivery tier

- `card.score` = MAX(dominant item's parse-time total, highest thread-code weight). Not a sum.
- Item total = highest category weight + attributes capped at ±2; tie-break risk > chance > fyi.
- A card without signals (legacy) gets priority `normal` and tier `digest`.

| Band | Score | `card.priority` | `card.delivery_tier` |
| --- | --- | --- | --- |
| none | 0–0 | silent | silent |
| low | 1–3 | silent | weekly |
| normal | 4–5 | normal | digest |
| high | 6–7 | high | push |
| very_high | 8–9 | critical | push_critical |
| critical | ≥ 10 | critical | push_critical |

## 3. Thread-derived codes

| Rule | Value |
| --- | --- |
| Deadline counts as near (days) | 2 |
| Unanswered follow-ups before the code fires | 2 |
| Meeting events before "slow" fires | 2 |
| Samples for a per-sender baseline | 8 |
| Slower-response factor | 2 |
| Registered but never emitted | ATTR_COMM_SHORTER_COOLER, ATTR_COMM_LONGER_WARMER, MEETING_KEY_MISSING |

A thread code competes by its taxonomy weight under MAX; a code whose stage is not `active` weighs 0.

## 4. Inherited scores

These codes take the score of ANOTHER open card (e.g. a bounce inherits the score of the card whose mail bounced, found by the quoted Message-ID). The weight is only the default when nothing is found.

| Code | Label | Default weight | Stage |
| --- | --- | --- | --- |
| `MAILERDEMON_RECEIVED` | Mail undeliverable | 5 | active |

## 5. State triggers — codes that close cards

When an item carries an ACTIVE state code, the open cards of the same client that carry any target code are set to `closed`. Low-confidence entries are ignored. `closed` is not a human decision and not calibration data.

| State code | Label | Stage | Closes open cards carrying | Acts today |
| --- | --- | --- | --- | --- |
| `SALES_OFFER_SENT` | Offer sent | active | `SALES_OFFER_REQUESTED` | yes |
| `SALES_ORDER_CONFIRMATION_SENT` | Order confirmation sent | active | `SALES_ORDER_CONFIRMATION_REQUESTED`, `SALES_ORDER_CONFIRMATION_OPEN` | yes |
| `INVOICE_PAID` | Outgoing invoice paid | active | `INVOICE_OVERDUE` | yes |

## 6. Card status and thread windows

Card statuses: `open` · `accepted` · `rejected` · `superseded` · `expired` · `closed`. Only `open` is delivered.

| Window | Code default | Platform value | Org overrides |
| --- | --- | --- | --- |
| threads.dormantDays | 21 | 21 | — |
| threads.expireDays | 60 | 60 | — |

Onboarding window (cold start): 14 days. Re-delivery: at most 2 episodes per card per week. A saved window applies on the next thread rebuild.

## 7. Card output limits

| Field | Limit |
| --- | --- |
| headline | 12 words |
| analysis | 20 words |
| sinceLast | 16 words |
| recommendation | 3 steps × 15 words |

## 8. Notes for detected signals

Shown in the card prompt ONLY for the codes detected on the item (`tax.cardGuidanceFor`). Writing guidance only — never changes the score. Below: every note, plus every "leads over" and "both belong on the card" pair.

- SALES_TENDER_INVITATION: An invitation addressed to us, usually with a submission deadline. Name the deadline.
- CONTRACT_TERMINATED: The client cancels actively. An active cancellation outranks an approaching end date.
- CONTRACT_FRAME_EXPIRY: The contract runs out and nobody has acted yet.
- SALES_BUDGET_CUT: An announced budget, not a single booking. If the announcement leads to a concrete cancellation in the same item, the cancellation leads.
- CONTRACT_NOT_RENEWED: The end date has passed with no renewal visible.
- SALES_BOOKING_CANCELLED: The deal is gone, but the relationship is not. The recommendation asks for the reason and keeps the door open.
- SALES_RENEGOTIATION: The client wants to reopen agreed terms — price, discount, payment terms. This is a demand with a deadline, not a complaint.
- SALES_NEW_DEMAND: The client asks for something beyond what they have booked before. If they also ask for an offer, both belong on the card.
- SALES_BUDGET_INCREASE: An announced budget, not a single booking. If the announcement leads to a concrete cancellation in the same item, the cancellation leads.
- CONTRACT_RENEWAL_INTENT: The client raised the renewal themselves. This is the best moment, and it outranks an expiry warning for the same contract.
- SALES_OFFER_DECLINED: The deal is gone, but the relationship is not. The recommendation asks for the reason and keeps the door open.
- COMPLAINT_ESCALATED: A higher level is now reading. The escalation does not replace the original complaint — both belong on the card.
- MEETING_CANCEL: A cancellation that proposes a new date is a postponement, not a cancellation. Do not treat it as one.
- CONTACT_LEAVING: A relationship is ending. If a successor is named, the handover is still ONE action — thank the leaving contact, meet the successor. The analysis names both.
- SIGNAL_DOWNSIZING: A closure or job cut at our client can stop running bookings. Recommend contact to learn what continues.
- SIGNAL_AGENCY_CHANGE: One event with two parties: write it for the party that is our client — our client first, then the agency. 🔴 The headline action is OURS, never the advertiser's own step from the article (never 'Etat ausschreiben' / 'put the account out to pitch'). The ADVERTISER is our client: get in touch with its marketing contact and ask whether the change affects our plan (budget, timing), then get in touch with the new agency to learn its plans — the window is open before the pitch closes or the first plan is fixed. Example (de): '<Advertiser> — Marketingkontakt ansprechen, um im neuen Plan der Agentur vertreten zu sein'. The AGENCY that LOST the account — or may lose it in a tender — is our client: its bookings for this advertiser are at risk — name the winner (if known) and ask the agency what the change means for our cooperation. When the advertiser is our client too, that is a SECOND card: the advertiser card asks what the change implies and who comes next, the agency card asks what it means for our cooperation — never both in one card. Write 'Agenturwechsel besprechen', never 'Agenturwechsel klären'. Only the winning agency is our client: write it as that agency's account win (SIGNAL_ACCOUNT_WIN). The agency is our client and the advertiser is not: use the occasion to win the advertiser. The advertiser is our client and the new agency is not: use it to win the agency. For a media seller or publisher the class is yours (two-sided): our client is the AGENCY that lost the account — a risk when the advertiser was an active account (recover that budget with the agency's other accounts), an FYI when it was inactive. Our client is the ADVERTISER changing agency — a risk when it is an active client with good budgets (the new agency may question every booking: get in touch soon, learn what the new agency plans, show what we did for them), a chance when it is inactive or low budget (the new agency re-evaluates everything — a good moment to be seen; the same steps). When the advertiser AND its new agency are both our clients, write ONE card with both steps in order: first the advertiser (ask why it changed and whether it affects us), then the new agency (point to the existing relationship, learn its plans).
- SIGNAL_NEGATIVE_PRESS: A company in a crisis — bad press, a shitstorm, a recall or a safety warning — has to win back trust and inform its customers, and that may need communication. In good taste, never exploiting the crisis: get in touch with the marketing or communication contact at the company (by role), find out whether and how they plan to inform their customers, and only then a fitting offer (a trust or brand message, a placement that informs customers). Not our client: a first-contact opening about their communication, not about the crisis itself.
- SIGNAL_NEW_MARKETING_LEAD: Decide from our business with the company. Write the role, never a name: 'the new head of marketing at <company>'. Not our client, or a DORMANT client (no or very little business in the last 12 months, when our business is shown): the new head of marketing decides budgets afresh — a chance; recommend introducing ourselves early and finding out the plans (target group, goals, budget) before any offer. An ACTIVE client (regular, sizeable business) — the class is yours: a RISK by default (the new head re-checks existing partners; recommend an early meeting to learn the plans and secure ours), but a CHANCE when the new head is someone we know well — "Known people in a NEW company" says they come from an ACTIVE client of ours (a good relationship): recommend getting in touch to grow the budget together. Say how we know them, by role and company. When the change took effect 3–6 months before the item's date, or the date is vague ('seit dem Frühjahr'), write it passively and without urgency: 'falls noch nicht bekannt: …'.
- SIGNAL_MERGER: Write it from our client's side and name the other party. Our client BUYS or takes over a company or brand: a chance — a new brand to market; get in touch with the marketing contact, find out what the new brand needs (target group, timing, budget), and only then a fitting offer. Our client IS BOUGHT or merged into another group: a risk — the new owner may move budget and agencies; ask our marketing contact whether the new structure changes the cooperation (budget, agencies, timing), and secure the plan if yes. A DORMANT client, or a company that is not our client: a chance either way — a new structure re-evaluates its partners, a good moment to be seen; the same discovery steps. For a company that is NOT our client there is no cooperation to change: ask whether the takeover OPENS the chance of a cooperation (de: 'klären, ob die Übernahme Chancen für eine Zusammenarbeit eröffnet') — never 'whether the cooperation or the budget changes', never 'with the client'. Buyer and bought company in one item are ONE card: write it for the party that is our client and name the other. The same for every role (publishers, media sellers, agencies).
- SIGNAL_COMPETITOR: Write it about the client the competitor is active at — the competitor on its own is not the point.
- SIGNAL_PRODUCT_NEWS: The launch budget is planned before the launch — a chance to be part of the launch communication. Follow the default steps: get in touch with the marketing contact at the company, find out target group, goals, timing and budget, and only then a fitting offer based on that — never an offer, a package or a format as the first step. Name the product and the launch date when the item gives them.
- SIGNAL_EXPANSION: Only an expansion into the regions the organization profile names counts; a place outside them is not a card topic. A new site in our regions that is LOCAL (one town, one new store or centre) is a low chance: get in touch with marketing at the company and ask whether a national campaign goes with the opening; if not, it is a good hook to ask about their other campaigns (de: 'herausfinden, ob zur Eröffnung eine nationale Kampagne geplant ist'). A wider expansion (a new market, many sites) needs visibility from the start: get in touch with marketing at the company, find out target group, goals, timing and budget, and only then a fitting offer — never an offer, a package or a format as the first step. Time it before the opening. A completed building or housing project that now has to be sold or let is the same chance.
- SIGNAL_FUNDING: Fresh capital often comes before spending on growth — but do not assume it goes into marketing. Get in touch with the marketing contact at the company and find out whether the money brings marketing plans (target group, goals, budget), while it is not yet planned; only then a fitting offer.
- SIGNAL_C_LEVEL_CHANGE: An FYI for every relation except a TOP client (a risk: the new leadership may re-check partners — at a good moment, not urgent, ask our marketing contact whether the change affects our cooperation; only if yes: risks, chances, next steps). FYI card: the headline is only the fact ('<company> — neue Geschäftsführung'), no action. The analysis says what changed and why it MAY matter for us ('Das könnte Verschiebungen in den Budgettöpfen zur Folge haben'). Steps: keep it ready for the next conversation, and at that conversation ask whether the change affects our cooperation (budget, timing). Never recommend contacting the new person, never write a name, never a congratulation. A leadership person is the contact only when they are already in our Known contacts of this client — and then by role. Not our client: keep it ready for a first conversation (de: 'für ein Erstgespräch'), then ask whether the change opens a cooperation — never questions about the company's financial strategy. When the change took effect 3–6 months before the item's date, or the date is vague ('seit dem Frühjahr'), write it passively and without urgency: 'falls noch nicht bekannt: …'. When the person is already known to us — in our contacts at another client or from an earlier cooperation — say so by role ('the new CEO comes from <client>'). A new head of marketing is SIGNAL_NEW_MARKETING_LEAD, not this code.
- SIGNAL_REBRANDING: A new name, brand, CI or website has to be made known, and a relaunch often breaks what was set up before. Name the concrete change the item reports (new logo, new CI, new website) — never 'a new strategy'. Get in touch with the marketing contact at the company before the go-live, find out what has to be made known, to whom, when and with what budget, and only then a fitting offer.
- SIGNAL_STRATEGY_ANNOUNCEMENT: Name the consequence the item states. A new communication or brand strategy, a repositioning or more budget opens the plan — a chance: be part of it early. At an ACTIVE client a budget cut or a review of all partners puts our share at risk — a risk: secure the plan before it is decided.
- SIGNAL_CHANNEL_SHIFT: Say which way the budget moves. Towards a channel we sell — a chance: find out the new mix (channels, target group, budget) with the marketing contact, then a fitting offer. At an ACTIVE client, away from a channel we sell — a risk: talk before the next plan is fixed and show what our channel still does for them.
- SIGNAL_NEW_COMPANY: Always a prospect — a new company has no partner yet. Recommend a first contact, so we are the first partner it talks to.
- SIGNAL_TRADEMARK: Usually a new brand before its launch — no partner for it yet. Recommend a first contact, so we are the first partner it talks to.
- SIGNAL_JOB_POSTING: A company hiring for a marketing role is changing, questioning or adapting its marketing strategy — not necessarily spending more. TWO-SIDED at our client (the class is yours): a chance when it builds out its marketing; a risk when the previous person left — for example after a budget cut, which can mean less for us too. Not our client, or a dormant client: a chance. Either way recommend getting in touch quickly to learn what changes. When the post was placed through another medium or a competitor, say so — they won this placement — and ask about the next open positions before offering the next one: the need for people is still there.
- SIGNAL_EVENT: FYI — not new, but relevant: say what the company showed or announced there (a launch, a campaign, a partner) when the item names it. Keep it ready for the next conversation; no contact step, no offer.
- SIGNAL_ANNIVERSARY: An anniversary the company communicates is a dated occasion with a budget behind it — a chance. Follow the default steps: get in touch with the marketing contact at the company, find out target group, goals, timing and budget, and only then a fitting offer based on that — never an offer, a package or a format as the first step. Ask what is planned around it (campaign, special products, events), in time before the date. Never a congratulation.
- SIGNAL_SPONSORING: The company spends on sponsoring and MAY communicate around it — do not assume it. Get in touch with the marketing contact at the company and ask whether and how the sponsorship will be communicated; only if yes, find out target group, timing and budget, then a fitting offer.
- SIGNAL_INDUSTRY_TREND: A branch-wide development, not one company's event. The headline names the industry or the development instead of one client. Recommend checking which of our clients it touches — never an offer to one client on its own.
- SIGNAL_AWARD: FYI — good to know, not a sales trigger. Keep it ready for the next conversation: no contact step, no congratulation, no offer. When the company communicates with the award (advertising, a campaign), say so — that is worth asking about in that conversation.
- ACCOUNT_REVENUE_DECLINE_YOY: The client buys less from US than in the year before — our share, not their business. Recommend contact to find the reason while the next year is still open, not an investigation; an offer only after the reason and the plans are known. 🔴 The person the fact sheet names as 'Betreuer bei …' is OUR colleague — the reader of this card. Never name them as the person to contact, call or brief at the client. The contact is the marketing contact at the client, written by role ('Marketingkontakt bei <Kunde>'), never by name — the card lists its contacts on its own.
- ACCOUNT_DORMANT: A win-back, not a complaint: the client bought from us and has stopped booking. Name what they bought last and when, and how much they were worth in their best year. 🔴 TWO cases — read the fact sheet's rhythm line. (a) OVERDUE: the pause is longer than the client's own rhythm ('Pause länger als der Rhythmus — wir könnten den Kunden verlieren'), or the sheet has no rhythm line — a RISK card. Steps: get in touch with marketing at the client, find out why they stopped — after our own contact attempts went unanswered, ask about the broken-off contact (de: 'Kontaktabbruch') — and what they plan next (campaigns, timing, budget), and only then a fitting offer — never a price offer first. (b) GONE QUIET: the pause is longer than TWICE the rhythm ('still geworden, kein akutes Risiko') — an FYI card (the system sets the class). NO contact step and NO offer: say that the client has gone quiet, since when, what it booked and its usual rhythm, and why that matters for us; the step is 'keep it ready for the next conversation' (German: 'für das nächste Gespräch bereithalten'), at most a question for THAT conversation (German: 'Beim nächsten Gespräch fragen, ob wieder Kampagnen geplant sind'). 🔴 The person the fact sheet names as 'Betreuer bei …' is OUR colleague — the reader of this card. Never name them as the person to contact, call or brief at the client. The contact is the marketing contact at the client, written by role ('Marketing bei <Kunde>'), never by name — the card lists its contacts on its own.
- ACCOUNT_PRODUCT_NEW: An opportunity. Use the new purchase as an opening to show related or complementary products.
- ACCOUNT_PRODUCT_STOPPED: The client stopped buying a product or format that falls out of its usual buying rhythm — or, where no rhythm is established yet, that it has not bought for longer than the organization's time window. Get in touch with the marketing contact at the client and ask why while the next plan is still open; only then offer it again or an alternative — not a price cut.
- ACCOUNT_REVENUE_GROWTH_YOY: An opportunity, not a risk: the client buys more from us. The recommendation strengthens the relationship and expands the account — find out what drives the growth and what is planned next, then a fitting offer; it does not rescue it. 🔴 The person the fact sheet names as 'Betreuer bei …' is OUR colleague — the reader of this card. Never name them as the person to contact, call or brief at the client. The contact is the marketing contact at the client, written by role ('Marketingkontakt bei <Kunde>'), never by name — the card lists its contacts on its own.
- ACCOUNT_CROSS_SELL_GAP: A chance, not a risk: the client uses only one of our channels or product lines. Propose the combination for its next order — but only with a clear reason why the combination is an added value for the client; 'it leaves more money with us' is not a reason on its own.
- ACCOUNT_MEETING_OVERDUE: A risk: the relationship is going untended. Ask the KAM to schedule contact, not to investigate.
- ACCOUNT_NEW_FOLLOWUP: An opportunity. Use the delivery as a natural reason to check in and work toward a second order.
- COMPETITOR_NEW_CLIENT: FYI for the account team: name the competitor and the client it won, and say that no action is due now. Do not invent an offer. When the won client is one of OUR clients, the card belongs to that client's agency change (risk) instead.
- COMPETITOR_LOST_CLIENT: A pitch opening: a client without an agency usually looks for a replacement soon. Name the competitor and the client it lost, and recommend a short check whether a first contact makes sense. Never say the client is looking for us.
- SIGNAL_PARTNERSHIP: A new partnership MAY bring its own communication — do not assume it. Write it for OUR client, never for the partner. Get in touch with the marketing contact at the client and ask whether the cooperation will be communicated, and to whom; only if yes, find out target group, timing and budget, then a fitting offer. A partnership with no communication to customers is information: write the recommendation as for an FYI card (keep it ready).
- SIGNAL_AD_ACTIVITY: The campaign is already running or ends soon: probably too late for this one — but a good moment to get in touch. Never say it cannot be booked or that a placement is no longer possible: we do not know that (de: 'für diese Kampagne womöglich zu spät, aber ein guter Moment für die Kontaktaufnahme'). Name what the campaign is about (product, topic, target group) — never only 'the current campaign'. Steps: get in touch with marketing at the company, ask about the NEXT relevant campaigns (timing, goals, target group, budget) — never limit them (not 'the next global campaign') — and only then a fitting offer. Never an offer for the running campaign.
- SIGNAL_ACCOUNT_WIN: One event with two parties — write it for the party that is our client (the matched clients on the fact sheet), our client first. The AGENCY is our client: new budget is about to be placed — get in touch with the agency, find out the won account's plans (timing, channels, budget), and only then a fitting offer; name the advertiser as the won account. The ADVERTISER is our client: write it from the advertiser's side (SIGNAL_AGENCY_CHANGE) — ask whether the new agency changes anything for us, then get in touch with the agency. The advertiser is our client and the agency is not: use the occasion to win the agency. The agency is our client and the advertiser is not: use it to win the advertiser. Neither is our client: a prospect card about the winning agency — get in touch, find out whether there is ground for a cooperation, and only if yes agree the next steps.
- SIGNAL_OPERATIONS_INVESTMENT: FYI — nothing to sell from it, but worth knowing for the next conversation ('I read that …'). Write it for EVERY party that is our client and list ALL of them under clients: the buyer (it invests in its operations) and the supplier (it won an order). Headline action: keep it ready for the next conversation — never an offer, never a campaign, never a contact made only for this. Recommendation: one short line per client — for the buyer the investment, for the supplier the order it won. No congratulation.
- SIGNAL_STRATEGY_CONTEXT: FYI — a conversation starter, prepared for the account manager. Analysis: what was said, in one line, and why it may matter to the company. Recommendation: at the next contact ask what it means for them — implications, plans, how their customers or buyers see it (for example: 'what would your buyers say if production left Europe?'). Never an offer, never 'Kommunikation anbieten'.
- SIGNAL_TRACKING_VENDOR_CHANGE: Decide from our business with the company. Not our client, or a DORMANT client: a chance — the new set-up is still being built; get in touch with the marketing contact, ask how the switch went and whether conversions, consent and pixels still fire, and only then offer a tracking audit. An ACTIVE client or a client: a risk — ask why the vendor changed and what they expect from the new one, before the change sets in; show what we can take over. Name the tools when the item names them ('Google Tag Manager → Tealium'); a free-API scan names only the category — then say 'a tag manager was replaced' and look at the site first. A scan can be wrong: never claim the change as certain.
- SIGNAL_TRACKING_GAP: A chance: name what the scan did not find (analytics, consent tool, or both). Check the site yourself first — a scan can miss a tool that loads late or only after consent. Then get in touch with the marketing contact, find out how they measure their campaigns today and what they need, and only then offer a tracking set-up — consent first, then analytics and conversion tracking. For our own client it is an upsell, an extension of what we already do. Never write it as a reproach.
- SIGNAL_CAMPAIGN_PLANNED: The budget for this campaign is not placed yet — a chance to be part of it. Follow the default steps: get in touch with the marketing contact at the company, find out target group, goals, timing and budget, and only then a fitting offer based on that — never an offer, a package or a format as the first step. Name the campaign and its start when the item gives them.
- SIGNAL_ANNIVERSARY_PLAIN: FYI — our client has an anniversary, with no communication named. Keep it ready for the next conversation; at most ask THEN whether anything is planned around it. No contact step, no congratulation, no offer.
- SIGNAL_EVENT_UPCOMING: The company will be there — a chance to meet. Get in touch with the marketing contact at the company before the event and arrange a meeting there; at the meeting find out the need (target group, goals, budget). No offer before that. Name the event and its date.
- ACCOUNT_REACTIVATION_DUE: A routine reason to get back in touch, not a complaint and not a sales push. Say since when there has been no contact, what the last contact was (offer, task or conversation) and what the client status is (paused, finished, declined, or a lead). The step is a short, personal check-in with the client's marketing contact — written by role ('Marketing bei <Kunde>'), never by name — asking what they are planning next; for a declined client, ask whether the reasons for the 'no' still hold. Never a price offer first. 🔴 The person the fact sheet names as 'Betreuer bei …' is OUR colleague — the reader of this card, never the contact.
- CONTRACT_COMPLIANCE_DECLARATION: Usually a form a customer or a tender needs from us, often with a deadline. Name what is asked and by when. Step: fill it in and send it back, or name who in our team does it. Never a sales step.
- SUPPLIER_DELIVERY_DELAY: Purchasing work. Name our order, the article and the new date. Step: when a customer waits for these goods, tell the customer the new date; else nothing to do.
- SUPPLIER_PRICE_CHANGE: Purchasing work. Name the supplier, from when the prices apply and what changes. Step: check whether our sales prices or open offers with these goods must change; else nothing to do.
- SIGNAL_AGENCY_CHANGE leads over SIGNAL_AD_ACTIVITY — the agency decision leads over the campaign it produced. Name both; write the card around the leading one.
- SIGNAL_MERGER leads over SIGNAL_PARTNERSHIP — when control changes. Name both; write the card around the leading one.
- SALES_BOOKING_CANCELLED leads over ACCOUNT_REVENUE_DECLINE_YOY — one cancellation card — the decline is context in it, evidence of a wider pattern, not a card of its own. Name both; write the card around the leading one.
- SIGNAL_INSOLVENCY leads over SIGNAL_NEGATIVE_PRESS — existential beats reputational. Name both; write the card around the leading one.
- SIGNAL_NEW_MARKETING_LEAD leads over SIGNAL_C_LEVEL_CHANGE — for a CMO change. Name both; write the card around the leading one.
- COMPLAINT_QUANTITY leads over COMPLAINT_QUALITY — when too little was delivered. Name both; write the card around the leading one.
- SIGNAL_MERGER leads over SIGNAL_FUNDING — when control changes. Name both; write the card around the leading one.
- SALES_OFFER_DECLINED leads over SALES_OFFER_NO_RESPONSE — the explicit refusal closes the loop. Name both; write the card around the leading one.
- CONTRACT_TERMINATED leads over CONTRACT_NOT_RENEWED — an act beats the passing of time. Name both; write the card around the leading one.
- CONTRACT_RENEWAL_INTENT leads over CONTRACT_FRAME_EXPIRY — the opportunity beats the warning. Name both; write the card around the leading one.
- SALES_BOOKING_CANCELLED leads over SALES_BUDGET_CUT — the concrete loss counts. Name both; write the card around the leading one.
- SIGNAL_CHANNEL_SHIFT leads over SIGNAL_SPEND_DOWN — when the total stays the same. Name both; write the card around the leading one.
- SIGNAL_REBRANDING leads over SIGNAL_PRODUCT_NEWS — when the brand is what changed. Name both; write the card around the leading one.
- ACCOUNT_REVENUE_DECLINE_YOY leads over ACCOUNT_REVENUE_STAGNATION — the concrete, current loss leads; the stagnation is context. Name both; write the card around the leading one.
- SIGNAL_MERGER outranks SIGNAL_INSOLVENCY — a takeover reported together with an insolvency is the news (a rescue or a sale out of the insolvency) — the insolvency is context on that card, not its score. SIGNAL_INSOLVENCY is context only (not counted): write the card around SIGNAL_MERGER.
- SIGNAL_ACCOUNT_WIN + SIGNAL_AGENCY_CHANGE: not a conflict — one pitch from two sides — the agency won it, the advertiser moved it; write for whichever party is our client and name the other; both belong on the card.
- COMPLAINT_ESCALATED + COMPLAINT_PRICE / COMPLAINT_TIMING / COMPLAINT_COMM / COMPLAINT_QUANTITY / COMPLAINT_QUALITY: not a conflict — the escalation and the complaint underneath it; both belong on the card.
- SALES_NEW_DEMAND + SALES_OFFER_REQUESTED: not a conflict — the opportunity and the task; both belong on the card.

## 9. The card prompt as sent (platform part)

The platform card rule — **stored v4**, updated 2026-10-22T16:38:15.761Z — rendered by `buildPrompt` (`src/server/cards-generation.ts`). Edited by the platform admin on Rules → Platform card rule. `{{…}}` marks a per-item block. `# NOTES FOR THE DETECTED SIGNALS` (§ 8) and `# HOUSE STYLE` (§ 11) are filled per item and per org.

~~~~text
# TASK
You are a B2B sales signal analyst. You receive ONE source item (email, chat,
transcript, document, chatbot conversation or external source) that the Truffalo
signal engine has already parsed and classified. Your input: the item and its
metadata, the DETECTED SIGNALS (codes, evidence, score), the known clients, users
and contacts of this organization, and what we already know about the thread.

Interpret the detected signals, judge their meaning in context, and write ONE clear,
actionable card for the Key Account Manager.

🔴 You do NOT detect signals, calculate scores, or decide whether this is a card —
the system has already decided, from the detected signals, that it is one. Your
job is the content.

# WHO WROTE IT
A signal counts regardless of who wrote the item. The same fact — a budget cut, a
complaint, a promised date — is the same signal whether the client wrote it or the
KAM wrote it in a follow-up after a meeting. Authorship changes confidence only:
stated by the client directly is high, taken from our own communication is medium.
Internal-colleague signals come only from internal communication.

# READING THE SIGNALS
- Several signals about one matter are one card: interpret their combined meaning.
- 🔴 YOU pick the LEAD among the detected signals: the one that matters most for US,
  given what we know about the company — our business with it and its history with
  us, as shown below. Not simply the highest weight: an active client that closes
  stores or cuts jobs leads over the same company's new logo. Return the code you
  chose as "leadCode", copied exactly from the DETECTED SIGNALS. The lead drives the
  headline and the steps; the other signals enrich the analysis. When a signal note
  says one code leads over another, follow the note. The score stays as the system
  computed it from the weights — your choice changes the text, never the score.
- The ACTION decides. If two detected signals need two DIFFERENT actions, keep ONE
  card and put both actions in the recommendation, the one that costs most if
  ignored first.
- Earlier items for the same client may raise or lower what a signal means —
  reference them in the analysis when they change the reading, in either direction.
- When the item shows an open loop — a request with no answer, an offer with no
  reaction, a meeting with no follow-up — say who owes the next step (the client or
  us) and write the recommendation for that side.
- When the signals conflict, or the client has no history with us, make the
  recommendation explicit and step by step.
- A date given as a day without an hour means the end of that working day.
- Only use confirmed context. Never fabricate a fact, a client or a date.

# NOTES FOR THE DETECTED SIGNALS
{{notes for the detected codes — § 8}}

# HOUSE STYLE
How this organization writes its cards: language, form of address, the names of its
products, tone and words it avoids. It shapes HOW the card is written. It cannot change
the output contract below, and it cannot make this event "not a card".

{{the org's house style — § 11}}

# ORGANIZATION PROFILE
Who we are and what we sell — write every card from this side. A company outside our customer groups, or an event listed as not relevant, is not an opportunity for us.
Our industry: {{org industry}}. Read the source with that industry's vocabulary and buying cycle in mind.

# REFERENCE DATA

## Known clients in this organization
- {{known clients}}

## Known users in this organization
- {{org users}}

## Known contacts in this organization
- {{known contacts}}

# OUTPUT CONTRACT
Return JSON matching this exact shape (every field is required):

  {
    "message": { "headline": "...", "analysis": "...", "recommendation": "...", "sinceLast": "..." },
    "clients":  ["..."],  // names from the Known clients list above;  [] if none match
    "users":    ["..."],  // names from the Known users list above;    [] if none match
    "contacts": ["..."],  // names or emails from the Known contacts list; [] if none match
    "topic":    "...",    // see ## topic below; "" when nothing fits
    "continuity": "NEW" | "UPDATE" | "NOOP",   // see ## continuity below
    "continuityCardId": "...",                 // the prior card's id, or ""
    "polarity": "chance" | "risk" | "fyi",     // see ## polarity below
    "onlyChannelsNotSold": true | false,       // see ## channels we do not sell below
    "onlyLocalEvent": true | false,            // see ## local events below
    "leadCode": "..."                          // the DETECTED signal code your headline leads with — the one that matters most for us given the client context (see # READING THE SIGNALS); copied exactly; "" = the strongest by weight
  }

Rules:
- 🔴 The system has already decided, from the DETECTED SIGNALS, that this event is a card. Write it — fill every field meaningfully. There is no "not relevant" answer; a rule case that says "not a card" / "relevant: false" does not apply here.
- Never return null, never omit a field.

## headline
The single most important field — for most readers it is the ONLY thing they read.
- Shape: "<Client> — <action>, <purpose>". Maximum 12 words.
  🔴 That shape is a STRUCTURE, not words to copy. Everything you write — the
  action, the purpose, AND the words that join them — is in the card's language.
  This line used to read "<action> to <goal>", and the literal English "to" was
  copied straight into German headlines ("Angebot erstellen to increase
  revenue"). The joining word is yours to choose, in one language.
- 🔴 <action> is what WE (the organization reading this card) do next — NEVER the
  subject's own step that the source reports. The subject's step is the reason,
  not the action.
    Bad:  "Beispiel AG — Lieferanten neu ausschreiben, um Kosten zu senken." (Beispiel AG's own step)
    Good: "Beispiel AG — Einkaufsleitung kontaktieren, um in der neuen Ausschreibung dabei zu sein."
  🔴 An FYI card is the ONE exception: its headline states only the FACT —
  "<Client> — <what happened>", no action, no "bereithalten":
    Good: "Beispiel AG — baut das Werk in Linz aus"
    Good: "ÖAMTC Fahrtechnik — neue Geschäftsführung"
    Bad:  "Beispiel AG — Werksausbau für das nächste Gespräch bereithalten"
  🔴 A CHANCE or RISK card always gets in touch: its headline names our contact
  action, never "bereithalten" — keeping it ready is only the FYI step.
- Specific and action-oriented. No filler, no adjectives, no restating the subject line.
    Bad:  "Important update from client."
    Bad:  "iSi GmbH — Angebot erstellen to increase revenue." (two languages)
    Good (en): "Springer — send proposal by Friday to secure Q4 budget approval."
    Good (de): "Springer — Angebot bis Freitag senden, um das Q4-Budget zu sichern."
- 🔴 <Client> is always a COMPANY or organization — never a person's name, even
  when the source is about a person (a new manager, an interview).
    Bad:  "Wolfgang Greiner, ISLE AG — Kontakt aufnehmen …"
    Good: "ISLE — Kontakt aufnehmen …"
- 🔴 Write every company by its SHORT common name, in every field: no legal form
  (GmbH, AG, Ges.m.b.H., M.B.H. …), normal capitalisation, no descriptor words.
    Bad:  "HERVIS SPORT-UND MODEGESELLSCHAFT M.B.H. — …"
    Good: "Hervis — …", "Teekanne", "Generali", "L'Oréal Österreich"
- If no client from the Known clients list applies, use the company the item is
  about; if there is none, the concrete subject/topic of the item.
  NEVER invent a client name, and never fall back to a generic phrase.

## analysis — WHY NOW
ONE line, at most 20 words: the CONSEQUENCE, and BY WHEN.
- Say what is lost or goes wrong if nobody acts, and the date or window it turns on.
- Name the CONCRETE subject — what the campaign, the product or the news is about
  (its topic, product, target group) — never only "die aktuelle Kampagne".
- 🔴 Never repeat the steps here: no "jetzt Kontakt aufnehmen", "Kontakt kurzfristig
  aufnehmen", "Klärung in Kürze". Say why it matters ("die Karten werden neu
  gemischt").
- 🔴 NOT a summary of the source. The parser's own summary is already shown to the
  reader in the "Quellen" panel one tap away, so repeating it here spends the only
  line most readers will ever see on something they can already get.
    Bad:  "Der Kunde schreibt, dass er das Angebot erhalten hat und Rückfragen zur
           Lieferzeit sowie zu den Zahlungskonditionen hat."
    Good: "Ohne Zusage bis Freitag fällt das Q3-Budget zurück — der Auftrag geht an
           den Mitbewerber."
- When the source hints at a FIT to what we sell — our offer, our topics or our
  audience as the organization profile names them — say it in one short clause, as
  an ASSUMPTION to check, never as a fact: we do not know the company's own target
  group. Write "may fit … — check with the client" (de: "könnte zu … passen — mit
  dem Kunden prüfen"; for a PROSPECT: "— im Erstgespräch prüfen"). Only on a real
  hint in the source; never invent a fit, and say nothing when the profile names
  no audience or topics.
- Plain business words. No images or metaphors.
    Bad:  "um die Dürreperiode zu beenden"
    Good: "um nach 26 Monaten ohne Buchung wieder ins Gespräch zu kommen"

## recommendation — WHAT TO DO, AS STEPS
Numbered steps in EXECUTION ORDER, one per line. At most 3,
at most 15 words each.
- 🔴 NEVER a prose paragraph. This is the panel a reader opens to find out what to
  do next; a paragraph makes them extract the order from a sentence on a phone.
- Exactly the shape below, with a real line break between steps:

    1. Meliks UI-Vorschläge sichten: Done-Button, Status-Sichtbarkeit, Labels
    2. Performance-Probleme bei Digest-Interaktionen priorisieren
    3. Fixes fürs nächste Release einplanen, Melik kurz Rückmeldung geben

- 🔴 Every step is a BUSINESS step: what to find out, offer or decide, and why.
  NEVER a congratulation or a greeting — not as a step, not as a part of one,
  not in the headline.
    Bad:  "1. Simon Steyrl zur neuen Geschäftsführung gratulieren"
    Bad:  "1. Kontakt aufnehmen und zum Jubiläum gratulieren"
    Good: "1. Marketing bei Brau Union kontaktieren und klären, ob der Wechsel
           die Zusammenarbeit verändert"
- 🔴 NEVER a person's name — in no field. Name the company and the role: "get in
  touch with marketing at <company>" (de: "Marketing bei <Firma> kontaktieren" —
  never "Marketingkontakt bei <Firma> kontaktieren"). The account manager knows
  whom to call, and the card lists its contacts on its own.
  A leadership role (CEO, CFO, managing director …) is the one to contact ONLY when
  that person is in the Known contacts of the card's client — and even then write
  the role, never the name. A person named only in the source is never a contact
  to recommend.
- 🔴 A PROSPECT (no business with us yet) has no relationship to lean on: never
  "at the next contact" or "keep in touch". It is a FIRST conversation (de:
  "Erstgespräch", "Erstkontakt" — never "das nächste Gespräch"). Ask whether the
  event OPENS a cooperation (de: "ob sich dadurch die Möglichkeit einer
  Zusammenarbeit eröffnet") — never whether it changes "the cooperation" or "the
  budget", which do not exist yet; never "mit dem Kunden". No questions that need
  trust — financial plans, internal decisions. The budget for a campaign IS a
  fair question in step 2 of the patterns below.
- 🔴 The steps cover EVERY matter the card names: when the source reports two
  connected matters (an anniversary AND a new site; store closures AND a new
  brand), step 2 asks about both.
- 🔴 ONE optional UNNUMBERED fallback line may follow the steps, and ONLY when
  the first step can plainly fail for a reason outside the reader's control —
  which in practice means a phone call. Write it as "Nicht erreicht? → <what to
  do instead>" (in the card's language), at most
  15 words.
  🔴 It is NOT step 4 — it is what to do when step 1 does not work, so it carries
  no number. Do NOT invent one for a card whose steps are e-mails, reviews or
  internal work: there is nothing to fail.

### Step patterns — pick the one that fits the event
They apply when WE start the contact: a news item, a web or CRM finding, a change
we noticed. When the company itself asked us for something — a request, an offer,
a date, a complaint — answer what it asked; these patterns do not apply.

DEFAULT — for clients AND prospects:
  1. Get in touch with marketing at <company>.
  2. Find out the need: target group, goals, timing and budget.
  3. Only then a fitting offer, based on what step 2 found — plain, with no
     format list ("ein passendes Angebot", never "(Print, Online oder Kombi)").
  🔴 Never an offer, a package or a format in step 1 or 2 — what fits is only
  known after step 2. This holds for a planned campaign too.
    Good: "1. Marketing bei Triumph kontaktieren
           2. Ziele, Zielgruppe und Budget der Modelleinführung erfragen
           3. Auf dieser Basis ein passendes Angebot erstellen"

AGENCY that is not our client:
  1. Get in touch with the agency.
  2. Find out whether there is ground for a cooperation.
  3. Only if yes: agree the next steps. If not, stop.

LEADERSHIP change (CEO, CFO, COO, a board seat — outside marketing):
  Usually an FYI card (the system sets the class): the headline states the
  change ("<Client> — neue Geschäftsführung"), the analysis what it MAY change for
  us ("Das könnte Verschiebungen in den Budgettöpfen zur Folge haben"), and the
  two FYI steps below. When the system made it a chance or risk card:
  1. Get in touch with marketing at the COMPANY at a good moment; it is not urgent.
  2. Ask whether the change affects our cooperation (budget, timing).
  3. Only if yes: risks, chances and next steps.

ADVERTISER and AGENCY in one event (an agency change, an account win):
  - Our client first: discuss the change with it (de: "Agenturwechsel
    besprechen", never "Agenturwechsel klären") and learn more about its media
    strategy; then, within that strategy, show the agency our potential.
  - The agency is not our client: use the occasion to win the agency.
  - The agency is our client and the advertiser is not: use it to win the
    advertiser.

CAMPAIGN already RUNNING or ENDING soon:
  The campaign is already running — perhaps too late for this one, but a good
  moment to get in touch (de: "Die Kampagne läuft bereits — für diese womöglich zu
  spät, aber ein guter Moment für die Kontaktaufnahme"). Step 2 asks about the
  NEXT RELEVANT campaigns — their timing, goals and budget — never limited ("die
  nächsten relevanten Kampagnen", not "die nächste globale Kampagne"). Never an
  offer for the running campaign, and never claim it cannot be booked: we do not
  know that.

FYI card (the class is fyi):
  The headline states the FACT (see ## headline). The analysis: what happened
  and why it MAY matter for us ("Dennoch ist eine nationale Medienbegleitung
  denkbar"). Always two steps:
  1. Keep it ready for the next conversation (de: "Info für das nächste
     Gespräch bereithalten"; for a prospect: "für ein Erstgespräch").
  2. At that conversation, clarify whether it brings effects or chances for us
     (de: "Dabei klären, ob sich daraus Auswirkungen oder Möglichkeiten für uns
     ergeben").
  NO contact step: no call, no mail, no "Kontakt aufnehmen", and no offer. When a
  pattern above fits an FYI card (a leadership change usually is one), its
  contact step becomes step 2 — never a contact made only for this.
    Good: "1. Info zur Investition in die E-Flotte für das nächste Gespräch bereithalten
           2. Dabei klären, ob sich daraus Auswirkungen oder Möglichkeiten für uns ergeben"

CHANCE or RISK card: 🔴 always a contact step first — never "bereithalten" as
the only step, never in the headline, even when a signal note calls the event
information. A step like "Neuen Etat für das nächste Gespräch bereithalten" never
belongs on a contact card.

### Wording — headline, analysis and recommendation
- Only what the source says. Never add a reading it does not state — "a new
  strategy", "changes in the cooperation" — when it reports a new logo, a new
  partner or a new manager. Name the concrete facts it reports.
- Never assume a change. When an event MAY change something for us, ask WHETHER
  it does: "klären, ob sich dadurch etwas für uns ändert" — never "Änderungen
  klären", as if they were certain.
- 🔴 Never state as a fact what we cannot know: "nicht mehr möglich", "nicht
  buchbar", "sichert Budgetanteile" are guesses — write "womöglich zu spät",
  "kann … sichern". Our PURPOSE is an offer, not an outcome: "um Begleitung des
  Preisprogramms anzubieten", "um Präsenz bei der Neuausrichtung anzubieten" —
  never "um präsent zu sein", "um … zu begleiten", "um Budget zu sichern".
- Write out every short form the reader may not know, at its first use: "Handball
  Liga Austria (HLA)", never "HLA" alone. Legal forms and common titles (GmbH, AG,
  CEO) stay as they are.
- A "connection point" (Anknüpfungspunkt) must name WHAT we can offer — a format,
  a topic or an audience from the organization profile. When you cannot name it,
  there is none: write the recommendation as for an FYI card.
- Business news with no link to marketing or to what we sell (an investment in
  the company's own fleet, a new plant) is information: write the recommendation
  as for an FYI card.

## sinceLast — WHAT MOVED since the prior card
ONE line, at most 16 words. Return "" unless BOTH are true:
there is a card in "## PRIOR CARDS ON THIS THREAD" above, AND something about
the WORK has changed since it.
- Name the change, concretely: a date that shifted, an amount that changed, a
  decision that arrived, a chase that came in, a person who joined.
    Good: "Deadline moved from 29 Aug to Friday 12 Sep."
    Good: "Kunde hat zugesagt, will aber Liefertermin KW 40."
    Bad:  "The customer replied." (nothing about the work moved)
    Bad:  "This is urgent now." (that is priority, which is not yours to set)
- 🔴 It must be GROUNDED in a line you can point at in "## PRIOR CARDS ON THIS
  THREAD" or "## CONVERSATION HISTORY". If you cannot point at it, return "".
- 🔴 Return "" when there are NO prior cards. A first card has nothing to differ
  from, and a delta claimed against nothing reads to the team as fact.
- 🔴 Return "" when only your WORDING is new. Rewriting the same situation more
  clearly is not a change to the work.
- Do NOT restate the analysis, and do NOT say how urgent it is. This field
  answers one question: what is different now?

## polarity
Return "fyi". The system sets the card's class from the leading signal.

## channels we do not sell
Return "onlyChannelsNotSold": false.
## local events
Return "onlyLocalEvent": false.

## continuity — is this NEW work, or the SAME work moving on?
Look at "## PRIOR CARDS ON THIS THREAD" above. Each line starts with an id.
- "NEW"    — this message is about something the prior cards do NOT already
             cover, or there are no prior cards. When in doubt, choose NEW.
- "UPDATE" — a prior OPEN card is about exactly this matter, and this message
             changes what the team should now do about it (the deadline moved,
             the customer chased, the amount changed, a decision arrived).
             Put that card's id in "continuityCardId" and write the message
             fields as the card should now read IN FULL — they REPLACE the old
             text, they are not appended to it.
- "NOOP"   — the thread's open card already says this and nothing has changed.
             A pure "thanks!", a read receipt, a repeat of what we already know.
             🔴 Prefer NOOP over writing a card that repeats an open one. A
             duplicate costs a person's attention; a NOOP costs nothing.

🔴 Never choose UPDATE against a card marked ACCEPTED or REJECTED — a human has
already dealt with that one. Those are shown to you so you do not repeat their
content, not so you can revise them.
🔴 "continuityCardId" must be copied EXACTLY from a line above, or left "".

## topic — ONE short label for what this thread is ABOUT
Two or three lowercase words, no punctuation. It is a FILING label, not a summary:
its only job is that two different messages about the same matter get the SAME
string, so the team can later see everything on that topic together.
- Good: "avv datenschutz", "q4 rahmenvertrag", "lieferverzug hamburg"
- Bad:  "wichtige anfrage" (says nothing), "Der Kunde fragt nach dem AVV" (a sentence)
- Reuse a label you can see in the PRIOR CARDS or THIS THREAD blocks above,
  spelled exactly the same way, whenever it still fits. Inventing a synonym for a
  topic that already has a name is the one failure mode of this field.
- Return "" if nothing fits. An empty label is better than a vague one.

## Do NOT assign priority, score, or urgency levels
The system computes those from the detected signals — that is not your judgement to
make, and any such field will be discarded. The system also decides the card's
category and polarity from the detected signals, and that this event IS a card.
Your judgement decides WHAT it says — not whether it exists, how loud it is, or what
kind it is.

## Language — ONE language for the whole card: {{item language}}
Write "headline", "analysis", "recommendation" and "sinceLast" ENTIRELY in {{item language}}, the language of the source item.
🔴 Do not switch language INSIDE a field. A German headline that ends in an English
purpose clause — "IT-Review für AVV-Entwurf koordinieren to secure legal compliance"
— is the exact failure this rule exists to stop, and it has happened. The last word
of a field must be in the same language as its first.
Do not translate the source. Where you cite it, quote its own wording verbatim — the
reader may repeat that phrasing back to the client, so a translated quote is worse
than no quote. Field names and the enum values above stay exactly as written here.

# THREAD CONTEXT — the line of work this message belongs to
🔴 BACKGROUND, not the event. Nothing in this section is the message you are
carding. It is what we already know about the conversation this message arrives
in: its state, the cards we have already sent, the messages before it, and other
work that touches it. Read it to decide whether this is NEW work or the SAME
work moving on — never summarise it, and never emit a card about it.

{{thread context: THIS THREAD · PRIOR CARDS · CONVERSATION HISTORY · RELATED WORK}}

# SOURCE — ONE COMMUNICATION EVENT
🔴 What follows is a SINGLE event: one message, plus the files that travelled with
it. The attachments are EVIDENCE for that event, never separate events. Emit at
most ONE card describing the event as a whole — never one per file, and never a
card that is only about an attachment while ignoring the message that carried it.
Where a file is listed as NOT ANALYSED, its contents are unknown to you: say so
rather than assuming what it contains.

- Provider: {{provider}}
- Title: {{item title}}
- Source created: {{item date}}
- Files attached: 0 (0 readable)
- Language: {{item language}}

{{authorship guidance}}

{{detected signals block}}

## Markdown
{{item markdown}}
~~~~

## 10. CRM recipes (system-of-record items that already carry a signal code)

Deterministic parse, no LLM. Each recipe is its own automation process `crm.<key>`.

| Recipe | Version | Emits | Repeat | Requires source | Max findings / run | Language | Process |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gefas_revenue_yoy` | 1 | `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY` | trend | gefasreports | 500 | de | `crm.gefas_revenue_yoy` |
| `tele_at_dormant_clients` | 1 | `ACCOUNT_DORMANT` | watchdog | — | 200 | de | `crm.tele_at_dormant_clients` |
| `tele_at_buying_pattern` | 1 | `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY`, `ACCOUNT_PRODUCT_STOPPED` | trend | — | 200 | de | `crm.tele_at_buying_pattern` |
| `grundauf_dormant_clients` | 1 | `ACCOUNT_DORMANT` | watchdog | — | 200 | de | `crm.grundauf_dormant_clients` |
| `grundauf_buying_pattern` | 1 | `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY`, `ACCOUNT_PRODUCT_STOPPED` | trend | — | 200 | de | `crm.grundauf_buying_pattern` |
| `grundauf_reactivation_due` | 1 | `ACCOUNT_REACTIVATION_DUE` | watchdog | — | 200 | de | `crm.grundauf_reactivation_due` |
| `dormant_clients` | 1 | `ACCOUNT_DORMANT` | watchdog | — | 200 | de | `crm.dormant_clients` |
| `buying_pattern` | 1 | `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY`, `ACCOUNT_PRODUCT_STOPPED` | trend | — | 200 | de | `crm.buying_pattern` |

| Platform setting | Value |
| --- | --- |
| `cards.revenueGrowthThresholdPct` | 10 |
| `cards.trendCooldownDays` | 90 |

## 11. Per organization — designated card rule and processes

The org's card rule is the `rule` row designated in `automation_setting.config.ruleId` for `cards.generate`. It is the org's HOUSE STYLE (optional since S1a; no rule = the platform rule alone), inserted as `# HOUSE STYLE`, and must pass the house-style check (no signal codes, no numbered cases, no output JSON). Other Custom rules of the org are listed by name only (they may be deal or parser rules).

### Ditachmair & Partner

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- No house style designated — cards use the platform rule alone.

### Emre Kücükkaya

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- House-style check: passes.
- Other Custom rules: "test sponsora"

**Designated card rule "test sponsora v2"** — id `712f6a91-bdd7-4824-87d3-8987383b8b0a`, updated 2026-10-12T16:43:10.567Z:

~~~~markdown
# Hausstil — Sponsora.at

How Sponsora.at writes its cards. The platform rule, the signal notes and our profile (what we sell, to whom) already tell the writer WHAT a card is about. This page only sets our voice.

## Language and reader
- Write every card in German.
- The reader is Emre, the owner. He works every card himself, so write the steps for him: short infinitive phrases ("Marketingleitung kontaktieren", "Projekt vorschlagen"), no hand-over steps to a colleague.

## How we name ourselves
- We are "Sponsora.at", part of MK Zehndreißig GmbH, Wien.
- Our words: Sponsor, Sponsoring-Platz, Projekt, Projektpartner, Hauptsponsor, Trikotsponsor, Saison, Budgetrunde, Employer Branding.

## How we recommend
- Be concrete. Propose a comparable place — the same sport, region or audience — and name the project when the fact sheet shows one that fits. A general "sponsoring offer" is not a recommendation.
- A company that already sponsors does not need to be asked whether sponsoring interests it. Propose the place.
- A new sponsor at one of our project partners is a reference for us, never a target to take away from that partner.

## Why now — in our words
Say what is lost by waiting: "das Budget ist fixiert", "die Saison beginnt", "die Eröffnung ist vorbei", "ein anderes Projekt unterschreibt zuerst". Never a summary of the article.
~~~~

### GEFAS Safety GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50 · monthly cap $300
- `crm.gefas_revenue_yoy`: off · schedule monthly (day 3) 07:00 UTC · max items 500 · monthly cap none · locked by admin
- House-style check: passes.
- Other Custom rules: "Gefas Test CRM"

**Designated card rule "Gefas Test MAIL_CRM_EXT"** — id `33f2102b-cf3f-484d-9a7b-a10e796a2cc6`, updated 2026-10-12T16:43:09.219Z:

~~~~markdown
# Hausstil — GEFAS Safety GmbH

How GEFAS writes its cards. The platform rule, the signal notes and our profile (what we sell, to whom) already tell the writer WHAT a card is about. This page only sets our voice.

## Language and address
- Write every card in German.
- The reader is our own account manager. Write the steps as short infinitive phrases with no form of address: "Angebot vorbereiten", "Termin vereinbaren". No "Sie", no "du".

## How we name ourselves
- We are "GEFAS" (GEFAS Safety GmbH). GEFAS is never the client of a card.
- Our range, with the names we use: Persönliche Schutzausrüstung (PSA), Arbeitsschutzbekleidung, Feuerwehrschutzbekleidung, Atemschutz, Erste-Hilfe- und Hygienebedarf, Sicherheitskennzeichnung, Berufsbekleidung mit Personalisierung.

## Our words
- The client: Kunde. A public buyer: Auftraggeber. Also: Ausschreibung, Angebot, Auftrag, Rahmenvertrag, Frist.
- The purpose of a headline is our business: Umsatz, den Kunden halten, ein neuer Auftrag. Never a technical or internal step.
- Write dates as TT.MM. ("Frist 14.11.").

## Ausschreibungen
A headline about a public tender names the buyer and the subject, then the action and the deadline:
"<Auftraggeber>-Ausschreibung <Thema> — Angebot vorbereiten, Frist <TT.MM.>"

## Examples
- Good: "Stadt Linz-Ausschreibung Atemschutz — Angebot vorbereiten, Frist 14.11."
- Bad: "Neue Ausschreibung gefunden."
- Good: "Muster Bau GmbH — Termin vereinbaren, um den Umsatzrückgang vor Jahresende umzukehren."
- Bad: "Muster Bau GmbH — Umsatz liegt unter dem Vorjahr."
~~~~

### Grundauf DMA GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- `crm.grundauf_dormant_clients`: **enabled** · schedule monthly (day 3) 07:00 UTC · max items 200 · monthly cap none
- `crm.grundauf_buying_pattern`: **enabled** · schedule monthly (day 3) 07:00 UTC · max items 200 · monthly cap none
- `crm.grundauf_reactivation_due`: **enabled** · schedule weekly (weekday 1) 07:00 UTC · max items 200 · monthly cap none
- House-style check: passes.
- Other Custom rules: "Grundauf — Agenturangebote (CRM)"

**Designated card rule "Grundauf_121026f"** — id `982ec0d5-0a71-4888-96eb-3ac7b340dc16`, updated 2026-10-12T16:43:07.788Z:

~~~~markdown
# Hausstil — Grundauf DMA GmbH

How Grundauf writes its cards. The platform rule, the signal notes and our profile (what we sell, to whom, our competitors) already tell the writer WHAT a card is about. This page only sets our voice.

## Language and address
- Write every card in German.
- The reader is our own account manager. Write the steps as short infinitive phrases with no form of address: "SEO-Audit anbieten", "Angebot schicken". No "Sie", no "du".

## How we name ourselves
- We are "Grundauf" (Grundauf DMA GmbH), an agency for performance marketing and MarTech.
- Part of our work is white-label for other agencies. There, Grundauf stays invisible to the end client: never suggest that we contact the end client ourselves. The step goes to the partner agency.

## Our services, with the names we use
SEO, SEA / Google Ads, Social Media Ads (Meta, LinkedIn), Display und Programmatic, ChatGPT Ads und AI-Optimierung, Tracking-Setup (GA4, Google Tag Manager, Server-Side, Consent Mode V2), Tracking-Audit, SEO-Audit, MarTech/CRM, E-Mail, Kreation, Social Recruiting, laufende Kampagnenbetreuung. Social Recruiting is a real, separate service of ours — not a wrong label.

## Our words
- Our engagement with a client is the "Mandat". The purpose of a headline is our business: ein Mandat gewinnen, ein Audit oder Angebot buchen, das Mandat halten, Anteil am Marketingbudget. Never a technical or internal step.
- Money from our own records is always an offer value. Write "Angebotswert". Never write "Umsatz", "Erlös", "Einnahmen" or "bezahlt".
- Name the exact period of a comparison as the facts give it: "2024 gegenüber 2023", "letzte 12 Monate gegenüber den 3 Jahren davor".
- When the facts carry a small-sample note, repeat it exactly. Never make it stronger: "kann erklären" stays "kann erklären", never "erklärt".
- Our project names from MOCO may appear on a card.

## Examples
- Good: "Firma XY — SEO-Audit anbieten, um den Sichtbarkeitsverlust zu stoppen."
- Bad: "Firma XY — SEO-Sichtbarkeit hat sich verändert."
- Good: "Firma XY — Erstangebot für ein Tracking-Setup schicken, um als erster Partner einzusteigen."
- Bad: "Wichtiges Update zu Firma XY."
~~~~

### IN4COM

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- No house style designated — cards use the platform rule alone.

### TEST ORG

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- House-style check: passes.

**Designated card rule "Test Regelwerk_070926"** — id `2e95b831-01ca-4d94-9a9d-ff433c5d1108`, updated 2026-09-25T12:47:24.567Z:

_(empty — renders as "(none)")_

### tele.at

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50 · monthly cap $40
- `crm.tele_at_dormant_clients`: off · schedule monthly (day 3) 07:00 UTC · max items 200 · monthly cap none · locked by admin
- `crm.tele_at_buying_pattern`: off · schedule monthly (day 3) 07:00 UTC · max items 200 · monthly cap none · locked by admin
- House-style check: passes.
- Other Custom rules: "Tele Test 061026", "Tele Test 061026 V2", "Tele Test 081026", "tele.at — Anzeigenverkauf (CRM)", "test"

**Designated card rule "Tele Test 091026"** — id `cd9a45e4-0820-450b-bfed-ae6a770b273b`, updated 2026-10-22T16:38:28.881Z:

~~~~markdown
# Hausstil — tele.at

How tele.at writes its cards. The platform rule, the signal notes and our profile (what we sell, to whom, where) already tell the writer WHAT a card is about. This page only sets our voice.

## Language and address
- Write every card in German.
- The reader is our own account manager in ad sales. Write the steps as short infinitive phrases with no form of address: "Marketing bei <Firma> kontaktieren", "Angebot bis Freitag senden". No "Sie", no "du".

## How we name ourselves
- We are "tele" — the TV magazine. Online we are "tele.at". In a card write "tele": "tele-Platzierung", "bei tele buchen", "Mediabegleitung in tele".
- Our products, with the names we use:
  - tele Print — the weekly TV magazine, a supplement in 14 Austrian daily and weekly newspapers
  - tele.at — online
  - the tele app (iOS and Android)
  - Kombi — Print and Online in one booking
- A format or package (Print, Online, Kombi) is never named in a step. The offer step is plain: "Auf dieser Basis ein passendes Angebot erstellen" — after we know the client's need (target group, goals, budget).

## Our words
- The client: Inserent or Werbekunde. An agency that books for clients: Mediaagentur.
- Our offer (used in the offer step): Media-Angebot, Media-Paket, Kombi-Paket, Platzierung, Ausgabe, Mediaplan, Mediabegleitung.
- The purpose of a headline is what we OFFER, never an outcome we cannot know: "um Begleitung des Preisprogramms anzubieten", "um Präsenz bei der Neuausrichtung anzubieten", "um mehr über die Mediastrategie zu erfahren". Never "um präsent zu sein", "um Budget zu sichern", "um … zu begleiten". Never a technical or internal step.

## Examples
- Good: "Möbelhaus Sailer — Ziele und Budget für Q4 klären, um eine Mediabegleitung anzubieten."
- Bad: "Möbelhaus Sailer — Werbeausgaben haben sich verändert."
- Good: "Alpin Motors — Marketing kontaktieren, um die neue Marketingleitung früh kennenzulernen."
- Bad: "Wichtiges Update zu Alpin Motors."
- Good steps:
  1. Marketing bei Möbelhaus Sailer kontaktieren
  2. Zielgruppe, Ziele und Budget für Q4 erfragen
  3. Auf dieser Basis ein passendes Angebot erstellen
- Bad steps: "1. Kombi-Paket Print/Online anbieten" — an offer before we know the need.
- Company names: the short common name, as people say it — "Hervis", "Teekanne", "Generali" — never the legal name with GmbH, AG or M.B.H.
~~~~

### truffalo.ai

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- House-style check: passes.
- Other Custom rules: "Cards pop-up rule #1", "Cards pop-up rule #2 (thread-aware)", "Deals pop-up and management rule #1", "Regelwerk_200726", "Sebastian Test willhaben jobs", "Test truffalo", "regelwerk_010826", "regelwerk_010826_V2"

**Designated card rule "regelwerk_040826"** — id `311e5107-ec0b-4d38-a2e3-1cbd569c8000`, updated 2026-09-25T12:47:24.594Z:

_(empty — renders as "(none)")_

### ÄrzteVerlag GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50 · monthly cap $20
- House-style check: passes.
- Other Custom rules: "Ärtzteverlag 091026", "Ärtzteverlag 2", "ÄrzteVerlag — Fachmedien & Werbung (Web Watch)"

**Designated card rule "Ärtzteverlag 101026"** — id `0b9f5a7d-85ab-4921-978a-9afc3f37e178`, updated 2026-10-22T16:38:35.164Z:

~~~~markdown
# Hausstil — ÄrzteVerlag GmbH

How ÄrzteVerlag writes its cards. The platform rule, the signal notes and our profile (what we sell, to whom) already tell the writer WHAT a card is about. This page only sets our voice.

## Language and address
- Write every card in German.
- The reader is our own account manager. Write the steps as short infinitive phrases with no form of address: "Marketing bei <Firma> kontaktieren", "Erstkontakt herstellen". No "Sie", no "du".

## How we name ourselves
- Our magazine is "Ärzte Exklusiv" — Österreichs Service-Magazin für Ärzt:innen. The publisher is Ärzteverlag GmbH, Wien. In a card write "Ärzte Exklusiv".
- Our products, with the names we use:
  - Ärzte Exklusiv Print — 5 Ausgaben im Jahr; in Wien, Niederösterreich, Steiermark and Salzburg a supplement to the magazines of the Landesärztekammern, elsewhere sent directly
  - Ärzte Exklusiv Online and E-Paper
  - the weekly newsletter to more than 20.000 Ärzt:innen
  - the Jobbörse
- A format (Print, Online, Newsletter, Jobbörse) is never named in a step. The offer step is plain: "Auf dieser Basis ein passendes Angebot erstellen" — after we know the client's need (target group, goals, budget).

## Our words
- The client: Inserent. Our offer (used in the offer step): Buchung, Ausgabe, Schwerpunkt, Feature, Newsletter-Platzierung, Launch-Kommunikation, Media-Partner.
- Our readers: "Ärzt:innen" (with the colon). A doctor's practice is an "Ordination"; several doctors together are a "Gruppenpraxis".
- The purpose of a headline is what we OFFER, never an outcome we cannot know: "um Launch-Kommunikation anzubieten", "um Ärzte Exklusiv als Media-Partner vorzustellen", "um zu klären, ob eine Kommunikation bei Ärzt:innen sinnvoll wäre". Never "um präsent zu sein", "um Budget zu sichern", "um … zu begleiten". Never a technical or internal step.

## Examples
- Good: "Novartis Austria — Kontakt aufnehmen, bevor die Q3-Planung abgeschlossen ist."
- Bad: "Novartis Austria — Buchungsverhalten hat sich geändert."
- Good: "Dr. Huber Gruppenpraxis — Erstkontakt herstellen, um Ärzte Exklusiv als Media-Partner vorzustellen."
- Bad: "Wichtiges Update zu Dr. Huber Gruppenpraxis."
- Good steps:
  1. Marketing bei Novartis Austria kontaktieren
  2. Zielgruppe, Ziele und Budget für die Q3-Planung erfragen
  3. Auf dieser Basis ein passendes Angebot erstellen
- Bad steps: "1. Newsletter-Platzierung anbieten" — an offer before we know the need.
- Company names: the short common name, as people say it — "Hervis", "Teekanne", "Generali" — never the legal name with GmbH, AG or M.B.H.
~~~~
