# Topics — questions to resolve before development

Status: draft for review · 2026-11-10

Each question has: why it matters, options, and a recommendation (**Rec.**). Numbers match the `[D?n]` links in [01-specification.md](01-specification.md).
Blocking = must be answered before phase 1 starts (see [03-development-plan.md](03-development-plan.md)).

## Decisions (2026-11-10)

| Q | Decision | Consequence |
|---|---|---|
| Q1 | **Pilot = IN4COM** (org `1dNkC4rBtl9FEvnK95Svlfs63oSU57Ni`, wine / spirits distributor, ~16.8k catalog products). | Pilot packs = `base` + `distribution`. The `distribution` pack is now on the critical path (draft: [04-distribution-pack-draft.md](04-distribution-pack-draft.md)). The `agency` pack (Maslov) is seeded but stays off until a second pilot. |
| Q2 | v204 base + Maslov additions, as recommended. | Seed = v204 tables + `agency` pack + `distribution` pack; own version line "RU v1". |
| Q3 | **Platform admin only** manages signals. New Settings tab «Сигналы» = signals registry, with **Markdown export** of the actual list with all parameters. | Org owners have no signal settings in MVP; per-org activation and stage rules are also set by the platform admin (spec §4.1, §14). |
| Q7 | Topic = **one single point of business communication between the organisation and a client or vendor**. It can come from external signals (web search for market news), from the system of record (a client has not bought for a while), or from communications (a client wants something or complains). | Topic may have no source item; signal instances get an `origin` (communication / system_of_record / external). MVP builds communications; system of record = phase 8, web search = phase 11. Edge cases: market event = its own topic; supplier delay = a topic with the vendor. |
| Q8 | **Scrap the old cards and logic** once topics are implemented. | Phase 12 removes Custom-rule card generation and name-based deal discovery, then a contract migration drops the old columns. The «Telegram orders» rule stays for IN4COM until the orders link (phase 10). |
| Q5 | Yandex should handle it; we test. Other models in the Yandex registry can be used later if we hit limits. | Phase-0 spike stays (it measures, it does not block). The prompt builder must not depend on one model; the model is chosen per AI task in the config. |
| Q12 | The system may **create deals on its own** when signals show a high probability of a new deal. Thresholds are tuned later. | Spec §9.2 changed: auto-create above a per-org threshold, proposal card below it. Start values: see Q27. |
| Q21 | Every org has its **own funnel stage taxonomy** (Maslov's stages are one org's configuration), plus **rules** that map signals to deal moves across that funnel where needed. | New per-org `signal_stage_rule` (effect, target stage, guards incl. `requires_confirmation`), edited by the platform admin in «Сигналы» (spec §9.2). **"Paused" is a deal status**, not a stage (decided). |
| Q23 | Success targets **accepted as proposed**. | Go-live gates in spec §12 and plan phase 6. |
| Q4 | Separate AI task `signals` after parse, as recommended. | Spec §5.1. |
| Q6 | Prompts in **Russian**. | No A/B test; «Вы / ты» attribute off (as recommended). |
| Q9 | Items without signals attach as context only, as recommended. | Spec §6.4. |
| Q10 | Junk is skipped in MVP, as recommended. | Spec §5.2. |
| Q11 | Chat windows (>1 h gap or >100 messages), as recommended. **Plus:** files from Telegram chats / DMs (audio etc.) need parsing; such a file can be its own topic or carry new client / contact info. | Telegram file parsing is a **separate task outside this scope** (spec §1.2). |
| Q13 | Functional roles are needed; the business will give the list. **First iteration: skip them and show everything to all.** | MVP lists are the same for all members + filter «Мои»; P6 daily limit off. Roles, rights and routing = a separate task (Q33). |
| Q14 | Per-org system agent user, as recommended. | Spec §13. |
| Q15 | In-app → email digest → Telegram to staff, as suggested. | Plan phases 6 and 7. |
| Q16 | **7 days** of history at the start. | Spec §13. |
| Q18 | **5 USD (500 ₽) per org per day.** Model stats for the app and per org will be added. | Daily cap in the LLM wrapper; admin «Модели» stats; `llm_model_price` for RUB cost (plan phase 0). |
| Q19 | As recommended: same retention as source items; no per-person restriction in MVP. | Spec §13. |
| Q20 | Production / dev / test are **dedicated environments with their own PostgreSQL**, not Vercel / Neon. Testing starts when the feature is ready and test data exists. | Spec §13; plan risk updated. Scheduled runs need the CronJob on (`suspend: true` in the repo today). |
| Q22 | Mail watchdogs after the order-based checks, as recommended. | Plan phase 8. |
| Q17 | IN4COM business users review and assess the tests. Synthetic (fake) test messages are allowed for evals. | Golden set = real IN4COM items + synthetic items for rare codes; synthetic items are marked and reported separately. |
| Q24 | **Answered** (full text: [02-open-questions-answers.md](02-open-questions-answers.md)). Main points: N7 removed; no go / no-go anywhere; no limit on codes per item; W1 expiry 10 working days; P6 ≤ 3 evening reminders per cycle; trend list with D4 ceiling; blocks H and J parked; owner's win estimate for the forecast; rules for no-response codes. | Spec §2, §4.3, §5.3–5.6, §8.1, §8.4, §9.1–9.5. Short summary per item in Q24 below. |
| Q25 | No workshop needed: the IN4COM business users from Q17 review the draft pack ([04-…](04-distribution-pack-draft.md)) and confirm codes, importance, boundaries and Russian phrases. | Review happens in phase 0; RU texts confirmed in phase 1. |
| Q26 | **Deals only in the first step.** Deal = a general agreement / contract with the client. Order = purchase of a specific product or service. The order link is decided later. | Topics drive deals only. `ORDER_*` codes make topics and cards (attention) but no order or deal automation. The old «Telegram orders» card rule stays on for IN4COM until the orders step. |
| Q27 | Start values accepted. | Spec §9.2 values are the defaults. |
| Q28 | Q24 wins: **no go / no-go**. Business aligns the v2 funnel text. | Spec §2, §9.2 follow Q24. |
| Q29 | Agency = **second pilot after IN4COM**. | Plan phase 9, after the MVP. Pilot packs stay `base` + `distribution`. |
| Q30 | IN4COM deal risks: our draft, confirmed by IN4COM users in the pack review. | 04 §4; seed in plan phase 5a. |
| Q31 | **Org owner** manages the exclusion list. Excluded items: skip at sync where the provider allows a filter, else store the envelope only, never parse, never send to an LLM. All orgs. | Spec §5.2 gate 3a, §14; plan phase 2. |
| Q32 | As recommended: forwarded messages in the topics MVP (original sender = author); Telegram group chats and voice notes = separate tasks before the agency pilot. | Spec §1.2, §5.3; plan phase 2. |
| Q33 | **Functional rights and roles are a separate task**, not part of topics (too much risk of errors). | Plan phase 13 moved out of this plan. MVP: every org member sees everything; anyone who may edit a deal may enter the win estimate (author, date, note recorded). |
| Q34 | As recommended: the engine never creates a deal in area 0; area-0 signals make topics on the client / contact only; the pre-pipeline stage stays for manual use and is hidden for the agency org. | Spec §2; plan phase 9. |

