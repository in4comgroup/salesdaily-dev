# Topics — questions to resolve 

## A. Scope and business

### Q1. Which tenant and vertical go first? — ✅ answered: IN4COM (see Decisions)

The Maslov catalog is for a PR / marketing **agency** (pitch, tender, brief). The repo also serves a **wine / spirits distributor** (orders, catalog, client types). The signal packs differ a lot.

- a) Agency first (Maslov catalog is ready and detailed).  
- b) Distributor first (needs a new pack and a workshop).  
- c) Both at once.

**Rec. a)** — pilot on the agency with `base` \+ `agency` packs. Start the distribution-pack workshop in parallel; it ships in a later phase. Confirm which org ids are the pilots.

### Q2. Which taxonomy version is the seed? — ✅ answered: v204 \+ Maslov additions

Maslov builds on Truffalo **v195**; the export in this folder is **v204** (newer: e.g. `SALES_BOOKING_RECEIVED` replaces `SALES_ORDER_CONFIRM`, retired codes listed).

- a) v204 base \+ Maslov additions (reconcile the diff).  
- b) v195 exactly as in the Maslov doc.

**Rec. a)**, with a diff table reviewed by the Maslov side. Our taxonomy then starts its own version line (RU v1).

### Q3. Who may edit signals? — ✅ answered: platform admin only; registry tab \+ Markdown export

- a) Platform admin only (Settings → Сигналы); org owner switches packs / codes on or off.  
- b) Org owner also edits weights, profiles, recipients.

**Rec. a)** for MVP. Weight edits by owners make evaluation and support hard.

### Q7. Is the topic definition right? — ✅ answered: one point of business communication with a client or vendor, from 3 origins

Spec §2.1: *one business question about one counterparty that needs, or may need, action from us*; merge rules from Maslov §5.5; examples table. Two edge cases need a business answer:

- A general market event about a client (e.g. new head of marketing) — its own topic, or attached to an open topic of that client? **Rec.:** its own topic (family `market`), unless the matcher links it to an open pitch.  
- One supplier delivery delay that blocks three client orders — one topic or four? **Rec.:** one supplier topic \+ `topic_event` notes on the affected client topics (no automatic fan-out in MVP).

### Q8. Do the old card features stay? — ✅ answered: scrap them once topics are implemented

Today: Custom-rule card generation (incl. the «Cards pop-up rule — Telegram orders» → `new_order` → order-from-request flow) and name-based deal discovery.

- a) Keep both for orgs with topics `off`; topics replace them for orgs with topics `on`.  
- b) Remove them when topics ship.

**Rec. a).** The `new_order` flow becomes the code `ORDER_REQUESTED` in the distribution pack; its card keeps the «Создать заказ» button.

### Q12. How much may the system do with deals on its own? — ✅ answered: auto-create on high probability (see Q27)

Maslov: stage 1 needs an internal **go**; risks never move stages; amounts never go to the forecast automatically.

- a) Proposals only: every create / move is a card the user confirms.  
- b) Create needs go (card); forward moves on an existing deal are automatic and journaled (agent badge, user can revert).  
- c) Fully automatic.

**Rec. b).** It matches Maslov and today's «перевёл агент» UX.

### Q21. How do Maslov stages map to the org funnel? — ✅ answered: per-org funnel taxonomy \+ per-org signal rules

Maslov: 0 Контакт до запроса → 1 Новая возможность → 2 Запрошены материалы → 3 Финальный выбор → 4 Выбраны → 5 Заказ подтверждён (+ lost / cancelled / paused). Our funnel: 7 system stages (Qualification … Closed / Rejected) \+ per-org stages; «Контакт до запроса» already exists as the pre-pipeline stage.

**Rec.:** for the agency org, configure its funnel with Maslov's stages (the «Настройки стадий» dialog already allows names and hiding), then map codes → stage ids in per-org stage rules. Confirm: is "paused" a stage or a deal status? (**Rec.:** a new deal status `paused`, not a stage.)

