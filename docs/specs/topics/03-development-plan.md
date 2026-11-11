# Topics — development plan

Status: draft for review · 2026-11-10
Spec: [01-specification.md](01-specification.md) · Questions: [02-open-questions.md](02-open-questions.md)

Assumptions: one full-stack developer with AI assistance. **Pilot = IN4COM** (wine / spirits distributor). IN4COM business users give ≈ 3–4 days of expert time: pack workshop, golden-set review, result assessment. Synthetic test messages are allowed. Estimates are working weeks and include tests and migrations. All migrations follow `AGENTS.md` (additive, PG17-tested, applied by the deploy Job).

---

## Overview

| Phase | Name | Weeks | Output | Visible to users |
|---|---|---|---|---|
| 0 | Decisions and foundations | 2 | Remaining answers, IN4COM review of the draft pack, model spike, `llm_usage` + model stats + daily cost cap, golden set started, org-explicit engine skeleton, feature flag | Admin only |
| 1 | Taxonomy and signals registry | 2.5 | Signal tables + seed (`base`, `distribution` on for IN4COM; `agency` seeded, off), RU texts and cues, admin tab «Сигналы» (edit, per-org activation), Markdown export | Admin only |
| 2 | Signal extraction | 2.5 | RU deterministic gates, `signals` AI task, server scoring, storage, eval harness | No (shadow) |
| 3 | Topic engine | 3 | Thread keys, topic tables, resolver (keys + LLM matcher), lifecycle, journal, teardown / reparse | No (shadow) |
| 4 | Attention and cards | 2 | Scoring → profiles, card per topic, continuity, RU card writer | No (shadow) |
| 5 | Deal bridge | 1.5 | Per-org funnel taxonomy + signal stage rules (editor in «Сигналы»), automatic deal creation above threshold + proposals below, journaled moves | No (shadow) |
| 5a | Deal state and risks (requirements v2) | 1.5 | Stored «Текущее состояние» text with history and sources, risk dictionary + rules, «Есть риски» badge and tooltip | No (shadow) |
| 6 | UI and pilot | 2 | «Сейчас / Сводка / Неделя», topic drawer, company / deal tabs, deal state + risk badge on the board, IN4COM switch-on, tuning | **Yes (IN4COM)** |
| **MVP** | | **≈ 17** | | |
| 7 | Delivery | 2 | Daily email digest, then Telegram to staff | Yes |
| 8 | System-of-record signals and watchdogs | 2.5 | Topics from order data first for IN4COM (dormant client by order rhythm, product stopped, YoY); then no-response / countdown / contract expiry | Yes |
| 9 | Agency pack (second pilot, after IN4COM — Q29) | 2 | Maslov codes on with the Q24 rules, 26 agency risks, agency funnel (no go / no-go), area 0 without deals, win estimate fields, golden set | Yes |
| 10 | Orders link | 1.5 | `ORDER_*` topics → order flow («Создать заказ» on topic cards, `ORDER_CONFIRMED` from order status); retire the old «Telegram orders» card rule for IN4COM | Yes |
| 11 | External market signals | 2 | Web search per client / watch list → `external` signal instances → topics (press profile, URL evidence) | Yes |
| 12 | Cleanup of old logic | 1 | Remove old card generation, card rules, name-based deal discovery; later contract migration for old card columns | — |
| ~~13~~ | ~~Functional roles and routing~~ | — | **Moved to a separate task** (Q33): roles, rights, per-recipient lists, P6 daily limit | — |

Phases 2–5 run in **shadow mode**: the engine writes data, users see nothing. Quality gates decide when phase 6 switches an org to `on`.

Critical path: IN4COM review of the draft pack (Q25, incl. the IN4COM risk list Q30) and the phase-0 spike → phases 1–4 in order. Q24 is answered (2026-11-10). Q28–Q34 are answered too. Only the IN4COM pack review is open (`02-open-questions.md` → «Still open»). **Nothing blocks phase 0.**

---

## Phase 0 — Decisions and foundations (2 weeks)