New questions from these decisions: Q25–Q27 (end of this file) — all answered the same day.

Requirements v2 ([Описание требований - v2.md](Описание%20требований%20-%20v2.md)) added two features for all orgs — **deal state text** and **deal risk indicator** (spec §9.3, §9.4) — and raised Q28–Q34 (section E) — all answered the same day.

## Still open

Nothing blocks **phase 0**. The table says which phase needs each answer.

### For business (please answer)

| Q | Question | Who | Needed before |
|---|---|---|---|
| Pack | 8 questions in [04-distribution-pack-draft.md](04-distribution-pack-draft.md) §3 (order volume, who handles orders, always-urgent events, deal types, ЕГАИС by email, supplier delay weight, missing situations, IN4COM deal risks in §4) | IN4COM business users | Phase 1 seed (risks: phase 5a) |
| Q28 follow-up | Align the v2 «Структура воронки» text with Q24 (remove go / no-go) | Business (document only) | Phase 9 |

Out of this plan (separate tasks): functional roles and rights (Q33); Telegram group chats and voice notes (Q32); Telegram files (Q11).

### Technical

None open. All technical questions are answered (Q4, Q6, Q9, Q10, Q11, Q14). Technical choices made for v2 (no business answer needed): deal state is stored and versioned, one `dealState` LLM task writes the state and risk texts, risk activation and clearing are deterministic rules (spec §9.3–9.4).

