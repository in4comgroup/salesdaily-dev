# Topics — specification

Status: draft for review · 2026-11-10 · no code changes
Inputs and findings: [00-source-analysis.md](00-source-analysis.md) · Open questions: [02-open-questions.md](02-open-questions.md) · Plan: [03-development-plan.md](03-development-plan.md)

All questions that change this spec were answered on 2026-11-10 (see `02-open-questions.md` → Decisions). Markers **[Qn]** point to the decision.

Update 2026-11-10 (later): merged the Q24 answers ([02-open-questions-answers.md](02-open-questions-answers.md)) and the business requirements v2 ([Описание требований - v2.md](Описание%20требований%20-%20v2.md)): deal state text (§9.3), deal risk indicator (§9.4), forecast estimate (§9.5), no go / no-go anywhere, N7 profile removed, no limit on codes per item, W1 expiry, P6 repeat cap, trend list, deferred blocks H and J for the agency pack. Q28–Q34 answered the same day (`02-open-questions.md` → Decisions).

---

## 1. Goal

Today a card or a deal is created **per source item** by a free-text rule. Consecutive messages about one matter create duplicate cards. Deals are matched by name. Nothing explains *why* something is important.

Target: the system collects **signals** from three origins — **communications** (email, chats, files, transcripts), the **system of record** (orders, revenue, client history) and **external data** (web search for market signals) — groups them into **topics** (one business point each), scores each topic with a deterministic **attention engine**, and shows **one card per topic**. Signals that belong to a sales opportunity drive **deals** in the org's own funnel. Everything works on **Russian-language** sources first.

The MVP builds the communications origin end to end. The topic and signal model supports all three origins from day one; the system-of-record and external origins ship in later phases (plan phases 8 and 11).

### 1.1 In scope

1. Signal taxonomy as data (platform base + vertical packs + per-org activation), with Russian cues. Managed by the platform admin only in a new Settings tab «Сигналы», with a Markdown export of the full current registry (decided Q3).
2. Signal extraction per source item (deterministic gates + one LLM call), server-side scoring.
3. Thread normalisation per provider.
4. Topic entity: resolution (attach / create), lifecycle, history.
5. Attention engine: topic score, band, display profile, recipient.
6. Card per topic (LLM writes text only), continuity NEW / UPDATE / NOOP.
7. Deal bridge: funnel signals create / propose deals and move them through the **org's own funnel stages** by per-org rules, journaled (decided Q21).
8. In-app attention lists («Сейчас» / «Сводка» / «Неделя»).
9. Evaluation set, metrics, LLM usage and cost tracking.
10. **Deal state text** («Текущее состояние», requirements v2): 1–2 sentences on the deal card — where we are, what we wait for, what blocks, what is next. Stored, versioned, updated only on material change (§9.3).
11. **Deal risk indicator** («Есть риски», requirements v2): a badge on the deal card, a tooltip with the most critical risk, a card when a new risk appears, automatic clearing (§9.4).
12. **Exclusions from analysis** (requirements v2, pilot section): addresses, domains and chats that the engine must never analyse (§5.2 gate 3a; Q31).

### 1.2 Out of scope (later phases or separate specs)

- Outbound delivery (email digests, Telegram push to staff) — phase 7 in the plan.
- Watchdog / absence signals (`*_NO_RESPONSE`, offer countdown, reply window) — phase 8.
- System-of-record signals from order data (dormant clients, YoY, product stopped) — phase 8.
- External market signals via web search (Yandex Search API) — phase 11.
- Mailbox read-state timers (grace, "forgotten") — need per-user `\Seen` data we do not sync.
- **Files from Telegram chats / DMs** (audio, documents, images): parsing them is a separate task (decided Q11). Such a file can be its own topic or carry new client / contact info. Until that task ships, the topic engine sees only the text messages of Telegram windows.
- **Functional roles, rights and per-person routing** (Q13, Q33): a **separate task**, outside topics. MVP shows all topics to all org members.
- Learning from feedback (weights stay static; feedback is stored for offline tuning).
- **Dictated call notes** (voice messages to the bot, requirements v2): audio = the same separate task as Telegram files (Q11, Q32).
- **Telegram group chats** with the bot (requirements v2): ingestion is phase 3 of the Telegram source, not this spec (Q32). Topics handle them like other chat windows once they are ingested.
- Contact groups (alumni, expert club, contractors), pipeline import from spreadsheets, and the integration with finance data (1С): separate work, not topics.
- The weighted **forecast view** (§9.5 defines only the data rule).

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Source item** | Existing `source_item` row: one email, chat message (group), file, transcript. Children (attachments, derived audio) are **evidence of the root**, never separate events. |
| **Thread** | Technical grouping from the provider (email thread, chat). A thread can hold many topics; a topic can span many threads. |
| **Signal (code)** | An entry in the taxonomy, e.g. `SALES_OFFER_REQUESTED` («Запрошено коммерческое предложение»). Has weight, class, kind, effort, flags. |
| **Signal instance** | One code found once, with evidence, confidence, subject and facts. Origin: `communication` (a source item; evidence = verbatim quote), `system_of_record` (a CRM check; evidence = the data fact, e.g. «последний заказ 14.03, обычный ритм 30 дней»), or `external` (web search; evidence = quote + URL). |
| **Attribute** | A modifier on how something was said (emotion, tone, brevity). Total effect capped at ±2. |
| **Subject** | One (counterparty × matter) pair inside an item, with reference numbers and product names. An item has 0–6 subjects. A subject is the unit that maps to a topic. |
| **Topic** | **One single point of business communication between the organisation and a client or vendor** (decided Q7): one question, request, problem or development that needs, or may need, action from us. It can come from a communication (the client wants something or complains), from the system of record (a client has not bought for a while), or from an external signal (market news about a client found by web search). It has signals, a lifecycle, a history and at most one open card. Topics are *instances*, not categories: "Счёт №124 — Ромашка просрочен" and "Счёт №125 — Ромашка просрочен" are two topics. A topic may have no source item (system-of-record and external origins). |
| **Card** | What a person sees for one topic: headline, why now, what changed, ≤3 steps. One card relates to one topic only. |
| **Deal** | Existing entity = one commercial **opportunity** (Maslov «возможность»). One deal has many topics; a topic has at most one deal. |
| **Pack** | A named set of signal codes for a vertical: `base`, `agency` (Maslov N1–N4), `distribution` (wine). The platform admin activates packs and codes per org. |
| **Funnel taxonomy** | The org's own list of deal stages (`deal_funnel_stage`, org-scoped) plus the org's rules that map signals to stage effects (`signal_stage_rule`). Every org can have its own; Maslov's 0–5 stages are one org's configuration, not a built-in. |
| **Deal state** | 1–2 sentences in Russian that tell the current situation of one deal: what happens now, the next step and who must do it, what blocks. Stored with a version history and links to its sources (§9.3). It never repeats the stage name. |
| **Deal risk** | A named warning type («Затягивание решения», «Потеря ключевого контакта» …) from a per-pack dictionary. It becomes active on a deal when its trigger signals are found on a topic of that deal and its conditions are met; it clears when a clearing signal or outcome arrives (§9.4). A risk never moves the stage. |
| **Area 0** («Контакт до запроса», agency) | Work with a company or a person before a concrete request: topics on a client or contact **without a deal**, no amount, no forecast. Requirements v2: this is a relationship area, not a deal stage. **Decided Q34:** the engine never creates a deal in area 0; the existing pre-pipeline stage stays for manual use and is hidden for the agency org. |

**No go / no-go (Q24-7, Q24-1).** No internal approval is needed to create an opportunity or to move it. Creation and stage depend only on confirmed client events and a concrete task. The agency's own decision to stop is a separate internal outcome (`withdrawn`, §9.2), set by a user.

### 2.1 Topic granularity rules