### Q23. What does success look like? — ✅ answered: accepted as proposed

No KPIs exist in any source. Proposed acceptance targets for go-live per org (spec §12):

- signal precision ≥ 0.85 on P6 / P8 codes, recall ≥ 0.7;  
- topic grouping pairwise precision ≥ 0.9, recall ≥ 0.8;  
- card acceptance ≥ 40 % in the pilot month, \< 15 % of rejects with reason "duplicate";  
- cost ≤ agreed budget (Q18).

**Rec.:** agree these numbers (or others) with the pilot tenant before phase 2\.

### Q24. Gaps in the Maslov catalog that need the owner's answer — not blocking (agency pack only)

Found while reading `Сигналы_Маслов_каталог_и_правила.docx`. Section names are the doc's own headings.

| \# | Gap | Where in the Maslov doc | Answer |
| :---- | :---- | :---- | ----- |
| 1 | `PROSPECT_NEED_EXPRESSED`: weight 7 and profile N7, but N7 says "general interest \= 3", while §2.2 says general interest stays in area 0 and is NOT this code. Is general interest this code at 3, or `PROSPECT_CONTENT_INTEREST`? | §1 table N2 «Контакт до запроса»; §2.2 item 8; §5.1 row N7; §5.4 | `PROSPECT_CONTENT_INTEREST` — substantive interest in a topic or material without a specific need of the contact’s own: **weight 3, W1**. `PROSPECT_NEED_EXPRESSED` — the client describes a relevant task, problem, or initiative of their own: **weight 7, P6**, routed to new biz. The **N7 profile has been removed**. A concrete project creates an opportunity. If the task is not yet sufficiently defined, the need is clarified within area 0\. No internal approval is required to create the opportunity.  |
| 2 | `PROSPECT_CONTACT_MOVED` is an opportunity (5, D4, «Связь») but is also a risk signal for «Потеря ключевого контакта». One code, two polarities, no rule. | §2.2 item 3 vs §4 «Риски сделки», risk 4 | `PROSPECT_CONTACT_MOVED` remains an **opportunity signal with weight 5 and D4**: it provides a reason to develop the relationship in the contact’s new company or role. For the previous company, `CONTACT_LEAVING` and `ACCOUNT_SPONSOR_SUPPORT_LOST` are evaluated separately. The key-contact-loss warning applies when the person supported a specific deal and a relationship handover and working access to the relevant stakeholder have not yet been secured. The move alone does not trigger the warning.  |
| 3 | Risk 19 «Затягивание решения» needs repeated postponement («неоднократно переносит»), but maps to `PITCH_DECISION_DELAYED_BY_CLIENT`, a single-event code. How many postponements make the risk? | §4 risk 19 vs §2.1 item 16 | The warning is triggered **from the second distinct postponement of the same decision within the current selection cycle**, if a new date and a specific next step have not been agreed afterward. Each postponement is recorded separately as `PITCH_DECISION_DELAYED_BY_CLIENT`, D4. Repeated references to an existing postponement and postponements of unrelated meetings do not increase the counter. Agreeing on a date and next step clears the warning while preserving the history.  |
| 4 | Expiry for scores 1–3 (W1) is not defined; `cards.expiryDays` covers only 4+. | §5.2 parameters table, row `cards.expiryDays` | **10 business days from the deadline, or from creation if no deadline exists**, but the card cannot expire before its first weekly display. After expiry, it remains in the weekly list for another **7 calendar days**, then remains available in history. Card expiry does not resolve the underlying business risk.  |
| 5 | P6 repeats "until the issue closes, with a repeat cap" — the cap is not given. | §5.1 profiles table, row P6 | Initial display plus **no more than three evening reminders per cycle**. For Telegram, an additional limit of **two deliveries of the same card within a rolling seven-day period, including the initial delivery**. A material new fact or a newly agreed deadline may start another cycle; an unchanged background check cannot. An approaching deadline overrides the daily limit on distinct cards, but does not override duplicate-reminder protection for the same card. Ending the reminder cycle does not mean the issue has been resolved.  |
| 6 | "Trends are capped at the daily digest", but no list says which codes are trends. | §5.1 scoring rules; notes after the §1 tables |  **Group** **Codes** Communication trends `SIGNAL_CONTACT_QUIET` Revenue trends `ACCOUNT_REVENUE_STAGNATION`, `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY` Additional-work trends `ACCOUNT_INCREMENTAL_WORK_SLOWDOWN` Client-spending trends `SIGNAL_SPEND_UP`, `SIGNAL_SPEND_DOWN` These signals have a **D4 delivery ceiling**, even when attributes increase their score. Calculated trends require an observation window, comparison baseline, minimum data volume, and change threshold. `ACCOUNT_DORMANT`, `*_NO_RESPONSE`, and overdue states are not automatically classified as trends. Inclusion in this list does not activate deferred codes; block H codes are currently excluded from processing.  |
| 7 | Senior team gets only "critical" go / no-go questions (material budget or resources) — no threshold. | §5.3 recipients («Старшая команда») | All references to go/no-go and the senior team must be removed, including opportunity-creation requirements, stage transitions, renewals, re-pitches, and card routing. Opportunity creation and stage assignment depend on confirmed client events and a sufficiently specific task. The agency’s withdrawal remains a separate internal outcome  |
| 8 | Block J (team) is «Закрыт допуском» (gated); the gate condition is not explained. | §1 legend and table J | **all six codes in block J, “Team,” are deferred**. They remain in the catalogue but do not trigger automated processing, cards, notifications, or updates. Additionally, as requested, **all 40 codes in block H, “Company and Market Events,” are deferred**. Their references in risk definitions do not trigger warnings either.  |
| 9 | The forecast needs an «экспертная вероятность» — no owner, no scale. | §3.4 «Прогноз» | The system uses the opportunity owner’s estimate The estimate’s author, date, and rationale are recorded. Without an estimate, the opportunity is marked “not assessed”: its amount remains in the unweighted pipeline but is excluded from the weighted forecast. Signal weight and stage number do not replace the owner’s estimate. |
| 10 | Renewal-as-opportunity \= stage 4 only «при достаточной конкретности решения» — "concrete enough" is not defined. | §3.3   | For the specific renewal opportunity: The contract or service being continued must be identifiable. The next period or scope must be defined. The client must explicitly confirm its selection of the agency. “We are renewing your service for next year; we are preparing the paperwork” qualifies for stage 4\. “We hope to continue working together” does not.  |
| 11 | "All events are confirmed", but several codes are absence or time based (`*_NO_RESPONSE`, `ACCOUNT_DORMANT`, `PITCH_FEEDBACK_MISSING`). How does "confirmed" apply to them? | Intro vs §1 tables A / K, §2.4 item 15 | A no-response signal requires an originating request, an elapsed response deadline, checked channels, and no qualifying response. For an offer without an agreed response date, the default window is **seven calendar days**. `ACCOUNT_DORMANT` requires a configured no-purchase threshold reflecting the client’s usual buying cadence. `PITCH_FEEDBACK_MISSING` requires an agreed feedback deadline or direct confirmation that substantive feedback is absent. Insufficient data must not produce a definitive warning.  |
| 12 | "Up to 3 codes per source message" — which 3 are kept when more apply (merges need several)? | §5.1 scoring rules | **The storage limit has been removed:** all distinct confirmed events are retained, with semantic duplicates removed. Only the card’s compact summary is limited to three events. Priority is: critical risks and urgent actions → client decisions and commitments → changes to terms → remaining context. Additional events are available by expanding the card; closing events S0/S1 are processed regardless of their position in the summary. Events are merged **only when they concern the same business issue**. Independent issues within one email may create separate cards.  |
| 13 | Five source documents the catalog cites are not in this folder (funnel structure, account pulse, client scenarios, pitch funnel, owner interview). | «Основания каталога» (last section) | These references are for our internal analysis and traceability: they identify the materials used to develop the catalog. They are not system dependencies and do not need to be present in this folder or loaded by the system. The current catalog consolidates the agreed rules and is the authoritative specification for implementation. |