---

## A. Scope and business

### Q1. Which tenant and vertical go first? — ✅ answered: IN4COM (see Decisions)
The Maslov catalog is for a PR / marketing **agency** (pitch, tender, brief). The repo also serves a **wine / spirits distributor** (orders, catalog, client types). The signal packs differ a lot.
- a) Agency first (Maslov catalog is ready and detailed).
- b) Distributor first (needs a new pack and a workshop).
- c) Both at once.

**Rec. a)** — pilot on the agency with `base` + `agency` packs. Start the distribution-pack workshop in parallel; it ships in a later phase. Confirm which org ids are the pilots.

### Q2. Which taxonomy version is the seed? — ✅ answered: v204 + Maslov additions
Maslov builds on Truffalo **v195**; the export in this folder is **v204** (newer: e.g. `SALES_BOOKING_RECEIVED` replaces `SALES_ORDER_CONFIRM`, retired codes listed).
- a) v204 base + Maslov additions (reconcile the diff).
- b) v195 exactly as in the Maslov doc.

**Rec. a)**, with a diff table reviewed by the Maslov side. Our taxonomy then starts its own version line (RU v1).

### Q3. Who may edit signals? — ✅ answered: platform admin only; registry tab + Markdown export
- a) Platform admin only (Settings → Сигналы); org owner switches packs / codes on or off.
- b) Org owner also edits weights, profiles, recipients.

**Rec. a)** for MVP. Weight edits by owners make evaluation and support hard.

### Q7. Is the topic definition right? — ✅ answered: one point of business communication with a client or vendor, from 3 origins
Spec §2.1: *one business question about one counterparty that needs, or may need, action from us*; merge rules from Maslov §5.5; examples table. Two edge cases need a business answer:
- A general market event about a client (e.g. new head of marketing) — its own topic, or attached to an open topic of that client? **Rec.:** its own topic (family `market`), unless the matcher links it to an open pitch.
- One supplier delivery delay that blocks three client orders — one topic or four? **Rec.:** one supplier topic + `topic_event` notes on the affected client topics (no automatic fan-out in MVP).

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

### Q21. How do Maslov stages map to the org funnel? — ✅ answered: per-org funnel taxonomy + per-org signal rules
Maslov: 0 Контакт до запроса → 1 Новая возможность → 2 Запрошены материалы → 3 Финальный выбор → 4 Выбраны → 5 Заказ подтверждён (+ lost / cancelled / paused). Our funnel: 7 system stages (Qualification … Closed / Rejected) + per-org stages; «Контакт до запроса» already exists as the pre-pipeline stage.

**Rec.:** for the agency org, configure its funnel with Maslov's stages (the «Настройки стадий» dialog already allows names and hiding), then map codes → stage ids in per-org stage rules. Decided: "paused" is a new deal status `paused`, not a stage.

### Q23. What does success look like? — ✅ answered: accepted as proposed
No KPIs exist in any source. Proposed acceptance targets for go-live per org (spec §12):
- signal precision ≥ 0.85 on P6 / P8 codes, recall ≥ 0.7;
- topic grouping pairwise precision ≥ 0.9, recall ≥ 0.8;
- card acceptance ≥ 40 % in the pilot month, < 15 % of rejects with reason "duplicate";
- cost ≤ agreed budget (Q18).

**Rec.:** agree these numbers (or others) with the pilot tenant before phase 2.

### Q24. Gaps in the Maslov catalog — ✅ answered 2026-11-10
Found while reading `Сигналы_Маслов_каталог_и_правила.docx`. Full answers: [02-open-questions-answers.md](02-open-questions-answers.md). The column «Answer (short)» is our summary; the spec section shows where it is applied.