These come from Maslov §5.5 and the concept diagram. They are the acceptance criteria for topic resolution.

1. Merge only within ONE business question.
2. A shared client or a shared thread is **not** a reason to merge. Two parallel pitches at one company, two invoices, a complaint and an unrelated price request → separate topics.
3. One business question across channels (email + Telegram + meeting notes) → one topic.
4. Same reference number (invoice, order, offer, contract №) + same counterparty → same topic.
5. A request and its own reminder → one topic. A complaint and its escalation → one topic (escalation amplifies).
6. A closing fact (offer sent, invoice paid, complaint resolution confirmed) attaches to the topic it closes. It never creates a new topic by itself.
7. Praise does not close a complaint. A verbal win does not close order formalisation.
8. Expiry or a «Готово» click is not settlement of a business risk; the history keeps the difference.
9. The counterparty can be a client **or a vendor / supplier**. A supplier delay is a topic with the supplier; affected client topics get a `topic_event` note (no automatic fan-out in MVP).
10. A market event about a client (external origin) is its own topic, unless the matcher links it to an open topic of the same matter.

Examples (the evaluation set must include these):

| Input | Expected |
|---|---|
| Email «Пришлите КП на корпоратив на 40 человек», then Telegram «Ну что, когда будет КП?» | 1 topic, 1 card (UPDATE: reminder, waiting on us) |
| One email: «Счёт 124 не оплачен, и ещё — пришлите прайс на осень» | 2 topics: invoice 124; price request |
| «Счёт 124 оплатили» a week later | Closes the invoice-124 topic; no new card |
| «Вы в финале, обсудим обновлённую смету» | 1 topic on the pitch deal; deal → stage 3 proposed |
| «Добавьте ещё два направления, бюджет и дата прежние» | 1 risk topic (REQUIREMENTS_CHANGED + SCOPE_WITHOUT_ADJUSTMENT merged); no stage change |
| «Исправление приняли, вопрос закрыт» | Closes the complaint topic (S1); stops repeats |
| Newsletter from a supplier | No signal → no topic |
| IN4COM: Telegram «Прошу отгрузить 12 кор. Шабли 2021 к пятнице» | 1 topic (`ORDER_REQUESTED`, deadline Friday) → card; no deal; order flow link later (Q26) |
| IN4COM: «В поставке от 05.11 бой 3 бутылки, акт приложили», then «Когда замените?» | 1 claim topic (delivery 05.11), UPDATE: waiting on us |
| IN4COM: «Не можем подтвердить ТТН №4512 в ЕГАИС» | 1 topic (ЕГАИС issue, reference ТТН 4512), «Сейчас» |
| IN4COM: «Открываем второй ресторан в марте, хотим обсудить винную карту» | 1 topic (new venue / listing) → deal auto-created if confidence high and score ≥ 7 |
| System of record: client «Винотека» ordered every ~30 days, last order 75 days ago | 1 topic (`ACCOUNT_DORMANT`, origin system_of_record), no source item (phase 8) |
| External: web search finds «Ромашка открывает 5 новых ресторанов» | 1 topic (`SIGNAL_EXPANSION`, origin external, URL as evidence) (phase 11) |
| Deal topic: «Решение по поставщику перенесём на после праздников», two weeks later «Пока не готовы, вернёмся позже» (no date, no next step) | Same topic, 2 postponements → risk «Затягивание решения» active; deal state text updated; stage unchanged |
| Then: «Давайте встречу 20.11 с финдиректором, после неё решим» | Risk cleared (date + next step agreed), history kept; state text: next step = встреча 20.11 |
| «Спасибо, получили» on a deal topic | NOOP: no state change, no new card |

---

## 3. Architecture

```
          ┌──────────── existing ────────────┐   ┌──────────────────── new ─────────────────────────┐
 sync ──▶ source_item ──▶ parse (markdown, ──▶ 1 SIGNAL EXTRACTION ──▶ 2 TOPIC RESOLUTION ──▶ 3 ATTENTION ──▶ 4 CARD WRITER
          (+thread key)    entities, attrib.)   gates + LLM + scoring    keys + LLM matcher      deterministic     LLM text only
                                                       │   ▲                    │                    │
  CRM checks (orders, revenue) ── system_of_record ───────┤   │ (phase 8)          │                    │
  web search (market news) ───── external ───────────────┘   │ (phase 11)         │                    │
                                                       ▼                        ▼                    ▼
                                                signal_instance           topic, topic_item,     topic.score/band/
                                                                          topic_event            profile/owner
                                                                                │
                                                                                └──▶ 5 DEAL BRIDGE (funnel signals → deal proposals / moves)
                                                                                        └──▶ 6 DEAL STATE + RISKS (risk rules deterministic; state text LLM, stored)
```

Ownership of decisions:

| Decision | Owner |
|---|---|
| Which codes, evidence, facts, subjects are in an item | LLM (extraction) |
| Code valid, date gates, author / direction filters, score, band | Server (deterministic) |
| Which topic a subject belongs to | Server keys first, then LLM matcher with a closed list of topic ids |
| Topic score, class, profile, recipient, card exists or not | Server (deterministic) |
| Card wording, lead code choice among detected codes | LLM (card writer) |
| Deal stage | Server rule from the org's `signal_stage_rule`; human confirms where the org's rule requires it |
| Deal risk active / cleared | Server rule from `deal_risk_type` (codes, occurrences, stage guard, condition); LLM may only propose clearing with a cited item |
| Deal state text, risk explanation text | LLM (`dealState`), checked by the server; NOOP keeps the stored text |

---

## 4. Signal taxonomy

### 4.1 Storage

Platform dictionary tables (data, not code), seeded from Truffalo v204 + Maslov additions + distribution pack **[Q2]**:

- `signal_pack` — `code` (`base` | `agency` | `distribution` | …), label RU.
- `signal_block` — `code` (A…N, N1…N4), label RU, audience (`client_activity` | `colleagues_activity` | `business_info`), `internal_only`, `first_party_only`.
- `signal_category` — see 4.2.
- `signal_attribute` — code, group (exclusive), scope (`message` | `account` | `contact`), weight −1…+2, stage, profiles, RU cues.
- `signal_relation` — `outranks` | `leads_over` | `both` | `merges_into` (Maslov §5.5 merges), A, B.
- `signal_stage_rule` — **per org** (decided Q21): code → effect on the org's own stages. See §9.2 for fields. A pack may ship a template of rules; the admin copies and edits it per org.
- `signal_taxonomy_version` — integer version; every signal instance, topic and card stores the version it was computed with.
- `organization_signal_setting` — per org: active packs; per-code overrides (`stage` on/off, weight, display profile, recipient role). Resolution: org override → pack default.

**Signals registry (decided Q3):** only the **platform admin** manages signals — the dictionary, per-org activation, per-org overrides and per-org stage rules. It is a new tab «Сигналы» in Settings (`/settings`, platform-admin only). Org owners and members have no signal settings in MVP; they see the signals on topics.

**Markdown export:** the tab has «Экспорт в Markdown». It downloads the actual registry with all parameters: version and date; packs; blocks; every code with all §4.2 fields (incl. Russian label, definition, boundary, cues, card note), attributes, relations, date gates, retired codes; and, when an org is selected, that org's activation, overrides and stage rules. The same export is available as a server function for scripts. It replaces hand-written taxonomy docs (like the Truffalo `signals-taxonomy.md`).

### 4.2 Category fields

