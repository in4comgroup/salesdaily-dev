# Delivery and push logic

_Generated 2026-11-10T10:05:52.856Z from the live code and database of this deployment._

How a card reaches a person, and which numbers decide it.

## 0. What runs today

- **The attention engine is live** (process `cards.attention`, `refs/app/push-logic.md`): it puts each card on a per-person list (Jetzt · Digest · weekly · Später · 17:00 loop) on the `/dashboard` Fokus page, and the Tagesmail / Wochenliste (process `cards.dailyMail`) mail those lists. It reads the `cards.*` parameters in § 5 (column "Read by"); it never writes `card`.
- **Telegram:** the scheduled `delivery.push` digest — Truffalo Cards → Telegram — and the Friday list `delivery.weekly`. Both are switched per org in § 4. Google Chat delivery is designed, not built.
- **Telegram selection reads `card.priority` only.** `card.delivery_tier` is stored (it orders the digest, marks `silent` and gives the attention engine its band) but no Telegram query filters on it; the immediate Telegram push for `push_critical` is not built.

## 1. From signal to deliverable priority

1. The parser tags signal codes; the server scores the item (MAX of category weights + attributes capped at ±2) and assigns a band.
2. The card takes the band's `priority` and `delivery_tier` (table below). Band `none` makes no card.
3. The dominant code's **block** sets `card.category` (who the card is about) and its **class** sets `card.signal_class` (chance / risk / fyi).
4. A delivery rule sends a card when `priority` ≥ the rule's floor AND (no category filter OR the category is in the list).

| Band | Score | Priority | Delivery tier | Deliverable at default floor (`high`) |
| --- | --- | --- | --- | --- |
| none | 0–0 | silent | silent | no |
| low | 1–3 | silent | weekly | no |
| normal | 4–5 | normal | digest | no |
| high | 6–7 | high | push | yes |
| very_high | 8–9 | critical | push_critical | yes |
| critical | ≥ 10 | critical | push_critical | yes |

**Block → card category:**

| Block | Label | Category |
| --- | --- | --- |
| A | PIPELINE | client_activity |
| B | CONTRACTS & LEGAL | client_activity |
| C | SERVICE EVIDENCE | client_activity |
| D | INVOICE | client_activity |
| E | CLIENT FEEDBACK | client_activity |
| F | MEETINGS & APPOINTMENTS | client_activity |
| G | NEW CONTACT | client_activity |
| H | EXTERNAL MARKET SIGNALS | client_activity |
| I | DELIVERY FAILURE | client_activity |
| J | TEAM SIGNALS (INTERNAL) | colleagues_activity |
| K | ACCOUNT (CRM) | client_activity |
| L | COMPETITORS & PARTNERS | business_info |
| M | INTERNAL (OUR OWN PRICE & PRODUCT) | business_info |
| N | SUPPLIERS & PURCHASING | business_info |

## 2. Card selection per destination (`listDeliverableCards`)

A card is sent to a destination when ALL hold:

- the destination is `enabled` (a discovered chat is only a `candidate` — reachability, never permission) and has an ENABLED card rule;
- the card is `open`;
- `priority` ≥ the rule's `minPriority` (priority order `silent` < `normal` < `high` < `critical`; a stored floor below `normal` is raised to it);
- the card's category is in the rule's list (null = all; categories: `client_activity`, `colleagues_activity`, `business_info`; an empty list matches nothing);
- routing: `owned` = only cards assigned to the chat's bound person; `all` = every card of the org (owner-only, re-checked at run time). No binding → `all`; a binding → `owned`;
- no `sent` / `skipped` ledger row for (destination, card, current episode) — the ledger IS the dedupe, there is no "last pushed at";
- fewer than 2 sent episodes of this card in the last 7 days;
- the subject is not GDPR Art. 18 restricted (such cards are marked skipped).

Oldest first. New rules start at the quietest setting: `{"minPriority":"high","categories":null}`. Turning a rule on writes `skipped/watermark` rows for the existing backlog, so it does not flood the chat.

**Run order** (`runDeliveryPush`): sweep stale `sending` rows (older than 15 min) → destinations → policy check → per-destination cap = min(policy items, remaining org budget) → select → CLAIM the ledger row → send (one header + one message per card; only the header notifies) → settle. `unreachable` / `not_configured` stops that destination; `rate_limited` stops the run.

## 3. Platform delivery policies (`delivery_policy`)