---

## B. Technology

### Q4. Separate signal step, or inside the parse call? — ✅ answered: separate step

- a) Separate AI task `signals` after parse (one more LLM call per item).  
- b) Inside every parser call (Truffalo way; one call).

**Rec. a)** for MVP: one prompt for all providers, re-runnable without re-parse, safer with one Yandex model. Revisit after the golden set shows stable quality.

### Q5. Can the Yandex model carry this prompt? — ✅ answered: test it; other Yandex models later if needed

Today only one model (`yandex-text`) is enabled, with no fallback. The extraction prompt holds \~40–100 active codes with definitions, boundaries and cues (estimated 8–15k tokens) \+ the item (up to \~15k tokens).

- Which exact model (YandexGPT 5 Pro / Lite, other) and context size?  
- May we enable a second model for this task only (legal / 152-ФЗ constraints)?

**Rec.:** a 2-day spike in phase 0: run 50 golden items through `yandex-text` with the full prompt and with a two-pass (block → codes) prompt; measure quality, latency and token use. Decide from data.

### Q6. Prompt language and the salutation attribute — ✅ answered: Russian

- Prompts in Russian or English? **Rec.:** Russian (taxonomy text is Russian anyway), A/B on the golden set in phase 2\.  
- The «Вы / ты» attribute: **Rec.:** off; Russian business mail almost always uses «Вы».