Tasks:
1. Answer the remaining business questions (see «Still open» in `02-open-questions.md`); record them there.
1a. **IN4COM review of the draft pack (Q25):** the business users from Q17 go through [04-distribution-pack-draft.md](04-distribution-pack-draft.md) — codes, importance, boundaries, Russian phrases, which base codes to switch on, the deal types they track, **the IN4COM deal risks (§4, Q30)** — and answer its §3 questions.
2. **Model spike (Q5):** 50 real IN4COM items through `yandex-text` with (a) a full single-pass prompt and (b) a two-pass prompt. Measure: codes found vs a quick manual check, tokens, latency, structured-output failures.
3. Migration `llm_usage` + `llm_model_price` + a wrapper around `generateText` that records task, org, model, tokens, cost in RUB, latency, result. Use it for all existing tasks too (cards, deals, parse) — gives a cost baseline.
3a. **Model stats** (Q18): admin Settings → «Модели» with usage and cost per app / org / task / model / day; daily cost cap per org (default 500 ₽) enforced by the wrapper.
4. Engine skeleton: `src/server/topics/` with functions that take `organizationId` explicitly; session wrappers in API routes only. Per-org system actor user (Q14).
5. Feature flag `topics.enabled` (`off` | `shadow` | `on`) in org settings.
6. Golden set: export ≈ 200 anonymised IN4COM root items; add synthetic messages for rare codes and for every spec §2.1 example (marked `synthetic`); LLM pre-annotation; IN4COM business users review (Q17).

Exit criteria: IN4COM pack list agreed; spike report with a chosen prompt strategy and cost per item; `llm_usage` deployed.

Status (2026-11-11): tasks 3, 3a, 4, 5 are coded (not yet deployed): migration `0003_llm_usage_org_settings` (PG17-tested), metering + daily cap in `src/server/ai/usage.ts` + `src/server/llm-usage.ts`, Settings → «Использование» (usage per org / process / model / day) and «Модели» (prices, markup, caps, Topics flag), `src/server/topics/` (flag, system actor, run context). Prices come automatically every day from the Yandex Billing API (`src/server/llm-pricing.ts`; needs `YANDEX_BILLING_SA_KEY` + `YANDEX_BILLING_ACCOUNT_ID` in `crm-env`); client price = cost + markup (default 50 %), display only. Open: tasks 1 / 1a (business), 2 (spike) and 6 (golden set) need IN4COM data access.

## Phase 1 — Taxonomy and signals registry (2.5 weeks)