| Field | Values | Notes |
|---|---|---|
| `code` | UPPER_SNAKE | Stable. Retired codes are kept with `retired_at`, `successor_code`. |
| `pack`, `block` | FK | |
| `label_ru`, `definition_ru` | text | Shown in UI and used in prompts. |
| `boundary_ru` | text | «Граница» — what does NOT count. Mandatory for every active code. |
| `cues_ru` | text[] | Russian cue words / phrases (see §10). Hints, not regexes. |
| `weight` | 0–9 | |
| `score_rule` | `fixed` \| `state` \| `inherited` | `state` never scores; it closes. |
| `class` | `risk` \| `chance` \| `fyi` \| null | null for state codes. |
| `class_by_relation` | bool | Class depends on client relation (active / dormant / prospect). |
| `kind` | `event` \| `watchdog` \| `state` \| `derived` \| `trend` | Trend is capped at the digest band. |
| `effort` | `quick` \| `medium` \| `complex` | Drives deadline lead days. |
| `stage` | `active` \| `onHold` \| `parked` \| `gated` | Only `active` acts. |
| `emitted_by` | `parser` \| `process` \| `both` | `process` codes are never in the extraction prompt. |
| `asks_us` | bool | Maslov «REQ»: sets topic sub-state `waiting_on_us`. |
| `carries_amount` | bool | |
| `inbound_only` | bool | Dropped on items authored by us. |
| `display_profile` | `W1` \| `D4` \| `P6` \| `P8` \| `S0` \| `S1` \| null | null = derive from score. The Maslov profile N7 is **removed** (Q24-1). |
| `recipient_role` | `relationship` \| `opportunity` \| `account` \| `finance` \| `logistics` \| `team` \| `new_biz` | Maslov roles + `logistics` for distribution, see §8.3. |
| `closes_codes` | text[] | For `state` / S1 codes: which codes on the same topic it closes. |
| `date_gate` | jsonb | `{ fact, test: within\|beyond, settingKey }`. |
| `card_note_ru` | text | Per-code writing guidance for the card writer. |

### 4.3 Packs at launch (decided: pilot = IN4COM)

| Pack | Content | Source | Pilot (IN4COM) |
|---|---|---|---|
| `base` | Blocks A Sales, B Contracts, C Delivery, D Invoices, E Feedback, F Meetings, G Contacts, I Bounce, N Suppliers. Rewritten with RU definitions, boundaries, cues. H (market), J (team), K (account), L (competitors), M (internal) imported but `onHold` until needed. | Truffalo v204 tables | **on** (subset, see draft) |
| `distribution` | New codes for B2B wine / spirits distribution: orders, stock, samples, tastings, listings, delivery discrepancies, returns, ЕГАИС / marking / licence issues, payment terms, documents. `ORDER_*` codes make topics and cards only; the link to the order flow comes in a later step (Q26). Draft: [04-distribution-pack-draft.md](04-distribution-pack-draft.md). | New — confirmed in the IN4COM workshop (Q25) | **on** |
| `agency` | N1 PITCH (19), N2 PROSPECT (10), N3 account (15), N4 risks (18), with Maslov weights, profiles, recipients, closures, merges, plus the 26 deal risk types (§9.4). Q24 answers apply (see below). | Maslov catalog + Q24 answers | off (second pilot after IN4COM, Q29) |

**Agency pack rules from the Q24 answers** (seed values; the full text is in `02-open-questions-answers.md`):

| Q24 | Rule in the seed |
|---|---|
| 1 | `PROSPECT_CONTENT_INTEREST` = interest in a topic or material without an own need: weight 3, W1. `PROSPECT_NEED_EXPRESSED` = the client describes an own relevant task: weight 7, P6, recipient `new_biz`. A concrete project → deal entry (no approval). A vague task stays in area 0. |
| 2 | `PROSPECT_CONTACT_MOVED` = chance, weight 5, D4 (a reason to talk to the person at the new place). Loss at the old company is judged by `CONTACT_LEAVING` / `ACCOUNT_SPONSOR_SUPPORT_LOST` and the risk condition in §9.4. |
| 8 | Blocks **J «Команда» (6 codes)** and **H «События компании и рынка» (40 codes)**: `stage = parked` for the agency pack. No processing, cards, notifications or risk triggers. |
| 10 | Renewal = stage 4 only when the contract / service is identifiable, the next period or scope is defined and the client explicitly confirms the choice of the agency. «Надеемся продолжить» does not count. Written into the boundary of the renewal code and the stage rule. |
| 13 | The five cited source documents are not system dependencies. The catalog is the authoritative spec. |

---

## 5. Signal extraction

This section covers the **communication** origin. System-of-record and external origins write `signal_instance` rows directly (§5.6).

### 5.1 Placement **[Q4: decided]**

A **separate step after parse** (new AI task `signals`), not inside each parser:

- One prompt for all providers; parsers stay unchanged.
- Re-runnable without re-parsing (taxonomy changes, prompt fixes).
- Input = parsed markdown + envelope + org context. Output = §5.3.

Cost: one extra LLM call per root item that passes the gates. Later, once stable, it can be folded into the parse call (Truffalo does one call).

### 5.2 Gates before the LLM (deterministic, zero cost)

In order. Each skip writes `signal_status = 'skipped'` + reason.

1. Item is a root (`parent_source_item_id IS NULL`); `parse_status = 'complete'`; org has topics enabled.
2. Junk verdict (`relevance.isJunk`) — skip, **unless** a later run finds an active code (Truffalo override; not possible before the call, so junk items are skipped in MVP **[Q10: decided]**).
3. Blocklist / own-org-only internal noise (existing `discovery_blocklist`, `org_identity`).
3a. **Exclusions from analysis** (requirements v2: «некоторые разговоры намеренно не должны попадать в CRM»): a per-org list of email addresses, domains and chats (Telegram chat id, WhatsApp chat name). Managed by the **org owner** (Q31). Where the provider allows a filter (IMAP / Nylas by address, Telegram by chat), excluded items are not synced at all. Otherwise only the envelope is stored: the item is never parsed, never sent to an LLM, never attached to a topic and never used for deal state.
4. Automated sender (`is-automated-email.ts`; switch to token-anywhere match).
5. **Bounce detector** (RU + EN subjects, mail-system sender, DSN part) → emits `MAILERDEMON_RECEIVED` with `facts.bouncedMessageIds` without the LLM.
6. **Out-of-office detector** (headers first, then RU / EN subject and body cues) → emits `CONTACT_OOO` facts (return date, deputy) or skips.
7. Calendar reply without `.ics` (RU: «Принято:», «Отклонено:», «Под вопросом:» …) → meeting fact, no LLM.

### 5.3 LLM output schema (flat, sentinel values, Yandex-safe)

```
signals[]   (all distinct confirmed events, strongest first; Q24-12 — no business limit;
             technical safety cap 12; semantic duplicates removed by the server)
  code            string   — must be in the ACTIVE list given in the prompt
  evidence        string   — verbatim quote from THIS item's own text (not quoted history)
  confidence      "high" | "medium" | "low"
  subjectIndex    int      — index into subjects[]; -1 = all
attributes[]  (≤1 per group: emotion, tone, brevity, salutation)
  code, evidence
subjects[]   (≤6, one per counterparty × matter)
  counterparty    string   — company the matter is with; "" = internal
  onBehalfOf      string   — real owner when counterparty is an agent / logistics / IT
  matter          string   — 3–8 words in Russian, nominative case («счёт 124 за октябрь»)
  references[]    { kind: invoice|order|offer|contract|claim|other, value: string }  copied exactly
  products[]      string   — copied exactly
facts
  amounts[]   (≤5) { value: number, currency: "RUB"|"USD"|"EUR"|"CNY"|"", scope: total|per_unit|per_month|per_year, vat: incl|excl|unknown, evidence, subjectIndex }
  deadlines[] (≤5) { date: YYYY-MM-DD, precision: exact|resolved, what (RU), owner: us|them|unknown, evidence, subjectIndex }
  contractEndDate     YYYY-MM-DD | ""
  proposedMeetingDate YYYY-MM-DD | ""
direction       "inbound" | "outbound" | "internal"   — cross-checked with org attribution
```

Prompt rules (Russian text, see §10.4):