### Q9. Items with no signal: attach as context? — ✅ answered: as recommended

**Rec.:** yes, only when they share a `thread_key` or a reference with an open topic (gives a full timeline); never create a topic from them.

### Q10. Should a strong signal override the junk filter? — ✅ answered: as recommended

Truffalo keeps junk-classified items that carry an active code. We skip junk before the signal step, so we cannot know. **Rec.:** MVP skips junk. Log the junk categories per org; revisit if pilots report missed items.

### Q11. How to window chats (Telegram, WhatsApp)? — ✅ answered: as recommended; Telegram files \= separate task

Today a whole Telegram DM is one "thread"; WhatsApp groups by time gap. **Rec.:** the same window rule for both (\>1 h gap or \>100 messages). Confirm whether a Telegram **group** chat (phase 3 of the Telegram source) is in scope.

### Q14. Which user is the "actor" for automatic writes? — ✅ answered: as recommended

`deal.user_id` and similar columns are NOT NULL; cron has no session.

- a) A per-org system user («Агент Truffalo»), hidden from member lists.  
- b) The client's responsible user.

**Rec. a)**; the UI already shows «агент» badges.

### Q19. Personal data (152-ФЗ) — ✅ answered: as recommended

Evidence quotes, subjects and facts are personal data.

- Same retention / deletion as source items? **Rec.:** yes; teardown and reparse clean them.  
- Is a per-person processing restriction (like GDPR Art. 18 in Truffalo) needed? **Rec.:** not in MVP; confirm with legal.

---

## C. Delivery and people

### Q13. Who receives what? — ✅ answered: roles later (list from business); MVP shows all to all

Maslov routes by role: «Связь», «Питч», «Аккаунт», «Финансы», «New biz», «Команда». We have org roles (owner / admin / member), `client.responsible_user_id`, `deal.user_id`, `user.department`. **Rec.:** add a functional role per member (`sales`, `account`, `finance`, `new_biz`, `management`), editable by the owner on the «Участники» tab. Mapping in spec §8.3. Confirm the role list with the pilot.