| # | Gap | Answer (short) | Spec |
|---|---|---|---|
| 1 | `PROSPECT_NEED_EXPRESSED` weight 7 / N7 vs "general interest = 3" | General interest = `PROSPECT_CONTENT_INTEREST` (3, W1). Own task = `PROSPECT_NEED_EXPRESSED` (7, P6, new biz). **N7 removed.** Concrete project → opportunity, no internal approval. | §2, §4.3, §8.1 |
| 2 | `PROSPECT_CONTACT_MOVED`: one code, two polarities | Stays a chance (5, D4). Loss at the old company = `CONTACT_LEAVING` / `ACCOUNT_SPONSOR_SUPPORT_LOST`; key-contact risk only if the person supported the deal and no handover is confirmed. | §4.3, §9.4 |
| 3 | Risk 19: how many postponements? | From the **2nd distinct postponement** of the same decision in the current selection cycle, with no new date + next step. Agreeing both clears it. | §9.4 |
| 4 | W1 expiry | 10 working days from deadline (or creation); not before the first weekly display; then 7 more days in the weekly list; then history. | §8.1, §8.4 |
| 5 | P6 repeat cap | First display + ≤ 3 evening reminders per cycle; Telegram ≤ 2 per card per 7 days. New fact / new deadline = new cycle. | §8.1, §8.4 |
| 6 | Which codes are trends | 7 codes listed; D4 ceiling; each trend needs window, baseline, min data, threshold. | §5.4, §5.6 |
| 7 | Senior team threshold | **Remove all go / no-go and senior-team routing.** Agency withdrawal = separate internal outcome. | §2, §8.3, §9.2 |
| 8 | Block J gate | J (6 codes) **and H (40 codes) parked**; no processing, no risk triggers. | §4.3, §9.4 |
| 9 | Forecast probability | Opportunity owner's estimate with author, date, rationale; none → «не оценена», out of the weighted forecast. | §9.5 |
| 10 | Renewal "concrete enough" | Contract identifiable + next period / scope defined + explicit client confirmation. | §4.3 |
| 11 | "Confirmed" for absence codes | Originating request + elapsed deadline (default 7 days) + channels checked + no qualifying reply; dormant needs a rhythm threshold; too little data → no warning. | §5.6 |
| 12 | Max 3 codes per message | **No storage limit**; duplicates removed; card compact view ≤ 3 events with a fixed priority. | §5.3, §5.4, §9.1 |
| 13 | Five cited documents missing | Not system dependencies; the catalog is authoritative. | §4.3 |

---

## B. Technology

### Q4. Separate signal step, or inside the parse call? — ✅ answered: separate step
- a) Separate AI task `signals` after parse (one more LLM call per item).
- b) Inside every parser call (Truffalo way; one call).

**Rec. a)** for MVP: one prompt for all providers, re-runnable without re-parse, safer with one Yandex model. Revisit after the golden set shows stable quality.

### Q5. Can the Yandex model carry this prompt? — ✅ answered: test it; other Yandex models later if needed
Today only one model (`yandex-text`) is enabled, with no fallback. The extraction prompt holds ~40–100 active codes with definitions, boundaries and cues (estimated 8–15k tokens) + the item (up to ~15k tokens).
- Which exact model (YandexGPT 5 Pro / Lite, other) and context size?
- May we enable a second model for this task only (legal / 152-ФЗ constraints)?

**Rec.:** a 2-day spike in phase 0: run 50 golden items through `yandex-text` with the full prompt and with a two-pass (block → codes) prompt; measure quality, latency and token use. Decide from data.

### Q6. Prompt language and the salutation attribute — ✅ answered: Russian
- Prompts in Russian or English? **Rec.:** Russian (taxonomy text is Russian anyway), A/B on the golden set in phase 2.
- The «Вы / ты» attribute: **Rec.:** off; Russian business mail almost always uses «Вы».

### Q9. Items with no signal: attach as context? — ✅ answered: as recommended
**Rec.:** yes, only when they share a `thread_key` or a reference with an open topic (gives a full timeline); never create a topic from them.

### Q10. Should a strong signal override the junk filter? — ✅ answered: as recommended
Truffalo keeps junk-classified items that carry an active code. We skip junk before the signal step, so we cannot know.
**Rec.:** MVP skips junk. Log the junk categories per org; revisit if pilots report missed items.