A missing row falls back to `{"allowed":true,"orgConfigurable":true,"maxItemsPerRun":20,"maxMessagesPerRun":500}`. `allowed = false` or `orgConfigurable = false` makes org rows be ignored, never deleted.

| Artifact | Provider | Allowed | Org configurable | Max items / run / destination | Max messages / run | Seeded |
| --- | --- | --- | --- | --- | --- | --- |
| card | telegram | true | true | 20 | 500 | true |

Two caps, not the same number: `automation_setting.max_items` is one budget for the whole run; `delivery_policy.max_items_per_run` caps each destination.

## 4. Per organization — `delivery.push` and enabled destinations

### Ditachmair & Partner

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

### Emre Kücükkaya

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

| Destination | Provider | Address | Min priority | Categories | Routing (resolved) | Routing basis | Locale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Em Re | telegram | …623537 | normal | all | all | derived_unbound | de |

### GEFAS Safety GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

| Destination | Provider | Address | Min priority | Categories | Routing (resolved) | Routing basis | Locale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lmr emm | telegram | …634130 | high | all | all | derived_unbound | de |

### Grundauf DMA GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

### IN4COM

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

### TEST ORG

- `cards.generate`: off · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

### tele.at

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

### truffalo.ai

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

| Destination | Provider | Address | Min priority | Categories | Routing (resolved) | Routing basis | Locale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boris | telegram | …741329 | normal | client_activity | owned | derived_bound | de |
| Seb Gy | telegram | …294136 | normal | all | all | derived_unbound | de |
| lmr emm | telegram | …634130 | high | client_activity | all | derived_unbound | de |

### ÄrzteVerlag GmbH

- `cards.generate`: **enabled** · schedule daily 05:00 UTC · max items 50
- `delivery.push`: off · schedule daily 07:00 UTC · max items 20

_(none)_

## 5. Push parameters (`cards.*` registry)

Resolution ladder: `user_setting` / `client_setting` → `organization_setting` → `platform_setting` → pilot default (pilot orgs, no row anywhere) → code constant. A layer applies only to keys scoped to it. An owner lock is a `user_setting` row with `locked_by_owner = true`. Nothing is seeded; reset deletes the row.

