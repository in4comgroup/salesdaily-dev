# Topics — source analysis

Status: draft for review · 2026-11-10 · no code changes

This file records what the four inputs say, so the spec does not depend on chat history.

Inputs:

| # | Input | What it is |
|---|---|---|
| 1 | `topics concept.png` | Target model: Thread → Source item ↔ Topic → Card/Deal, with a signals taxonomy + attention engine. |
| 2 | `Сигналы_Маслов_каталог_и_правила.docx` | Business catalog for tenant «агентство Маслов» (PR / marketing agency). Version for approval, 2026-11-02. |
| 3 | `truffalo-logic-2026-11-10-10-05/*.md` | Export of a live sister system (German/Austrian market, media sellers and agencies): taxonomy, parser, card rules, delivery. |
| 4 | This repository (`salesdaily-dev`) | Current state of the RU CRM. |
| 5 | `02-open-questions-answers.md` | Business answers to the 13 Maslov catalog gaps (Q24), 2026-11-10. |
| 6 | `Описание требований - v2.md` | Business requirements v2 (RU): deal state text, deal risk indicator, agency roles, six client scenarios, agency funnel and pilot. |

---

## 1. Concept diagram

- **Thread** — technical id from the source (email thread, chat). Groups source items.
- **Source item** — one element (email, message, file, CRM dataset, external dataset). Many per source, many per thread.
- **Topic** — ONE subject of discussion, found by LLM analysis and reasoning. Not a category: invoices of two clients are two topics. One item can create several topics; one topic can relate to many items.
- **Signals taxonomy & attention engine** — source items are matched against a categorised list of signals. Signals that do not resonate with the context filter the item out. The LLM gives the list of signals and a quality score (0–1). The attention mechanism then sets scores and priorities for cards and deals.
- **Card or Deal** — card = the attention mechanism shown to a person. Deal-related signals must surface deals in the sales funnel. **One card relates to one topic only.**

## 2. Maslov catalog (business input)

Key facts:

- The tenant is a **PR / marketing / advertising agency**. It sells services (pitch, tender, brief, credentials, re-pitch). It has no product catalog or order lines. The repo also serves a **wine / spirits distributor** tenant (orders, catalog, client types `on_trade` …). The two verticals need different signal packs.
- Size: **193 unique signals** = 131 Truffalo v195 base codes (88 active, 29 onHold, 8 parked, 6 gated) + 62 new codes:
  - N1 PITCH (19) — pitch and agency selection;
  - N2 PROSPECT (10) — contact before a request («Контакт до запроса», area 0);
  - N3 account / delivery (15) — acceptance, disputes, renewals, pauses;
  - N4 risks (18) — deal risks, all mapped to 26 risks from the owner interview.
- Each new code has: **Событие** (event) / **Граница** (what does NOT count) / **Действие** (action) / **Завершение** (closure) / card profile / recipient role.
- **The "topic" concept exists, under other names:** «вопрос» (a business question that needs action, with a closure condition), «инцидент» (one shared incident for related risks), «возможность» (one commercial opportunity). Rule 5.5: *merge only within ONE business question; two pitches at one company, different invoices, or independent problems are NOT merged because of a shared client or thread.*
- **Funnel** = the client's decision on ONE opportunity. Stage 0 «Контакт до запроса» (no deal, no forecast) → 1 Новая возможность (needs internal **go**) → 2 Запрошены материалы → 3 Финальный выбор → 4 Выбраны → 5 Заказ подтверждён. Outcomes: excluded, declined (whole opportunity only), cancelled, paused. **A risk never moves the stage. Weights are not probability. Amounts never enter the forecast automatically.**
- **Scoring** (same as Truffalo): effective score = strongest signal + attributes capped at ±2; weights are NOT summed; tie-break risk > opportunity > info; trends capped at the daily digest.
- **Display profiles:** W1 weekly (1–3), D4 daily digest 07:30 (4–5), P6 «Сейчас» ≤3/day (6–7), P8 «Сейчас» no limit (≥8), S0 service close (no card), S1 closing fact (updates linked card), N7 special (need expressed: general 3 / concrete 7).
- **Recipients are roles**, not names: «Связь» (relationship owner), «Питч» (opportunity owner + pitch lead), «Аккаунт» (account director), «Финансы», «Команда», «New biz». Senior team only for critical go/no-go.
- **Principles:** all events must be confirmed; silence ≠ refusal; praise ≠ order; our own initiative never counts as a client signal; do not invent dates from conditions.
- **Out of scope in the doc:** how signals are detected. It has no Russian keyword lists, morphology or parsing rules.
- **Gaps found** (13 of them answered on 2026-11-10, see input 5 and `02-open-questions.md` Q24): no KPIs; no repeat threshold for risk 19; one code with two polarities (PROSPECT_CONTACT_MOVED); N7 weight unclear; expiry for scores 1–3 undefined; P6 repeat cap not quantified; "trend" list undefined; senior-escalation threshold undefined; "expert probability" has no owner or scale; 5 source documents it cites are not in the repo.