Tasks:
1. Migration `0003_signal_taxonomy`: tables and enums from spec §4 / §11.
2. Seed script (idempotent, versioned): `base` pack from Truffalo v204 tables (blocks A–N, with H / J / K / L / M `onHold`), **`distribution` pack from the IN4COM workshop result**, `agency` pack from the Maslov catalog (seeded, off). IN4COM org settings: `base` subset + `distribution` on. Seed data lives in the repo as JSON (`db/seeds/signals/*.json`), reviewed in PRs.
3. Russian texts for every code active for IN4COM: `label_ru`, `definition_ru`, `boundary_ru`, `cues_ru`, `card_note_ru`. Source: the draft pack, Truffalo rules, spec §10.2. Reviewed by IN4COM business users.
4. `family` per code (topic matching).
5. Settings → «Сигналы» tab, **platform admin only** (Q3): registry table with filters, code editor (all §4.2 fields), per-org activation and overrides, taxonomy version bump on save.
6. «Экспорт в Markdown»: the full current registry with all parameters (+ the selected org's activation, overrides and stage rules). Also callable from a script; the export of the seed is attached to the IN4COM review.

Exit criteria: seed loads on an empty PG17 and on the dev copy; IN4COM signs off the RU texts of all codes active for them.

## Phase 2 — Signal extraction (2.5 weeks)

Tasks:
1. Deterministic RU / EN library `src/lib/ru-mail/` with unit tests: quote and forward markers, reply prefixes, bounce, out-of-office (headers + RU cues), calendar replies, money parser (₽, spaces, тыс. / млн, НДС), freemail list, automated sender (token-anywhere).
2. IMAP sync: store `References`; compute `thread_key` for all providers (spec §6.1) — sync / ingest code + a one-off backfill script (out of band, batched).
3. Migration `0004_source_item_signals`.
4. AI task `signals` (config + `AI_TASKS`), prompt builder from the active taxonomy of the org, flat output schema (spec §5.3), Russian prompt.
5. Server post-processing (spec §5.4): validation, evidence check, direction / internal filters, date gates, outranks, scoring, bands; store instances, subjects, facts.
6. Runner `runSignalExtraction({ organizationId, limit })`: eligibility, gates, concurrency 3, idempotent stamp; manual trigger on the Sources page row action; add to `processSourceItem` when the org flag ≠ `off`.
7. **Eval harness** (`scripts/topics/eval.ts`): golden set → metrics per code; recorded-response mode for CI.
8. ~~Prompt A/B: Russian vs English prompt~~ — not needed (Q6 decided: Russian).
9. **Exclusions from analysis** (Q31): migration `analysis_exclusion`; org-owner list «Исключения из анализа» on the Sources page; filter at sync where the provider allows it, else envelope only (no parse, no LLM); gate 3a (spec §5.2).
10. **Forwarded messages** (Q32): Telegram ingest stores `forward_origin`; email forward header parsed; the original sender is the author for signals.
11. No limit on codes per item; semantic dedup; trend D4 ceiling (Q24-6, Q24-12).

Exit criteria: on the golden set, precision ≥ 0.85 for P6 / P8 codes and recall ≥ 0.7 (or the targets agreed in Q23); cost per item within budget.

## Phase 3 — Topic engine (3 weeks)

Tasks:
1. Migration `0005_topics`: `topic`, `topic_item`, `topic_event`, enums.
2. Counterparty resolution to `client_id` (reuse `companyMatchKey`, domains, contact emails); re-link job when discovery creates the client later.
3. Resolver (spec §6.2): hard reference keys → candidate set → AI task `topicMatch` (closed list of ids, copied exactly) → create / attach. Matter families. Title building (legal-form strip).
4. Lifecycle (spec §7): statuses, sub-state `waiting_on_us / waiting_on_them`, closing by state / S1 codes on the same topic, reopen window 14 days, dormant 21 / expire 60 days (daily sweep).
5. Topic score, lead code, class (incl. class by relation from client status / revenue).
6. `topic_event` journal for every change.
7. Integration: `reparseSourceItem` resets signals and detaches; teardown deletes topics produced only by the selected threads; client merge / delete keeps topics consistent.
8. Eval: pairwise topic grouping metrics on the golden set (over-split / over-merge).
9. Internal debug page (admin): topics with items and signals, to review shadow results with the tenant.

Exit criteria: grouping precision ≥ 0.9 / recall ≥ 0.8 on the golden set; all spec §2.1 examples pass as automated tests.

## Phase 4 — Attention and cards (2 weeks)

Tasks:
1. Attention engine (pure functions + tests): band → profile, code profile overrides, deadline escalation, Russian production calendar (migration `0009_work_calendar` + yearly loader), user time zone and working hours, settings ladder (`cards.*` subset).
2. Migration `0006_card_topic`: card columns, `card_status`, unique open card per topic. Write the old `accepted` boolean in parallel (expand / contract).
3. AI task `topicCard` (or reuse `cards` with a new prompt): Russian card writer — headline shape, ≤12 / 20 / 16 words, ≤3 steps, roles not names, `since_last` grounding, continuity NEW / UPDATE / NOOP with copied-exact card id. The LLM never sees the score.
4. Card lifecycle tied to the topic: supersede, close on resolve, expire per profile.
5. Reject reason codes (list) + free text; `decided_at`.

Exit criteria: shadow cards reviewed with the tenant on 2 weeks of real data; duplicate rate (two open cards for one question) < 5 %.

## Phase 5 — Deal bridge (1.5 weeks)

Tasks:
1. Migration `0007_deal_topic`: `deal_activity.source_item_id`, `deal_activity.topic_id`, `deal_activity.rule_id`; deal status `paused` + `deal.paused_until`, `deal.pause_reason`; `topic.deal_id` already exists. UI: «Приостановлена» badge and filter on the deals board; resume action.
2. **Per-org funnel taxonomy (Q21):** `signal_stage_rule` editor in «Сигналы» (effect, target stage of the org, guards: min confidence / score, from-stages, forward-only, requires confirmation, deal type). Rule templates per pack; the admin copies them to an org.
3. IN4COM deal types (agreements / contracts, Q26) and funnel stages; IN4COM rules → IN4COM stage ids. `ORDER_*` codes have no deal effect.
4. Deal rules (Q12 decided, Q27 start values): **automatic deal creation** above the per-org threshold (confidence high, score ≥ 7, client resolved, no open deal of the same type), proposal card below it; «создал агент» badge and undo; forward-only automatic moves via `moveDealStage(actor: 'agent')`; outcomes; risks never move stages. Fix the current gap: LLM stage moves must always write `deal_activity`.
6. Deal drawer «Происхождение» shows real topics and items (replace the mock).

Exit criteria: on shadow data, every auto-created deal and every move has a topic and an evidence quote; IN4COM users agree with ≥ 80 % of auto-created deals and proposals in a review sample (they review all auto-created deals in the first 2 weeks).

## Phase 5a — Deal state and risks (1.5 weeks, requirements v2)

Tasks:
1. Migration `deal_state_risk` (spec §11): `deal.state_text`, `deal.state_updated_at`, `deal_state_version`, `deal_risk_type`, `deal_risk_stage_guard`, `deal_risk`.
2. AI task `dealState` (Russian prompt, spec §9.3): input = deal + linked topics + last ≤ 8 items + active risks + previous text; output UPDATE / NOOP + text + source item ids + risk explanations. Triggers: topic UPDATE, outcome / status change, risk change, «Обновить»; debounce 10 min per deal.
3. Server checks: ≤ 2 sentences / 45 words, generic-phrase stop list, no bare stage name, source ids from the input only. Fixed texts for «Недостаточно информации…», won, lost.
4. Risk engine (pure functions + tests): activation by trigger codes, occurrence count (2nd postponement rule, Q24-3), stage guard, named conditions (key contact linked to the deal, Q24-2), clearing by codes / outcome / user. Parked codes never trigger (Q24-8).
5. Seed: IN4COM risk list (Q30, after the IN4COM review); agency 26 risks seeded, off.
6. Registry: risk types and per-org stage guards in «Сигналы»; Markdown export includes them.
7. Eval: human review of ≥ 30 deal states and all active risks on shadow data (spec §12 targets).

Exit criteria: ≥ 80 % of deal states pass the v2 test «Где мы? Чего ждём? Что мешает? Что дальше?»; no invented facts in the sample; risk precision ≥ 0.8.

## Phase 6 — UI and pilot (2 weeks)

Tasks:
1. Dashboard: «Сейчас» / «Сводка» / «Неделя» + «Все темы», the same for all org members, filter «Мои» (client «Ответственный»). W1 expiry and P6 repeat cap (Q24-4, Q24-5); compact card with ≤ 3 events + «Ещё» (Q24-12).
1a. Deals board and drawer: «Текущее состояние» text + «Источники» + history; «Есть риски» badge with the tooltip (most critical risk); risk list with «Риск снят».
2. Topic drawer (spec §14): signals with evidence, timeline, actions (accept → task, reject, done, snooze, merge, detach item, link to deal).
3. «Темы» tab on company page / drawer and on deal drawer.
4. Scheduling: `topics` phase in `runDailyPipeline` + a frequent run (every 15 min); the CronJob must be switched on (`suspend: true` today). Manual run button for admins as well. On switch to `shadow`, process the last 7 days (Q16).
5. Switch IN4COM from `shadow` to `on`; old Custom-rule cards hidden for IN4COM **except** the «Telegram orders» rule (`new_order` cards keep the order flow until phase 10); other orgs keep the old cards.
6. Weekly tuning loop: reject reasons and missed items → taxonomy cue / boundary edits → new taxonomy version → eval → deploy.

Exit criteria (go-live sign-off): Q23 targets met for 2 consecutive weeks.

## Phase 7 — Delivery (2 weeks, after MVP)

- Daily email digest per user (07:30 local): ≤5 «Сейчас» + ≤5 «Сводка», link to the dashboard.
- Telegram to staff: bind a user to a chat via the org bot, claim-then-send ledger, ≤2 episodes per card per 7 days, backlog watermark on enable, working hours.

## Phase 8 — System-of-record signals and watchdogs (2.5 weeks)

- Topics with origin `system_of_record` (spec §5.6), no source item needed.
- **First, from IN4COM order data** (highest value for a distributor): dormant client (order-rhythm formula), product stopped (bought ≥ N times, not in the last 12 months), revenue YoY decline / growth, reactivation due; trend cooldown 90 days. Data: `order`, `order_item`, `product`.
- Then process-emitted codes on a schedule: offer no-response (reply window 7 days), offer countdown 10 / 5 / 1 working days, contract frame expiry, unanswered follow-ups on `waiting_on_us` topics.
- "Confirmed" rules for absence codes (Q24-11, spec §5.6): originating request, elapsed deadline (default 7 days), all channels checked, no qualifying reply; dormant needs the client's rhythm threshold; trends need window, baseline, minimum data and threshold. Too little data → no instance.

## Phase 9 — Agency pack, second pilot (2 weeks)

- `agency` pack on for the agency org with the Q24 rules (spec §4.3): N7 removed, blocks H and J parked, renewal criteria, trend list.
- The agency org's own funnel (Maslov stages 1–5) and stage rules. **No internal go / no-go** (Q24-7, Q28): a concrete client task creates the opportunity. `withdrawn` outcome set by users.
- Area 0 (Q34): `PROSPECT_*` signals create topics on the client / contact, never a deal; the pre-pipeline stage hidden for this org.
- 26 agency risks on (spec §9.4), with stage guards on the agency stages.
- Migration: `deal.win_estimate*` (Q24-9); UI to enter the estimate (anyone who may edit the deal; «не оценена» when empty).
- Golden set (agency items) and eval; shadow → on.
- Before this phase: the business aligns the v2 funnel text (Q28); Telegram group chats and voice notes (Q32) shipped as separate tasks.

## Phase 11 — External market signals (2 weeks)

- Enable the Yandex Search API service and the `webSearch` AI task in the config.
- Scheduled search per active client (and an admin-managed watch list), deduplicated by URL; the extraction prompt in a `press` profile (market codes only, `about: subject | other`).
- `external` signal instances → normal resolution and attention; trend cooldown per client + code.

## Phase 12 — Cleanup of old logic (1 week)

- Remove Custom-rule card generation (`/api/cards/generate`, Explore / Magic buttons, card rules on `/rules`), name-based `/api/deals/discover`, and their scanned-at stamps in code (Q8).
- Next release: contract migration that drops `card.accepted`, `card.rejection_reason`, `source_item.card_analysis_scanned_at`, `source_item.deal_analysis_scanned_at` (only after no running version reads them).

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| One Yandex model cannot handle the long taxonomy prompt with structured output | Low recall, schema failures | Phase-0 spike; two-pass prompt; active-codes-only prompt; ask for a second model (Q5) |
| Over-merging or over-splitting topics | Lost or duplicate attention | Hard reference keys first; closed-list matcher; eval gates; user merge / detach actions |
| Russian morphology breaks label matching | Duplicate topics | Matching by ids and references, never by title strings |
| No test data when the feature is ready | Quality gates cannot run | Golden set (real + synthetic) prepared in phase 0; IN4COM business users ready for the review (Q17, Q20) |
| Cost growth (extra calls per item) | Budget overrun | `llm_usage` + model stats from phase 0, gates before LLM, daily cap 500 ₽ per org |
| Tenant time for annotation is not available | No quality gates | LLM pre-annotation; small but real set; agree the time before phase 2 (Q17) |
| Two verticals pull the taxonomy in two directions | Slow decisions | Packs: shared `base`, vertical packs separate; one pilot at a time (IN4COM first) |
| IN4COM pack not agreed in time | Phase 1 slips | Draft pack ready now (04-…); workshop in phase 0; start with the codes everyone agrees on, add the rest by taxonomy version |
| Auto-created deals are wrong or noisy | Users stop trusting the funnel | Conservative start threshold; «создал агент» badge + undo; full review of auto-created deals for 2 weeks |
| ~~Business rules in the Maslov doc have gaps (Q24)~~ | — | Answered 2026-11-10; rules in spec §4.3 / §5.6 / §8 / §9 |
| Requirements v2 and the Q24 answers disagree (go / no-go, Q28) | Agency funnel built twice | Spec follows Q24; business aligns the v2 text before phase 9 |
| Deal state text is generic or invents facts | Users ignore it | Server checks (length, stop list, cited sources), NOOP on no change, human review gate in phase 5a |
| Risk badge is noisy | Users ignore it | Deterministic rules with occurrence counts and stage guards; only the most critical risk in the tooltip; precision gate ≥ 0.8 |

## Phase 13 — Functional roles and routing — moved out (Q33)

Functional roles, rights per role and per-recipient routing are a **separate task**, not part of this plan. Input for that task: spec §8.3 (agency role list from v2; relationship owner per contact, pitch lead per deal, no senior-team routing). Topics stores `recipient_role` on codes from the start, so routing can switch on later without a taxonomy change.

## Working rules for the implementation

- Every phase lands behind the org flag; `off` orgs see no change.
- Each migration: reviewed SQL, PG17 test from empty and from the previous schema, manifest entry (see `AGENTS.md` checklist).
- Every LLM change ships with an eval run on the golden set (recorded in the PR).
- No `git commit` / `git push` by the assistant; the user commits and deploys.