| Key | Label | Kind | Code default | Pilot default | Platform value | Bounds | Scopes | Read by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cards.workingHours` | Working hours | weekHours | `[{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},null,null]` | — | `[{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},{"start":"08:00","end":"18:00"},null,null]` | — | org · user | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the working-day calendar and the Jetzt gate; later every send |
| `cards.dailyPushLimit` | Daily push limit | integer | `3` | — | `3` | {"min":0,"max":20} | org · user | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the 6–7 cap and the 'Mehr (N)' button |
| `cards.digestVisibleItems` | Items per digest page | integer | `5` | — | `5` | {"min":1,"max":20} | org · user | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — page size of the Fokus lists; later the 17:00 and weekly messages |
| `cards.gracePeriodMinutes` | Grace period | integer | `120` | — | `120` | {"min":0,"max":1440} | org · user | push engine — unseen-mail timer below score 8 on the KAM's own mailbox |
| `cards.forgottenAfterHours` | Forgotten after | integer | `48` | — | `48` | {"min":1,"max":336} | org · user | push engine — read-but-no-action timer on risk / chance cards |
| `cards.loopMaxRepeats` | 17:00 question repeats | integer | `3` | — | `3` | {"min":1,"max":10} | org · user | push engine — how many evenings a 17:00 question repeats |
| `cards.surveyCapPerDay` | Ratings per day | nullableInteger | `3` | `null` (off / unlimited) | `3` | {"min":0,"max":20} | org · user | push engine — the rating after a manual Done |
| `cards.morningDigestTime` | Morning digest at | localTime | `07:30` | — | `07:30` | {"min":"05:00","max":"12:00"} | org · user | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the digest build and the 4–5 escalation point, recipient local time |
| `cards.eveningDigestTime` | Evening digest at | localTime | `17:00` | — | `17:00` | {"min":"14:00","max":"20:00"} | org · user | push engine — the 17:00 digest (open loops) |
| `cards.weeklyReview` | Weekly review | weeklySlot | `{"weekday":5,"time":"12:00"}` | — | `{"weekday":5,"time":"12:00"}` | — | org · user | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the 1–3 escalation point; the Telegram weekly review (delivery.weekly) |
| `cards.deadlineImmediateHours` | Immediate below | integer | `24` | — | `24` | {"min":1,"max":72} | org | push engine — grace bypass, cap bypass, immediate delivery |
| `cards.digestActionBufferHours` | Deadline buffer | integer | `3` | — | `3` | {"min":0,"max":24} | org | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the deadline escalation of every band |
| `cards.deadlineLeadDays` | Deadline lead | tierMap | `{"complex":5,"medium":3,"quick":2}` | — | `{"complex":5,"medium":3,"quick":2}` | {"keys":["complex","medium","quick"],"min":0,"max":30,"ordered":true} | org | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — when a dated card returns to the digest (meetings included) |
| `cards.effortTierByCategory` | Effort tier by category | tierAssignment | `{}` | — | `{}` | {"keysSource":"signals.effortCategories","values":["complex","medium","quick"],"defaultValue":"medium"} | org | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — picks the DEADLINE_LEAD tier; the KAM overrides per card via 📅 |
| `cards.offerCountdownDays` | Offer countdown | intList | `[10,5,1]` | — | `[10,5,1]` | {"minLen":1,"maxLen":5,"min":0,"max":60,"descending":true} | org | push engine — the countdown before an offer validity ends |
| `cards.expiryDays` | Card expiry | tierMap | `{"critical":10,"high":7,"normal":5}` | — | `{"critical":10,"high":7,"normal":5}` | {"keys":["critical","high","normal"],"min":1,"max":60,"ordered":false} | org | push engine — the attention engine (cards.attention, src/lib/attention/plan.ts) — the computed expiry, from the deadline or from creation |
| `cards.replyWindowDays` | Reply window | integer | `7` | — | `7` | {"min":1,"max":60} | org · client | push engine — 'offer sent, client silent' without a recognised validity |
| `cards.frameExpiryWindowDays` | Contract-expiry window | integer | `56` | — | `56` | {"min":7,"max":365} | platform only | parser — the contract-expiry date gate |
| `cards.meetingDelayedMinDays` | 'Meeting far out' threshold | integer | `28` | — | `28` | {"min":7,"max":180} | platform only | parser — the 'meeting unusually far out' date gate |
| `cards.revenueGrowthThresholdPct` | Revenue growth threshold | integer | `10` | — | `10` | {"min":1,"max":500} | platform only | CRM recipes gefas_revenue_yoy + buying_pattern (and its presets tele_at_buying_pattern + grundauf_buying_pattern) — when a growth trend is reported |
| `cards.trendCooldownDays` | Trend cooldown | integer | `90` | — | `90` | {"min":7,"max":365} | platform only | CRM recipe runs — the trend repeat rule |
| `cards.dormantMinBestYearEur` | Dormant client: minimum best year | integer | `20000` | — | `20000` | {"min":0,"max":10000000} | platform only | CRM recipe dormant_clients (and its presets tele_at_dormant_clients + grundauf_dormant_clients) — which silent clients count as dormant |
| `cards.rejectReasonRequired` | Reject reason required | boolean | `false` | `true` | `false` | — | org | push engine — whether 'Überspringen' is offered in the reject picker |
| `cards.dailyEmail` | Daily email (Tagesmail) | boolean | `true` | — | `true` | — | org · user | push engine — the Tagesmail (process cards.dailyMail, src/server/attention/daily-mail.ts): does this person get it |
| `cards.weeklyEmail` | Weekly list email (Wochenliste) | boolean | `true` | — | `true` | — | org · user | push engine — the Wochenliste mail (process cards.dailyMail, src/server/attention/daily-mail.ts): does this person get it |

### 5.1 What each parameter means

- **`cards.workingHours`** — Delivery window per weekday, in the recipient's local time. Outside it nothing is pushed; a card waits for the next open window. _Hours. A window shorter than one hour, or a week with no working day, falls back to the default — and every push waits for the next open window._
- **`cards.dailyPushLimit`** — Pushes per local day for cards scoring 6–7. Cards at 8+ are never capped. _Count. At 0 every 6–7 card goes to the digest only; whatever exceeds the limit sits behind the 'Mehr (N)' button._
- **`cards.digestVisibleItems`** — How many cards each list shows at once — morning digest, 17:00 digest and the weekly review. _Count. A higher number makes a longer Telegram message; the rest sits behind 'Mehr'._
- **`cards.gracePeriodMinutes`** — Minutes between a mail arriving in the recipient's own mailbox and the card, while the mail is still unread. _Minutes, below score 8 only. At 0 the card follows the mail immediately, even while the recipient is already reading it._
- **`cards.forgottenAfterHours`** — Hours from reading a mail to the expected action before a risk or chance card is pushed. _Hours. Shorter means more reminders for mail that is being handled; longer means a missed reply is noticed late._
- **`cards.loopMaxRepeats`** — How many evenings an open question repeats in the 17:00 digest before the card expires. _Count. After the last repeat the card expires with no notification._
- **`cards.surveyCapPerDay`** — How many times per local day the 'How was the recommendation?' rating is asked after a manual Done. _Count, or unlimited. Unlimited is the pilot setting — the data is worth more than the quiet._
- **`cards.morningDigestTime`** — When the morning digest is built, in the recipient's local time. _Between 05:00 and 12:00. A time before the working hours start waits for the first open window._
- **`cards.eveningDigestTime`** — When the 17:00 digest with the open loops is built, in the recipient's local time. _Between 14:00 and 20:00. Later than the working hours end means the digest waits until the next day._
- **`cards.weeklyReview`** — Weekday and time of the weekly review list. _A slot outside the working hours is delivered at the next open window._
- **`cards.deadlineImmediateHours`** — A deadline closer than this many hours bypasses the grace period and the daily limit and is pushed at once. _Hours. A high value turns every dated card into an immediate push._
- **`cards.digestActionBufferHours`** — A card moves up one list when its deadline falls before the next delivery point plus this many hours: score 1–3 into the digest, 4–5 into Push, 6–7 into Push without the daily limit. _Hours. 0 = only a deadline before the next delivery point moves a card. A high value moves almost every dated card up._
- **`cards.deadlineLeadDays`** — Working days before a deadline at which a dated card returns to the digest, by effort tier. Meetings included. _Working days. Complex ≥ medium ≥ quick is enforced — a shorter tier is pulled down to the one before it._
- **`cards.effortTierByCategory`** — Which effort tier each signal category takes, and therefore which deadline lead applies to it. _The KAM can still change the tier per card with the 📅 button; this is only the starting value._
- **`cards.offerCountdownDays`** — Working days before an offer's validity ends at which a reminder is sent. _Descending list of 1–5 steps, e.g. 10, 5, 1. Duplicates are merged; removing the last step means no reminder close to the end._
- **`cards.expiryDays`** — Working days until a card expires, by score band — counted from the deadline if it has one, else from creation. _Working days. An expired card leaves the feed with no notification._
- **`cards.replyWindowDays`** — Calendar days we wait for a client's answer to a sent offer when no validity is recognised. _Days. Shorter means 'client silent' cards earlier; a per-client value overrides this one._
- **`cards.frameExpiryWindowDays`** — Calendar days before a framework or annual contract ends in which the parser keeps the signal 'contract expires in <8 weeks'. _Days. Applies to items parsed after the change; stored items keep their verdict._
- **`cards.meetingDelayedMinDays`** — Calendar days after the item beyond which a proposed meeting counts as unusually far out. _Days. Applies to items parsed after the change; stored items keep their verdict._
- **`cards.revenueGrowthThresholdPct`** — Growth against the previous full year, in percent, from which a CRM recipe reports a revenue-growth signal. _Percent. Every decline is reported; growth only from this value._
- **`cards.trendCooldownDays`** — Calendar days after a trend card was closed or expired before the same client and signal may make a new card. _Days. A change of direction always makes a new card at once._
- **`cards.dormantMinBestYearEur`** — The best calendar year a client must have reached, in EUR of booking revenue with us, before a CRM recipe reports that it stopped buying. _EUR. A silent client whose best year stayed below this gets no card._
- **`cards.rejectReasonRequired`** — Whether Reject asks for a reason without offering 'Skip'. _On during the pilot. Off means the reason picker offers 'Skip' and fewer reasons come back._
- **`cards.dailyEmail`** — One email on each working day at the digest time: today's counters, up to 5 cards from Now and 5 from Digest, and a button to the Fokus page. Sent only where the organization's daily email process is switched on. _On/off per person. The organization's process must also be on — during the test period only the system admin can allow an organization._
- **`cards.weeklyEmail`** — On the weekly review slot (Friday 12:00 by default): one email with the low-priority list — cards scoring 1–3 and the cards that expired this week. Keep / Delete stays on the Fokus page. Sent only where the organization's email process is switched on. _On/off per person. Same organization switch as the daily email._

### 5.2 Overrides per organization

| Organization | Key | Org value | User rows | Client rows |
| --- | --- | --- | --- | --- |
| GEFAS Safety GmbH | `cards.workingHours` | — | 1 | — |