## 3. Truffalo export (reference implementation)

The export describes a **running** system (taxonomy version 204). It is German-language in all cues; labels are English. The vertical is media sellers / agencies.

### 3.1 Taxonomy (`signals-taxonomy.md`)

- DB dictionary: `signal_block`, `signal_category`, `signal_attribute`, `signal_relation`, `signal_taxonomy_meta`; edited in Settings; every parsed row and card stores the taxonomy version.
- 134 categories in 14 blocks (A Pipeline … N Suppliers), 26 attributes, 22 relations, 15 retired codes.
- Category fields: `weight` 0–9; `score rule` fixed | state | inherited; `class` risk | chance | fyi; `effort` quick | medium | complex; `kind` event | watchdog | state | derived | trend; `stage` active | onHold | parked | gated; `emitted by` parser | process | both; flags: amount, `asksUs`, inbound-only, `classByRelation`.
- Relations: `outranks` (B not counted), `leads_over` (card written around A), `both` (both belong on the card).
- Date gates: the LLM copies a date into `facts`; the server tests the window.
- Bands: none 0 · low 1–3 · normal 4–5 · high 6–7 · very_high 8–9 · critical ≥10.

### 3.2 Parser (`parser-rules.md`)

- Strict gate order; cheap deterministic gates before any LLM call; **one LLM parse call** per item returns markdown + junk verdict + org filter verdict + signals.
- Signal output: `signalCategories[]` (≤3; code, verbatim evidence, confidence high|medium|low, subject indexes), `signalAttributes[]`, `signalFacts` (contract end date, proposed meeting date, amounts ≤5, deadlines ≤5 with `precision exact|resolved`), **`subjects[]` (≤6, one per company × matter, with counterparty, onBehalfOf, reference numbers, product names)**.
- Universal rules: evidence or nothing; empty is normal; low confidence counts for nothing; judge only this item; **author-only** (quoted text is context); "we are the buyer" never emits customer codes; vendor marketing to us is never demand; contact codes are counterparty-only.
- Deterministic detectors: bounce, out-of-office (headers first), calendar replies without `.ics`, availability cues, salutation correction. **Russian coverage is almost zero** (2 OOO subject prefixes only).
- Money: European formats only; no ₽ / руб. Dates: relative dates resolved against the item's own date.

### 3.3 Cards (`card-processing-rules.md`)

- **The system decides whether there is a card; the LLM writes only the content.**
- Score never reaches the LLM. Band `none` → no card. State codes close cards of the same client.
- **At most one OPEN card per thread** (unique index). Continuity contract: NEW / UPDATE / NOOP + copied-exact card id; "prefer NOOP".
- `topic` is only a **free-text filing label** (2–3 lowercase words) on the card. The doc itself calls synonyms "the one failure mode". In Russian, case endings make this worse («рамочный договор» vs «рамочного договора»).
- Card text limits: headline ≤12 words, analysis ≤20, sinceLast ≤16, recommendation ≤3 steps × 15 words. One language per card.
- CRM recipes: deterministic codes from order data (dormant clients with a rhythm formula, YoY decline/growth, product stopped, reactivation due).

### 3.4 Delivery (`delivery-push-logic.md`)

- Attention engine puts each card on per-person lists: **Jetzt / Digest / weekly / Später / 17:00 loop**.
- Parameters `cards.*` with a settings ladder (user/client → org → platform → pilot → code) and owner locks: working hours, daily push limit 3 (scores 6–7), grace 120 min for unread mail, forgotten after 48 h, deadline escalation, effort lead days, offer countdown 10/5/1, expiry 5/7/10 working days, trend cooldown 90 days.
- Outbound: daily / weekly email, Telegram digest with a claim-then-send ledger (≤2 episodes per card per 7 days, backlog watermark on enable). Immediate push is NOT built there either.
- Feedback (reject reasons, done rating) is collected but does **not** change scoring.

## 4. Current RU system (this repo)