- Evidence or nothing. Empty is normal: most items have no code.
- Judge only this item. Quoted history (below «От:», «-----Исходное сообщение-----», «… написал(а):», «>») is context only.
- Author-only: a code describes what the AUTHOR does. Our own initiative is never a client signal.
- Forwarded messages (requirements v2: staff forward client messages to the bot): the author is the **original sender** (Telegram `forward_origin`, email «Пересылаемое сообщение» header), not the employee who forwarded it. The envelope carries `forwardedBy` (our user) and `originalAuthor`.
- We are the buyer: when the author sells to us, never emit customer codes (use supplier codes).
- Vendor marketing to us is never demand.
- Relative dates are resolved against the item's own date, never "today".
- Copy references and product names exactly.

Prompt size control **[Q5]**: send only the org's **active** codes; for each code send label, definition, boundary, ≤8 cues. If the prompt exceeds the model's budget, use two passes: (1) block classifier, (2) codes of the chosen blocks.

### 5.4 Server post-processing (deterministic)

1. Drop unknown, retired (map to successor), non-active, `process`-only codes; drop entries with empty evidence; check evidence appears in the item text (fuzzy, whitespace-insensitive).
2. Drop `inbound_only` codes when `direction = outbound`; drop internal-only blocks on external items.
3. Date gates (e.g. `CONTRACT_FRAME_EXPIRY` only if `contractEndDate` within 56 days after the item date).
4. Apply `outranks`.
5. Low-confidence instances are stored but count 0.
5a. Remove semantic duplicates (same code + same subject → keep the strongest evidence) (Q24-12).
6. Item score = **max** weight of counted codes (tie-break risk > chance > fyi, then dictionary order) + sum of attribute weights capped to [−2, +2]; floor 0. **Trend codes have a D4 ceiling** («Сводка»), even when attributes raise the score (Q24-6).
7. Store instances in `source_item_signal`; store `signal_score`, `signal_band`, `taxonomy_version`, `signal_scanned_at` on the item. **A stored score is never re-scored** when weights change (only an explicit re-run does).

### 5.5 Bands

| Band | Score | Priority | Display profile (default) |
|---|---|---|---|
| none | 0 | — | no topic created (item may still attach as context, §6.4) |
| low | 1–3 | low | W1 weekly |
| normal | 4–5 | normal | D4 digest |
| high | 6–7 | high | P6 «Сейчас» with daily limit |
| very_high | 8–9 | critical | P8 «Сейчас», no limit |
| critical | ≥10 | critical | P8 |

A code's own `display_profile` (e.g. S0, S1) overrides the band default.

### 5.6 Other origins (later phases, same model)

| Origin | Producer | Evidence | Counterparty | Phase |
|---|---|---|---|---|
| `system_of_record` | Scheduled CRM checks over `order`, `order_item`, `client` (dormant by order rhythm, product stopped, revenue YoY, reactivation due) — deterministic, no LLM | The data fact in Russian («последний заказ 14.03; обычный ритм 30 дней») + the numbers in `facts` | The client of the check | 8 |
| `external` | Web search per client / watch list (Yandex Search API, AI task `webSearch`), then the same extraction prompt in a `press` profile (only market codes; `about: subject \| other`) | Quote + URL | The client the article is about | 11 |

Both write `signal_instance` rows with `source_item_id = null` and go through the same scoring (§5.4), resolution (§6) and attention (§8). A trend cooldown (default 90 days per client + code) stops repeats.

Rules for absence, time-based and trend codes (Q24-6, Q24-11):

- **Trend list** (`kind = trend`, D4 ceiling): `SIGNAL_CONTACT_QUIET`; `ACCOUNT_REVENUE_STAGNATION`, `ACCOUNT_REVENUE_DECLINE_YOY`, `ACCOUNT_REVENUE_GROWTH_YOY`; `ACCOUNT_INCREMENTAL_WORK_SLOWDOWN`; `SIGNAL_SPEND_UP`, `SIGNAL_SPEND_DOWN`. `ACCOUNT_DORMANT`, `*_NO_RESPONSE` and overdue states are **not** trends. Being on this list does not switch on a parked code.
- Every calculated trend needs a configured observation window, a comparison baseline, a minimum data volume and a change threshold (per code, in `date_gate` / a new `trend_rule` jsonb). Too little data → no instance.
- **No-response** codes need: an originating request (an outbound item on the topic), an elapsed response deadline (agreed date, else default **7 calendar days**), all connected channels checked, and no qualifying response.
- `ACCOUNT_DORMANT` needs a configured no-purchase threshold based on the client's usual buying rhythm (for IN4COM: from order history).
- `PITCH_FEEDBACK_MISSING` needs an agreed feedback deadline or a direct confirmation that substantive feedback is absent.
- **Insufficient data never produces a definitive warning.**

---

## 6. Thread normalisation and topic resolution

### 6.1 Thread key (fix per provider)

`source_item.thread_external_id` is kept; a new normalised `thread_key` is written at sync / ingest:

| Provider | `thread_key` |
|---|---|
| nylas | `nylas:<threadId>` |
| imap | `imap:<root Message-ID>` from `References[0]`, else `In-Reply-To`, else own Message-ID. Requires storing `References` in the envelope. |
| gchat | `gchat:<space>/<thread>` |
| telegram | `tg:<chat_id>:<window>` — a chat is split into windows by a time gap (same rule as WhatsApp: >1 h gap or >100 messages) **[Q11: decided]** |
| whatsapp | `wa:<archive chat>:<groupKey>` (existing group = window) |
| gdrive / dropoff / aichat | `null` (documents are standalone) |

A `thread` table is **not** required for MVP; the key is enough for matching. Thread states (`waiting_on_us`) live on the topic.

### 6.2 Resolution order

For each subject of an item that has ≥1 counted signal (or a state / S1 code):

1. **Resolve counterparty** to a client id: existing `client` (name / aliases via `companyMatchKey`, sender domain, contact email). Unknown → `client_id = null`, keep the string; discovery may create the client later and the topic is re-linked.
2. **Hard key match** → attach to that topic:
   - same counterparty AND a shared reference (`kind + normalised value`) on an open or recently resolved topic.
3. **Candidate set** = open topics (and topics resolved in the last 14 days) of the same counterparty, plus open topics on the same `thread_key`. Ranked by recency. Max 10.
4. **Empty candidate set** → create a new topic.
5. **LLM topic matcher** (AI task `topicMatch`) gets the subject (matter, references, codes with evidence) and the candidates (topic id, title, matter, lead code, last 3 events). It returns `{ topicId | "NEW", reason }`. The id must be copied from the list; any other value = NEW. In doubt → NEW **only if** the codes are of a different matter family; same family on the same counterparty within 14 days → attach (cheaper to merge later than to duplicate attention).
6. State / S1 codes with no matching topic → stored on the item; **no topic is created**. They are logged for review.

Matter family = a coarse group used for candidate ranking and merges: `offer`, `order`, `invoice`, `contract`, `complaint`, `meeting`, `contact`, `pitch`, `delivery`, `account`, `market`, `supplier`. Each code has one family (new column `family` on `signal_category`).

### 6.3 Topic title

- The LLM proposes `matter` in Russian, nominative case.
- Display title = `<Компания> — <matter>` («Ромашка — счёт 124 за октябрь»). The company short name strips the legal form (ООО, АО, ПАО, ИП, quotes) — existing `translit-ru` helpers.
- **Matching never uses the title string.** It uses ids, references and the matcher. This avoids the Russian inflection problem of Truffalo's label.

### 6.4 Items without counted signals

An item with band `none` that shares a `thread_key` or a reference with an open topic is attached as `role = context` (no score change, visible in history). Otherwise it is ignored by topics. **[Q9: decided]**

---

## 7. Topic entity and lifecycle

### 7.1 Status