### Q11. How to window chats (Telegram, WhatsApp)? — ✅ answered: as recommended; Telegram files = separate task
Today a whole Telegram DM is one "thread"; WhatsApp groups by time gap.
**Rec.:** the same window rule for both (>1 h gap or >100 messages). Confirm whether a Telegram **group** chat (phase 3 of the Telegram source) is in scope.

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
Maslov routes by role: «Связь», «Питч», «Аккаунт», «Финансы», «New biz», «Команда». We have org roles (owner / admin / member), `client.responsible_user_id`, `deal.user_id`, `user.department`.
**Rec.:** add a functional role per member (`sales`, `account`, `finance`, `new_biz`, `management`), editable by the owner on the «Участники» tab. Mapping in spec §8.3. Confirm the role list with the pilot.

### Q15. Which delivery channels, and when? — ✅ answered: as suggested
- MVP: in-app lists only («Сейчас» / «Сводка» / «Неделя»).
- Next: daily email digest; then Telegram to staff (needs a staff-bot binding flow; today the Telegram bot only ingests client DMs).

**Rec.:** in-app first; email digest second; Telegram third. Confirm.

### Q16. How much history to process at start? — ✅ answered: 7 days
Cost and noise grow with history. Truffalo uses a 14-day cold start.
**Rec.:** last 30 days for the pilot org (gives open topics with context); older items stay unprocessed unless a user opens them.

### Q17. Who builds the golden set? — ✅ answered: IN4COM business users; synthetic messages allowed
Need 200 real Russian items per vertical, annotated with codes, subjects and topic groups.
**Rec.:** we pre-annotate with the LLM; 1–2 people from the pilot tenant correct it (≈ 2 days of their time). Confirm the people and that their data may be used for this.

### Q18. What is the LLM budget? — ✅ answered: 500 ₽ (5 USD) per org per day
No token tracking exists today.
**Rec.:** add `llm_usage` in phase 0; set a monthly cap per org after the phase-0 spike gives cost per item.

### Q20. Where do we test with real data? — ✅ answered: dedicated environments; test when ready
~~Production is still Vercel + Neon~~ — corrected: production, dev and test are dedicated environments with their own PostgreSQL. Testing starts when the feature is ready and test data exists.

### Q22. Watchdogs (absence signals) — when? — ✅ answered: as recommended
`SALES_OFFER_NO_RESPONSE`, reply window 7 days, offer countdown 10/5/1, contract expiry. They need a scheduler and reliable "we sent / they replied" detection.
**Rec.:** phase 8, after the core is stable. Confirm that the pilot accepts this. For IN4COM the order-based recipes (dormant client by order rhythm, product stopped) are probably worth more than the mail watchdogs — see Q26.

---

## D. New questions after the 2026-11-10 decisions

### Q25. IN4COM signal pack — who confirms it? — ✅ answered: the Q17 business users review the draft
The draft in [04-distribution-pack-draft.md](04-distribution-pack-draft.md) is our proposal (≈ 25 new codes + base codes to switch on), written from domain knowledge only. Signals are the input to everything (which messages become topics, which list, when a deal is created), so IN4COM users confirm: which situations matter, how important each is, what does NOT count, and the Russian phrases they really see. No separate workshop is needed; a review of the draft by the same users who do the tests (Q17) is enough.

### Q26. What is a "deal" for IN4COM, and what is an "order"? — ✅ answered: deals only in step one
Decision: deal = a general agreement / contract with the client; order = purchase of a specific product or service. The first step covers deals only; the order link comes later.

Original question:
IN4COM already has orders (draft → sent → confirmed → finalized) and a deal funnel. A routine repeat order must NOT create a deal. Candidates for a deal: a new venue / new client listing, a chain listing or tender, a new wine-card placement, a renewal of an annual agreement.
**Rec.:** deal = a new or expanded *relationship* opportunity (listing, new client, tender, annual agreement); order = a single purchase. `ORDER_REQUESTED` feeds the order flow, never the deal funnel. Confirm with IN4COM and list the deal types they track.