### Q15. Which delivery channels, and when? — ✅ answered: as suggested

- MVP: in-app lists only («Сейчас» / «Сводка» / «Неделя»).  
- Next: daily email digest; then Telegram to staff (needs a staff-bot binding flow; today the Telegram bot only ingests client DMs).

**Rec.:** in-app first; email digest second; Telegram third. Confirm.

### Q16. How much history to process at start? — ✅ answered: 7 days

Cost and noise grow with history. Truffalo uses a 14-day cold start. **Rec.:** last 30 days for the pilot org (gives open topics with context); older items stay unprocessed unless a user opens them.

### Q17. Who builds the golden set? — ✅ answered: IN4COM business users; synthetic messages allowed

Need 200 real Russian items per vertical, annotated with codes, subjects and topic groups. **Rec.:** we pre-annotate with the LLM; 1–2 people from the pilot tenant correct it (≈ 2 days of their time). Confirm the people and that their data may be used for this.

### Q18. What is the LLM budget? — ✅ answered: 500 ₽ (5 USD) per org per day

No token tracking exists today. **Rec.:** add `llm_usage` in phase 0; set a monthly cap per org after the phase-0 spike gives cost per item.

### Q20. Where do we test with real data? — ✅ answered: dedicated environments; test when ready

~~Production is still Vercel \+ Neon~~ — corrected: production, dev and test are dedicated environments with their own PostgreSQL. Testing starts when the feature is ready and test data exists.

### Q22. Watchdogs (absence signals) — when? — ✅ answered: as recommended

`SALES_OFFER_NO_RESPONSE`, reply window 7 days, offer countdown 10/5/1, contract expiry. They need a scheduler and reliable "we sent / they replied" detection. **Rec.:** phase 8, after the core is stable. Confirm that the pilot accepts this. For IN4COM the order-based recipes (dormant client by order rhythm, product stopped) are probably worth more than the mail watchdogs — see Q26.

---

## D. New questions after the 2026-11-10 decisions

### Q25. IN4COM signal pack — who confirms it? — ✅ answered: the Q17 business users review the draft

The draft in [04-distribution-pack-draft.md](http://04-distribution-pack-draft.md) is our proposal (≈ 25 new codes \+ base codes to switch on), written from domain knowledge only. Signals are the input to everything (which messages become topics, which list, when a deal is created), so IN4COM users confirm: which situations matter, how important each is, what does NOT count, and the Russian phrases they really see. No separate workshop is needed; a review of the draft by the same users who do the tests (Q17) is enough.

### Q26. What is a "deal" for IN4COM, and what is an "order"? — ✅ answered: deals only in step one

Decision: deal \= a general agreement / contract with the client; order \= purchase of a specific product or service. The first step covers deals only; the order link comes later.

Original question: IN4COM already has orders (draft → sent → confirmed → finalized) and a deal funnel. A routine repeat order must NOT create a deal. Candidates for a deal: a new venue / new client listing, a chain listing or tender, a new wine-card placement, a renewal of an annual agreement. **Rec.:** deal \= a new or expanded *relationship* opportunity (listing, new client, tender, annual agreement); order \= a single purchase. `ORDER_REQUESTED` feeds the order flow, never the deal funnel. Confirm with IN4COM and list the deal types they track.

### Q27. Start values for automatic deal creation (Q12) — ✅ answered: accepted

Proposed rule (per-org settings, tuned later):

- auto-create when: a deal-entry code (per the org's stage rules) with confidence `high` AND topic score ≥ 7 AND the counterparty resolves to a client AND no open deal of the same client with the same deal type;  
- proposal card when: same, but confidence `medium` or score 5–6;  
- nothing when lower.

The created deal is marked «создал агент», journaled with the topic and evidence, and can be undone by the user. **Rec.:** start with these values in shadow mode; IN4COM users review every auto-created deal for the first 2 weeks.