```
            new signal / reopen (≤14 d)
   ┌─────────────────────────────────────────┐
   ▼                                         │
 open ──(state/S1 code closes last active)──▶ resolved ──(14 d)──▶ archived
   │ ├─(user «Готово»)───────────────────────▶ done
   │ ├─(no activity 21 d)───▶ dormant ──(60 d total)──▶ expired
   │ └─(user merge)─────────▶ merged (→ merged_into_topic_id)
   └─(user «Не относится»)──▶ dismissed
```

- Sub-state of `open`: `waiting_on_us` (last counted code `asks_us` and no later outbound item on the topic) | `waiting_on_them` (last item is ours) | `none`.
- `done` ≠ `resolved`: done is a human mark; resolved is confirmed by a closing signal (Maslov rule: expiry or «Готово» is not settlement).
- A new matching item reopens `resolved` / `done` / `dormant` topics within 14 days; later it creates a new topic with `related_topic_id`.

### 7.2 Topic score

- Topic score = max over **active** signal instances on the topic (not closed by a state code, not low-confidence, not older than the code's relevance window) of the instance score.
- Recomputed on every attach / close. The card keeps the score it was born with.
- `lead_code` = the strongest active code (score tie-break); the card writer may pick another lead among detected codes for wording, never for the score.
- `class` = class of the lead code, or by relation for `class_by_relation` codes (active client → risk, prospect / dormant → chance).

### 7.3 Closing

- A `state` / S1 instance on a topic closes the instances listed in its `closes_codes` **on that topic** (not "same client" as in Truffalo). If no active instance remains → `resolved` + `closed_reason`.
- Outcome codes (PITCH_EXCLUDED, PITCH_CANCELLED_BY_CLIENT …) close the topic and stop reminders; the outcome is shown once.
- `PITCH_PAUSED_BY_CLIENT` → topic `open` with `snoozed_until` = return date or condition; no repeats until then.

---

## 8. Attention engine (deterministic)

### 8.1 Display profile → list

| Profile | List | Rule |
|---|---|---|
| P8 | «Сейчас» | No daily limit; repeat protection per card. |
| P6 | «Сейчас» | ≤ `cards.dailyPushLimit` (3) distinct cards per user per local day; overflow → «Сводка». **Off in MVP** (no per-person routing yet, Q13): P6 behaves like P8. **Repeat cap (Q24-5):** first display + at most **3 evening reminders per cycle**. A new material fact or a newly agreed deadline starts a new cycle; an unchanged background check does not. An approaching deadline overrides the daily limit on distinct cards, never the duplicate protection of the same card. End of the reminder cycle ≠ issue resolved. |
| D4 | «Сводка» | Morning digest list (07:30 local). Ceiling for trend codes. |
| W1 | «Неделя» | Weekly list (Fri 12:00). **Expiry (Q24-4):** 10 working days from the deadline, or from creation if there is no deadline, but never before its first weekly display. After expiry it stays in the weekly list for 7 more calendar days, then only in history. Expiry does not resolve the business risk. |
| S0 | — | No card; closes. |
| S1 | — | Updates the linked card; if nothing linked → W1 info. |

The Maslov profile N7 is removed (Q24-1): `PROSPECT_CONTENT_INTEREST` is W1, `PROSPECT_NEED_EXPRESSED` is P6.

MVP shows these lists **in-app** (dashboard), the same for every org member (Q13), with a filter «Мои» = topics of clients where I am «Ответственный» (`client.responsible_user_id`, migration 0002). External delivery is phase 7 (Q15: in-app → email digest → Telegram to staff).

### 8.2 Deadline escalation (MVP subset)

- A deadline (from `facts.deadlines`, owner = us) closer than `cards.deadlineImmediateHours` (24 h) → «Сейчас», no daily limit.
- Deadline before the next list point + 3 h → move up one list (W1 → D4 → P6).
- Dated topics return to «Сводка» N working days before the deadline (`complex 5 / medium 3 / quick 2`). Working days use the **Russian production calendar** (table `work_calendar_day`, loaded yearly).

### 8.3 Recipient (owner of attention) — separate task (Q33)

**Decided Q13:** functional roles are needed, and the business will give the role list. The first iteration skips them: every org member sees every topic; `topic.owner_user_id` = the client's «Ответственный» (display and «Мои» filter only). The `recipient_role` field on codes is stored from the start, so routing can switch on later without a taxonomy change.

**Decided Q33:** functional roles and rights are a separate task, not part of topics. The table below is input for that task only; topics code does not depend on it. Requirements v2 gives the agency role list:

| Role (v2) | Code | Scope | Resolved to |
|---|---|---|---|
| Владелец связи | `relationship` | **per contact** (v2: "a role relative to a contact, not the whole company") | new `contact.relationship_owner_user_id`; else `client.responsible_user_id` (migration 0002); else client creator |
| Директор аккаунта / проекта | `account` | per client | `client.responsible_user_id` |
| Pitch lead / ответственный за возможность | `opportunity` | **per deal** | deal owner (`deal.user_id`); no deal → `relationship` |
| New biz | `new_biz` | org | members with function `new_biz`; none → org owners |
| Финансовая роль | `finance` | org | members with function `finance` + `account` |
| Бухгалтерия | `accounting` | org | members with function `accounting` (payment facts; no deal decisions) |
| Менеджеры и эксперты | `team` | per deal / client | deal team (later); now: `account` |
| Контакты и мероприятия | `events` | org | members with function `events` (contact lists, invitations) |
| Логистика (distribution pack) | `logistics` | org | members with function `logistics` + `account` (delivery, ЕГАИС, documents) |

**Senior team («Старшая команда») gets no routing** (Q24-7): no go / no-go cards, no automatic risk distribution to it.

Functional roles need a new per-member attribute (`member_function`, several per member — v2: one person can hold several roles). The org role (owner / admin / member) stays for permissions only. The IN4COM role list and the rights come with that separate task.

Visibility: every org member sees all topics of the org (same as cards today). Per-recipient lists come with functional roles.

### 8.4 Parameters

Stored with the settings ladder user → org → platform → code default (subset of Truffalo `cards.*`): `workingHours`, `timeZone` (per user; Russia spans UTC+2…+12), `dailyPushLimit`, `digestVisibleItems`, `morningDigestTime`, `weeklyReview`, `deadlineImmediateHours`, `digestActionBufferHours`, `deadlineLeadDays`, `expiryDays` (per band; W1 = 10 working days, Q24-4), `weeklyGraceDays` (7), `p6RepeatMax` (3 evening reminders per cycle, Q24-5), `telegramMaxPerCard7d` (2 incl. the first delivery, Q24-5; phase 7), `noResponseDefaultDays` (7, Q24-11; phase 8), `riskPostponementCount` (2, Q24-3), `topicReopenDays` (14), `topicDormantDays` (21), `topicExpireDays` (60).

---

## 9. Cards and deals

### 9.1 Card per topic

- `card.topic_id` (new). **At most one open card per topic** (partial unique index).
- Card exists only if the topic band ≥ low and the profile is not S0.
- Card status enum (new): `open` | `accepted` | `rejected` | `superseded` | `expired` | `closed`. The old `accepted` boolean is kept and written in parallel during the expand phase.
- Continuity per topic: when a new item attaches, the card writer returns `NEW` (rare: lead matter changed), `UPDATE` (replace text of the open card, set `since_last`), or `NOOP` (nothing changed — "thanks", read receipt). UPDATE is never applied to an accepted / rejected card; a new card supersedes it.
- Card text (Russian, one language): headline ≤12 words «<Компания> — <наше действие>, <цель>»; «Почему сейчас» ≤20 words; «Что изменилось» ≤16 words (empty if nothing changed in the work); ≤3 numbered steps ≤15 words; roles not names; no congratulations; no invented facts or dates.
- **Events on the card (Q24-12):** the compact view lists at most **3 events**, in this order: critical risks and urgent actions → client decisions and commitments → changes to terms → other context. All other events of the topic open with «Ещё». S0 / S1 closing events are processed even when they are not in the compact view. Independent issues in one item are separate topics and cards (§2.1).
- Card fields from the engine (not LLM): `score`, `band`, `priority`, `display_profile`, `signal_class`, `lead_code`, `taxonomy_version`, recipient user ids.
- Accept / reject stays: accept creates a task, reject asks for a reason **code** (list) + optional text. Reasons are stored for evaluation. (Accept → order for `ORDER_REQUESTED` comes with the orders step, Q26.)
- **Old card logic is removed** once topics are implemented (decided Q8): Custom-rule card generation (`/api/cards/generate`, Explore / Magic buttons, card rules), and the old `accepted` / `rejection_reason` columns after the contract migration. Until removal, it stays only for orgs with topics `off`; for IN4COM the «Telegram orders» rule stays until the orders link (Q26).

### 9.2 Deal bridge

- `topic.deal_id` (nullable FK). One deal ↔ many topics.
- **Org-specific funnel taxonomy (decided Q21).** Every org has its own stages (`deal_funnel_stage`, org-scoped — the table already exists; the «Настройки стадий» dialog edits names and hiding) and its own signal rules. Maslov's 0–5 funnel is the agency org's configuration, not code.
- `signal_stage_rule` (per org, platform admin edits in «Сигналы»):
  - `code` → `effect`: `create_deal` | `enter_stage` (target stage id) | `in_stage` (context only) | `outcome` (`won` | `lost` | `cancelled` | `paused`) | `none`. **`paused` is a deal status, not a stage** (decided): the deal keeps its stage, gets `status = paused`, the return date / condition and the reason; reminders stop until the return date. Silence is never `lost` (v2). The outcome **`withdrawn`** (the agency / org decided to stop, Q24-7) is set only by a user, never by a signal, and is kept with its reason;
  - guards: `min_confidence`, `min_score`, `from_stages` (allowed current stages), `forward_only` (default true), `requires_confirmation` (proposal card instead of an automatic move — an org-level choice for cautious orgs; **not** an internal go / no-go, Q24-7), `deal_type` (which kind of deal it creates or moves);
  - several rules per code are allowed (e.g. one rule for stage 2, another for stage 3 when the deal is already in 2).
- Rules for all orgs: risks never move stages; amounts never enter the forecast automatically; every move is journaled with the rule id, topic and evidence.
- **Deal vs order (decided Q26):** a **deal** is a general agreement / contract with the client (new client or venue, listing in a wine card or chain, tender, annual supply agreement, renewal). An **order** is a purchase of a specific product or service. **Step one covers deals only:** `ORDER_*` codes create topics and cards but never create or move deals; the order-flow link is a later step.
- Behaviour (decided Q12: the system may create deals itself; start values Q27, per-org settings `deals.autoCreate*`):
  - Topic with a deal-entry code, no open deal of this client and deal type:
    - confidence `high` AND topic score ≥ `deals.autoCreateMinScore` (7) AND counterparty resolved to a client → **create the deal** (`createDeal`, actor = system agent user, badge «создал агент»), link `topic.deal_id`, journal in `deal_activity` with `topic_id` + `source_item_id` + evidence. The user can undo (deal status `deleted`, reason kept).
    - confidence `medium` or score 5–6 → **proposal** card «Новая возможность?» with Создать / Не сделка.
    - lower → nothing.
  - Orgs may switch auto-create off and keep proposals only. The agency pack uses the same auto-create as IN4COM: a concrete client task creates the opportunity without internal approval (Q24-1, Q24-7).
  - A topic linked to a deal with a higher `enter_stage` code → move the deal forward (forward only; **skip allowed**, v2: an RFP or a direct order confirmation may set the matching stage at once) via `moveDealStage(actor: 'agent')`, which writes `deal_activity` with `source_item_id` and `topic_id` (new nullable columns). Backward moves only by outcome codes. Rework alone never moves a deal back (v2). Our own actions (offer sent, internal tasks) never move a stage (author-only rule).
  - In-stage codes update deal context (decision date, people, budget context) via `topic_event`, not the stage.
- The current name-based `/api/deals/discover` is removed together with the old card logic (Q8).

### 9.3 Deal state («Текущее состояние», requirements v2)

Goal: a person who does not know the deal reads one block and knows **where we are, what we wait for, what blocks, what is next**.

- **Storage, not on-the-fly** (v2 recommends it): `deal.state_text`, `deal.state_updated_at`, plus an append-only `deal_state_version` (text, reason, source item ids, topic ids, actor `agent` | `user`, model, created_at). The kanban card and the drawer read the stored text; no LLM call on page open.
- **Trigger:** a new item attaches to a topic of the deal with `UPDATE` (not `NOOP`), a deal outcome / status change, a new or cleared risk, or a user request «Обновить». Debounce: one run per deal per 10 minutes.
- **AI task `dealState`** (Russian prompt). Input: deal (client, stage name, status, amount), linked topics (title, status, lead code, facts, last events), the last ≤8 items of those topics as markdown excerpts, active risks, the **previous state text**. Output: `{ decision: "UPDATE" | "NOOP", text, sourceItemIds[] }`. NOOP when the situation did not materially change (v2: «переформулировать не требуется»).
- **Rules in the prompt** (from v2): 1–2 short sentences, connected text, not fields; do not repeat the stage; facts only, no intentions the sources do not state; use the deal history, not only the last item; show changes (new dates, new requirements, withdrawn agreements); always state the next step, or say it is not defined; make clear who must act (client or us); never invent a reason for a delay — silence is not refusal; no generic phrases.
- **Server checks** (deterministic, reject → keep the old text and log): length ≤ 2 sentences / ≤ 45 words; a stop list of generic phrases («работа со сделкой продолжается», «клиент заинтересован», «ведутся переговоры» …); the stage display name must not be the only content; every `sourceItemId` must be in the input.
- **Special cases:** no or too little data → the fixed text «Недостаточно информации о текущем состоянии сделки» (no LLM call if the deal has no linked topic); won → short result (what is agreed or bought); lost → the established reason, or no reason when unknown.
- **Sources:** «Источники» under the text opens the items in `sourceItemIds` (v2: the user must be able to open the sources).
- The state changes independently of the stage (v2). History of versions is visible in the deal drawer.
- Existing `deal.reasoning` / `deal.changes` (old discovery) stay for orgs with topics `off`; they are removed with the old logic (Q8).

### 9.4 Deal risks («Есть риски», requirements v2)

- **Risk dictionary** `deal_risk_type` (platform data, per pack, edited in «Сигналы»): `code`, `label_ru` (e.g. «Затягивание решения»), `description_ru`, `trigger_codes[]`, `clear_codes[]`, `severity` 1–9, `min_occurrences` (default 1), `stage_guard` (per org: stages where it applies — v2: "no budget at an early stage is not necessarily a risk"), `condition` (named server check, optional), `reaction_role`, `stage`. The agency pack seeds the **26 Maslov risks** (§4 of the catalog, with their signals and «Снятие предупреждения»). IN4COM uses its own list: the draft in `04-distribution-pack-draft.md` §4, confirmed by IN4COM users in the pack review (Q30).
- **Activation** (deterministic): a trigger code is counted on a topic linked to the deal, the stage guard allows it, the occurrence count is reached, the condition is true → `deal_risk` row `active` with the trigger instance ids. Examples from Q24:
  - «Затягивание решения» (Q24-3): `min_occurrences = 2` distinct postponements (`PITCH_DECISION_DELAYED_BY_CLIENT`) of the **same decision in the current selection cycle**, with no new date + next step agreed after them. Repeated mentions of one postponement and postponed unrelated meetings do not count. Agreeing a date and a next step clears it; history stays.
  - «Потеря ключевого контакта» (Q24-2): condition = the person **supported this deal** (linked in `deal_contact`) AND no handover / working access to the stakeholder is confirmed. A job move alone does not trigger it.
  - Risks referring to parked codes (blocks H, J for the agency pack) never trigger (Q24-8).
- **Clearing:** a `clear_codes` signal on a topic of the deal, a deal outcome, or a user action «Риск снят» (reason required). v2: «риск устранён, если новый входящий сигнал показал, что ситуация изменилась». The `dealState` run may also **propose** clearing with evidence; the server accepts it only with a cited item. Card expiry or «Готово» never clears a risk (Q24-4, §2.1 rule 8).
- **Display:** the deal card shows the badge «Есть риски» when ≥1 risk is active. The tooltip shows **only the most critical** one (highest severity × trigger score, then the newest): label + 1–2 sentences «в чём риск» and «на чём основана оценка». The text comes from the `dealState` run (field `riskExplanations[{riskId, text, sourceItemIds}]`); the same server checks as §9.3. The drawer lists all active and cleared risks.
- **Attention:** the trigger signal already makes (or updates) a risk card on its topic through the normal attention engine (§8) — v2: "a risk is also one of the morning cards, maybe a push". The weight of the trigger code sets D4 or P6 / P8. No separate card type.
- Risks never move the stage and never change the amount (§9.2).

### 9.5 Forecast estimate (agency, Q24-9)

- The weighted forecast uses only the **opportunity owner's estimate** of the win probability, with author, date and rationale (`deal.win_estimate` 0–100, `win_estimate_by`, `win_estimate_at`, `win_estimate_note`).
- No estimate → the deal is «не оценена»: its amount is in the unweighted pipeline and excluded from the weighted forecast.
- Signal weight, stage number and the stage `closure_probability` never replace the owner's estimate. Amounts never enter the forecast automatically (§9.2).
- Anyone who may edit the deal may enter the estimate (Q33: no role rights in this scope); author, date and note are always recorded. The forecast view itself is out of scope (§1.2).

---

## 10. Russian-language requirements

### 10.1 Deterministic patterns (code, unit-tested)

| Area | Patterns to add |
|---|---|
| Quote markers | «От:», «Отправлено:», «Кому:», «Тема:», «-----Исходное сообщение-----», «-------- Пересылаемое сообщение --------», «… пишет:», «… написал(а):», «>» lines |
| Reply / forward prefixes | Re:, Отв:, Ответ:, Fwd:, Пересл:, FW: (chains) |
| Bounce | «Недоставленное сообщение», «Не удалось доставить», «Ошибка доставки», «Сообщение не доставлено», «Возвращённое письмо» + EN DSN; Yandex / Mail.ru senders |
| Out-of-office | Subjects «Автоответ», «Автоматический ответ», «Нет на месте»; body «в отпуске до», «нахожусь в отпуске», «на больничном», «в командировке», «вернусь», «буду на связи с», «по срочным вопросам обращайтесь к», «нет в офисе» |
| Calendar replies | «Принято:», «Отклонено:», «Под вопросом:», «Предварительно принято:» |
| Money | thousands sep = space / NBSP / dot; decimal comma; «₽», «руб.», «р.», «RUB»; «тыс.», «т.р.», «млн», «млрд», «к»; «в т.ч. НДС», «без НДС», «с НДС» |
| Dates | genitive months («16 октября»), «к 15.11», «до пятницы», «на следующей неделе», «в течение 3 рабочих дней», «до конца месяца», quarters («в Q4», «в 4 кв.») — resolved by the LLM against the item date, validated by the server |
| Working days | Russian production calendar (moved working Saturdays, holidays) |
| Legal forms | ООО, АО, ПАО, ЗАО, НАО, ИП, ГУП, МУП, НКО, АНО + «ёлочки» / "quotes" (exists in `translit-ru.ts`) |
| Freemail | add rambler.ru, bk.ru, list.ru, inbox.ru, ya.ru, internet.ru, yandex.by/kz, mail.ua |
| Names | declension-insensitive matching via existing `personMatchKey`; name + patronymic detection |

### 10.2 Cues per code

Every active code in `base` / `agency` / `distribution` needs `cues_ru` (written, not translated). Examples:

- SALES_OFFER_REQUESTED: «пришлите КП», «коммерческое предложение», «просчитайте», «смета», «сколько будет стоить проект».
- SALES_PRICE_REQUEST: «прайс», «цены», «условия», «скидка от объёма», «какая цена».
- INVOICE_OVERDUE (outgoing, client owes): «напоминаем об оплате», «просрочка», «задолженность», «акт сверки показывает долг».
- INVOICE_PAID: «оплатили», «платёжка», «деньги ушли», «платёжное поручение».
- COMPLAINT_QUALITY: «брак», «ошибка», «не то», «претензия», «рекламация», «возврат».
- COMPLAINT_TIMING: «сорвали сроки», «опять задержка», «мы до сих пор ждём».
- CONTRACT_FRAME_EXPIRY: «договор заканчивается», «пролонгация», «продление договора», «доп. соглашение».
- SALES_TENDER_INVITATION: «тендер», «закупка», «44-ФЗ», «223-ФЗ», «котировка», «НМЦК», «срок подачи заявок».
- PITCH_SHORTLISTED: «вы в финале», «вы в шорт-листе», «прошли во второй тур» (boundary: «мы рассматриваем» does NOT count).

### 10.3 Attributes in Russian

- Emotion: ANGRY («возмутительно», «неприемлемо», «досудебная претензия», «будем вынуждены»), FRUSTRATED («к сожалению, опять», «разочарованы»), IMPATIENT («срочно», «сколько можно», «жду ответа», «ASAP»).
- Tone negative: reproach («опять ничего не прислали») vs fact («пока не получили»).
- Salutation: **off by default** — Russian business mail almost always uses «Вы»; low signal value.

### 10.4 Prompt language **[Q6: decided]**

Prompts and taxonomy text are **in Russian**; field names and enum values stay English. No A/B test is needed.

---

## 11. Data model changes

All changes follow `AGENTS.md` migration rules: additive, schema-qualified (`"public".…`), one runner transaction per file, new enum values not used in the same file, PG17 tests from empty and from the previous schema.

The numbers below are working names only. Real numbers are given in the order the files ship (see the plan: `llm_usage` ships first, in phase 0).

| Migration (draft) | Objects |
|---|---|
| 0003_signal_taxonomy | `signal_pack`, `signal_block`, `signal_category`, `signal_attribute`, `signal_relation`, `signal_stage_rule` (per org), `signal_taxonomy_version`, `organization_signal_setting`; enums `signal_class`, `signal_kind`, `signal_stage`, `signal_score_rule`, `signal_effort`, `display_profile`, `recipient_role` |
| 0004_source_item_signals | `signal_instance` (org, code, **origin** `communication`\|`system_of_record`\|`external`, source_item_id nullable, process_key nullable, external_url nullable, evidence, confidence, subject_index, counted, score_contrib, topic_id nullable, taxonomy_version, created_at); `source_item_subject` (item, index, counterparty, client_id, on_behalf_of, matter, references jsonb, products text[]); `source_item` new nullable columns: `thread_key`, `signal_status`, `signal_score`, `signal_band`, `signal_facts` jsonb, `signal_scanned_at`, `taxonomy_version`; index `(organization_id, signal_scanned_at)` |
| 0005_topics | `topic` (id, org, client_id, counterparty_raw, deal_id, title, matter, family, status, sub_state, lead_code, class, score, band, display_profile, owner_user_id, references jsonb, next_deadline_at, snoozed_until, first_seen_at, last_activity_at, closed_at, closed_reason, related_topic_id, merged_into_topic_id, taxonomy_version, timestamps); `topic_item` (topic, item, subject_index, role `origin`\|`update`\|`closing`\|`context`); `topic_event` (append-only journal: type, actor `agent`\|`user`, user id, payload jsonb, item id); enums `topic_status`, `topic_sub_state`, `topic_item_role` |
| 0006_card_topic | `card` new nullable columns: `topic_id`, `status` (new enum `card_status`), `score`, `band`, `display_profile`, `signal_class`, `lead_code`, `since_last`, `taxonomy_version`, `reject_reason_code`, `decided_at`; partial unique index one open card per topic |
| 0007_deal_topic | `deal_activity` new nullable `source_item_id`, `topic_id`, `rule_id`; `deal_status` enum gets `paused` (`ALTER TYPE … ADD VALUE`; the value is used only by code / a later migration, never in the same file); `deal` new nullable `paused_until`, `pause_reason`, `outcome_reason` |
| 0007b_deal_state_risk | `deal` new nullable `state_text`, `state_updated_at`; `deal_state_version` (deal, text, reason, source_item_ids text[], topic_ids text[], actor, model, created_at); `deal_risk_type` (platform: pack, code, label_ru, description_ru, trigger_codes text[], clear_codes text[], severity, min_occurrences, condition, reaction_role, stage); `deal_risk_stage_guard` (per org: risk type → allowed stage ids); `deal_risk` (org, deal, risk_type, status `active`\|`cleared`, explanation_ru, trigger_instance_ids text[], source_item_ids text[], occurrences, detected_at, cleared_at, cleared_reason, cleared_by `signal`\|`outcome`\|`user`); enum `deal_risk_status` |
| 0007c_analysis_exclusion | `analysis_exclusion` (org, kind `email`\|`domain`\|`chat`, value, normalized_value, created_by, created_at; unique per org + kind + normalized value) (Q31) |
| later (agency, phase 9) | `deal` new nullable `win_estimate` (smallint 0–100), `win_estimate_by`, `win_estimate_at`, `win_estimate_note` (Q24-9) |
| separate task (roles, Q33) | `member_function`, `contact.relationship_owner_user_id` — not in this plan |
| 0008_llm_usage | `llm_usage` (org, task, model, input / output tokens, cost in RUB, latency ms, ok, error class, item id, created_at); `llm_model_price` (model, price per 1k input / output tokens in RUB, valid from) |
| 0009_work_calendar | `work_calendar_day` (date, is_working, region) |

Cleanup migration (after all orgs run topics, Q8): drop the old card generation paths in code first; then a later contract migration removes `card.accepted` / `card.rejection_reason` and the `card_analysis_scanned_at` / `deal_analysis_scanned_at` stamps (two releases apart, rolling-deploy safe).

Teardown (`src/server/teardown.ts`) must delete topics / topic items / signals that its selected threads produced. `reparseSourceItem` must reset signal columns and detach the item from topics (re-resolution on next run).

---

## 12. Quality: evaluation and metrics

- **Golden set** (decided Q17) for the pilot: ≈ 200 real IN4COM Russian root items, anonymised, plus **synthetic** test messages for rare codes and for every §2.1 example. IN4COM business users review the annotations (codes, subjects, topic groups) and assess the results. Synthetic items carry `synthetic = true`; metrics are reported for real and synthetic items separately, and go-live gates use the real items.
- Metrics:
  - signal precision / recall per code (target precision ≥ 0.85 on P6 / P8 codes, recall ≥ 0.7);
  - topic grouping: pairwise precision / recall on "same topic" pairs (target ≥ 0.9 / ≥ 0.8);
  - over-split rate (one question → several topics) and over-merge rate;
  - card acceptance rate, reject reasons distribution, NOOP rate;
  - **deal state:** share of texts that pass the v2 quality test («Где мы? Чего ждём? Что мешает? Что дальше?») in a human review of ≥ 30 deals (target ≥ 80 %); zero invented facts / dates in the sample; NOOP correctness on unchanged updates;
  - **deal risks:** precision of active risks in a human review (target ≥ 0.8); share of risks cleared with a cited item;
  - cost per 100 items, p95 latency per task.
- Shadow mode: the engine runs and stores topics / cards with `status = shadow`, invisible to users, until the targets are met for the org.
- Evaluation harness: a CLI script runs extraction + resolution on the golden set and prints the metrics; run in CI on prompt or taxonomy changes (with a recorded-response mode to avoid LLM cost).

## 13. Operations

- New AI tasks in `src/server/ai/config.ts` and the JSON configs: `signals`, `topicMatch`, `topicCard`, `dealState` (state text + risk explanations, §9.3–9.4). Each task has its own model setting, so a task can move to another model from the Yandex registry without code changes (decided Q5).
- Engine functions take `organizationId` explicitly (cron-safe). The session wrappers only gate access. Actor for agent writes = a per-org system user («Агент Truffalo», hidden from member lists) **[Q14: decided]**.
- Environments: production, dev and test are **dedicated environments with their own PostgreSQL** (not Vercel / Neon) (Q20). The feature is tested when it is ready and test data exists.
- Scheduling: a new orchestration phase `topics` after upload in `runDailyPipeline`, plus a frequent run (every 15 min) for new items. Note: the CronJob in `deploy/k8s/app/cronjob.yaml` is `suspend: true` today; scheduled runs need it on.
- Start history (Q16): when an org switches to `shadow`, the engine processes items of the **last 7 days**; older items are not processed. Per-run caps: 200 items / org, concurrency 3. Each step is idempotent and resumable via `signal_scanned_at` / `topic_scanned_at`.
- Manual triggers stay: "Обработать" on the Sources page runs parse → upload → signals → topics for one item.
- `pipeline_run` gets counters for the new phases (or a new per-org `topic_run` table).
- Feature flag per org: `topics.enabled` (`off` | `shadow` | `on`).
- Cost guard (Q18): **500 ₽ per org per day** (≈ 5 USD; platform setting, per-org override). Cost = tokens × `llm_model_price`. When the day's cost reaches the cap, LLM steps stop for that org until the next day (deterministic steps continue); the event is logged and shown to the admin.
- Model stats: app-wide and per-org statistics from `llm_usage` (calls, tokens, cost, latency, errors per task / model / day) in admin Settings. Planned as part of this work (phase 0).
- Privacy (Q19: decided): evidence quotes are personal data under 152-ФЗ; they follow the same retention and teardown as source items. No per-person processing restriction in MVP.

## 14. UI (MVP)

- Dashboard: three tabs «Сейчас» / «Сводка» / «Неделя» + «Все темы», the same for all org members, filter «Мои» (Q13). Each item = the topic card.
- Topic detail drawer: title, company, deal link, status, signals with evidence quotes (Russian), timeline (items + events), actions: Принять → задача, Отклонить (reason code), Готово, Отложить до…, Объединить с…, Отвязать сообщение, Привязать к сделке.
- Company page and drawer: «Темы» tab (open + recent).
- Deal drawer: «Темы» tab; the «Происхождение» tab shows real provenance (replaces the mock).
- Deal card (kanban) and deal drawer: «Текущее состояние» text (1–2 sentences) with «Источники»; version history in the drawer (§9.3). Badge «Есть риски» with a hover tooltip (most critical risk only); the drawer lists all active / cleared risks with evidence and the action «Риск снят» (§9.4).
- «Исключения из анализа» (Q31): list of addresses, domains and chats that are never analysed — managed by the **org owner** on the Sources page («Управление источниками организации»).
- Settings → «Модели» (platform admin): LLM usage and cost per app / org / task / model / day; daily cap status per org.
- Settings → «Сигналы» (platform admin only): registry table with filters (pack, block, stage, class), code editor, per-org activation and overrides, per-org stage rules (with the org's funnel stages), **deal risk types and their per-org stage guards**, taxonomy version history, «Экспорт в Markdown» (includes the risk types).