### Q27. Start values for automatic deal creation (Q12) — ✅ answered: accepted
Proposed rule (per-org settings, tuned later):
- auto-create when: a deal-entry code (per the org's stage rules) with confidence `high` AND topic score ≥ 7 AND the counterparty resolves to a client AND no open deal of the same client with the same deal type;
- proposal card when: same, but confidence `medium` or score 5–6;
- nothing when lower.

The created deal is marked «создал агент», journaled with the topic and evidence, and can be undone by the user. **Rec.:** start with these values in shadow mode; IN4COM users review every auto-created deal for the first 2 weeks.

---

## E. Questions from the requirements v2 (2026-11-10)

Source: [Описание требований - v2.md](Описание%20требований%20-%20v2.md). It adds the **deal state text** and the **deal risk indicator** (now spec §9.3, §9.4, for all orgs), the agency roles, the six client scenarios and the agency funnel.

### Q28. Go / no-go: v2 text vs the Q24 answer — ✅ answered: Q24 wins
v2 «Структура воронки» → stage 1 entry condition «агентство приняло решение go» and «Вход в pipeline: решение go принимает старшая команда … только после go возможность включается в активный pipeline». The pilot section also says «проверить … применение go/no-go». Q24-7 says: remove all references to go / no-go and the senior team; Q24-1: no internal approval is needed.
**Rec.:** Q24 wins (it is the explicit later decision). The spec follows Q24. Please update these places in the v2 text so the two documents agree.

### Q29. Which pilot runs first? — ✅ answered: agency second, after IN4COM
Q1 decided IN4COM. v2 describes an agency pilot (≈ 8 directors, Telegram group bot, forwarding, dictated notes, pipeline import).
- a) IN4COM first, agency second (plan phase 9, +1.5 weeks after MVP).
- b) Both in parallel: agency golden set and pack review in phase 0–1 as well (+≈ 2 weeks to MVP, two sets of business reviewers).
**Rec. a).** Deal state and deal risks are built generically in the MVP, so the agency gets them in phase 9 with its own risk list (the 26 Maslov risks).

### Q30. IN4COM deal risks — ✅ answered: as suggested
The deal risk indicator is for every org, but the v2 examples are agency risks. IN4COM needs its own list, built from `base` + `distribution` codes. Draft in [04-distribution-pack-draft.md](04-distribution-pack-draft.md) §4 (9 risks).
**Rec.:** IN4COM users confirm it together with the pack review (no extra meeting).

### Q31. Exclusions from analysis — ✅ answered: org owner manages; rest as recommended
v2: «Некоторые разговоры намеренно не должны попадать в CRM; перечень адресов и переписок для анализа нужно настроить». The existing blocklist only hides clients / contacts from discovery; it does not stop analysis.
- Who manages the list? ~~**Rec.:** org owner and platform admin~~ **Decided: the org owner.**
- What happens to an excluded item? **Rec.:** skip it at sync where the provider allows a filter; otherwise store only the envelope, never parse it and never send it to an LLM.
- Is it needed for IN4COM too? **Rec.:** yes, generic for all orgs.

### Q32. Telegram group chats, forwarded messages, dictated call notes — ✅ answered: as recommended
v2 pilot: a bot in group chats; staff forward single DMs to the bot; after a call a person dictates a short note.
- **Forwarded messages:** **Rec.:** in the topics MVP. The Telegram ingest stores `forward_origin`; the original sender is the author (spec §5.3).
- **Group chats:** the Telegram source phase 3 (bot in a group). **Rec.:** separate task, before the agency pilot.
- **Dictated notes (voice):** the same separate task as Telegram files (Q11). **Rec.:** separate task, before the agency pilot.

### Q33. Rights per role, IN4COM roles, win estimate — ✅ answered: separate task
v2 lists the agency roles (владелец связи, директор аккаунта / проекта, pitch lead, new biz, менеджеры и эксперты, финансы, бухгалтерия, контакты и мероприятия) and says «конкретно права опишу чуть позже». The spec maps them in §8.3. Two roles are not per org but per object: the relationship owner is **per contact**, the pitch lead is **per deal**.
**Decided:** detailed functional roles and rights are a **separate task**, outside topics; doing them inside topics would cause many errors. Topics MVP: every org member sees everything (Q13). The win estimate can be entered by anyone who may edit the deal; author, date and note are recorded.

### Q34. Area 0 «Контакт до запроса» — ✅ answered: as recommended
v2: area 0 holds companies, people and contact history **without a deal and without an amount**; «это область отношений, а не стадия сделки». Today the app has «Контакт до запроса» as a pre-pipeline **deal stage** («Настройки стадий»).
**Rec.:** the engine never creates a deal in area 0. Area-0 signals (`PROSPECT_*`) create topics on the client or contact only. The existing stage stays for manual use; for the agency org it is hidden. Company relationship status and deal stage stay separate fields (v2 «Общие решения»).