| Area | Today |
|---|---|
| Signals | **None.** No taxonomy, no codes, no score, no evidence. Parse analysis = language, summary, mentions, companies, products, relevance (email only), organizations, org attribution. |
| Threads | `source_item.thread_external_id` only. Semantics differ by provider: Nylas threadId; Google Chat thread; **IMAP = In-Reply-To (one parent id, not a thread)**; Telegram = whole DM chat; WhatsApp / Drive / dropoff = null. No thread table. |
| Cards | Manual run only (`/api/cards/generate`, cap 50). One LLM call per item with a free-text Custom rule. **One card per relevant item, no dedup.** `card_priority` = normal \| high. No status enum, no score, no thread or deal link. In-memory "conversation history" (thread key + external contact email, 180 days, 12 items) — not persisted. |
| Deals | Manual run only (`/api/deals/discover`). LLM returns CREATE / UPDATE_STAGE / SKIP; matching by **name**. Stage moves by the LLM are **not journaled** in `deal_activity`. No link from deal to source item or card. Org funnel has a pre-pipeline stage «Контакт до запроса» (same as Maslov area 0). |
| Discovery | Clients / contacts from `metadata_json`, deterministic, RU-aware matching (`translit-ru.ts`, `company-canonical.ts`). |
| Orchestration | K8s CronJob → `/api/cron/daily` → sync → parse → upload. **Cards / deals / discovery are not in cron.** CronJob is `suspend: true` in the repo. (Production, dev and test run on dedicated environments with their own PostgreSQL — not Vercel / Neon.) Card / deal generation is session-bound (`requireOrgContext`). |
| LLM | `src/server/ai` with `AI_CONFIG_PATH`; active profile = **one Yandex text model**, no fallback. Prompts are English. **No token / cost tracking.** |
| Delivery | In-app only (notifications bell = derived list). No outbound card push, no digests. |
| Feedback | Card accept (creates a task / order) or reject with free-text reason. Not used by generation. |

## 5. Main conclusions

1. **The sources agree on the core mechanism.** LLM extracts codes + evidence + facts; the server scores (MAX + attributes ±2), bands, gates and closes; the LLM writes card text only. Reuse this split.
2. **The missing piece in all three is a persisted Topic.** Truffalo uses "one open card per thread" + a free-text label. Maslov rejects thread or company as the merge unit and asks for "one business question". The concept diagram makes Topic a first-class entity. This is the main new design work.
3. **Detection for Russian must be built.** Neither document gives Russian cues. Quote markers, reply prefixes, bounce / OOO / calendar patterns, money (₽, `1 234,50`, тыс., млн, НДС), dates (genitive months, relative phrases, production calendar), legal forms, name declension — all must be added.
4. **Two verticals, one engine.** The agency (Maslov) and the distributor (wine) need different signal packs on the same engine. The Truffalo base fits the agency better; the distributor needs order / stock / samples / claims / ЕГАИС-type codes.
5. **Our foundation is thinner than Truffalo's.** We have no taxonomy tables, no scoring, no thread model, no cost tracking, no scheduled card runs, no delivery. The plan must build these first.

## 6. Requirements v2 (input 6)

| Part | What it asks | Where in the spec |
|---|---|---|
| «Текущее состояние» on the deal card | 1–2 sentences: situation, next step and who acts, obstacles. Facts only, no stage repeat, no invented reasons, no generic phrases. Stored, updated only on material change, history kept, sources openable. Fixed texts for "not enough info", won, lost. | §9.3 |
| «Есть риски» on the deal card | Badge + tooltip with the most critical risk (what and why, 1–2 sentences). A new risk is also a morning card (maybe a push). Stage-aware. Cleared by a new signal. 26 agency risk examples. | §9.4 |
| Roles | 8 agency roles; one person can hold several; relationship owner is per contact; «права опишу чуть позже». | §8.3, Q33 |
| Client scenarios (6) | New client, new order of an existing client, renewal / re-pitch, ongoing work, end and return, target company before a request (area 0). | §2 (area 0), Q34 |
| Agency funnel | Area 0 + stages 1–5, entry conditions and human-language signals; automatic moves on confirmed client actions, skip allowed, no move back on rework; silence ≠ loss; withdrawal = internal outcome. **Still requires an internal go for stage 1 — conflicts with Q24-7.** | §9.2, Q28 |
| Pilot | ≈ 8 directors; mail + Telegram (group bot, forwards, dictated notes); exclusions list; WhatsApp, Max, finance integration out. | §1.1–1.2, Q29, Q31, Q32 |

