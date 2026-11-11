# Signals taxonomy

_Generated 2026-11-10T10:05:52.856Z from the live code and database of this deployment._

Version 204 · changed 2026-11-02

The parse-time vocabulary: business-signal **categories** (what happened) and **attributes** (how it was said).
Platform-wide — no organization has its own signal rows yet.

- Master: the database dictionary (`signal_block` · `signal_category` · `signal_attribute` · `signal_relation` · `signal_taxonomy_meta`), edited on Settings → Signals. Spec: `refs/signals/spec-db-taxonomy.md`.
- Version stamp on every parsed row and card: **204** (`tax.version`).
- 134 categories in 14 blocks · 26 attributes · 22 relations · 15 retired codes.

## Status summary

Only `active` codes act: the parser prompt offers only parser-emittable codes, and the scorer counts only scoring codes. `onHold`, `gated` and `parked` codes are in the taxonomy and do nothing.

| Status | Categories |
| --- | --- |
| active | 91 |
| onHold | 29 |
| parked | 8 |
| gated | 6 |

| Gate | Categories |
| --- | --- |
| Parser may emit (`isParserEmittable`) | 85 |
| A process may emit (`tax.isProcessEmittable`) | 88 |
| Counts toward a score (`tax.isScoringCode`) | 88 |
| "They asked us to act" (`asksUs` → thread `waiting_on_us`) | 20 |
| Inbound only (`direction = inbound` — never counted on mail WE sent, D29) | 38 |
| Advertising event (`advertisingEvent` — never PR-only for the channels rule, 2026-10-21) | 4 |
| Class table (`classByRelation` — the class by the subject's relation to us) | 19 |

## Scoring model

- Item score = the **highest** scoring category weight (MAX, not SUM) + the attribute sum capped at ±2, floor 0.
- Up to 3 categories are STORED per item; only the dominant one scores.
- Tie-break at equal weight: class order risk > chance > fyi, then dictionary row order (`compareCategoryStrength`).
- A `trend` code is capped at the digest band (`normal`).
- The LLM emits codes + evidence; the SERVER computes the score. An entry with empty evidence is dropped.
- A row keeps the score it was born with — no re-score sweep when the weights change.

| Band | Score from | Score to |
| --- | --- | --- |
| none | 0 | 0 |
| low | 1 | 3 |
| normal | 4 | 5 |
| high | 6 | 7 |
| very_high | 8 | 9 |
| critical | 10 | ∞ |

## Blocks

| Block | Label (EN) | Label (DE) | Audience (`card.category`) | Internal only | First-party only | Block active | Categories | Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | PIPELINE | — | client_activity | — | yes — never offered to the `press` profile | yes | 24 | 19 |
| B | CONTRACTS & LEGAL | — | client_activity | — | yes — never offered to the `press` profile | yes | 3 | 3 |
| C | SERVICE EVIDENCE | — | client_activity | — | yes — never offered to the `press` profile | yes | 4 | 2 |
| D | INVOICE | — | client_activity | — | yes — never offered to the `press` profile | yes | 2 | 2 |
| E | CLIENT FEEDBACK | — | client_activity | — | yes — never offered to the `press` profile | yes | 11 | 10 |
| F | MEETINGS & APPOINTMENTS | — | client_activity | — | yes — never offered to the `press` profile | yes | 7 | 5 |
| G | NEW CONTACT | — | client_activity | — | yes — never offered to the `press` profile | yes | 4 | 4 |
| H | EXTERNAL MARKET SIGNALS | — | client_activity | — | — | yes | 40 | 36 |
| I | DELIVERY FAILURE | — | client_activity | — | yes — never offered to the `press` profile | yes | 1 | 1 |
| J | TEAM SIGNALS (INTERNAL) | — | colleagues_activity | yes — dropped on external items | yes — never offered to the `press` profile | yes | 6 | 0 |
| K | ACCOUNT (CRM) | — | client_activity | — | yes — never offered to the `press` profile | yes | 12 | 5 |
| L | COMPETITORS & PARTNERS | — | business_info | — | — | yes | 16 | 2 |
| M | INTERNAL (OUR OWN PRICE & PRODUCT) | — | business_info | — | yes — never offered to the `press` profile | yes | 2 | 0 |
| N | SUPPLIERS & PURCHASING | LIEFERANTEN & EINKAUF | business_info | — | yes — never offered to the `press` profile | yes | 2 | 2 |

## Categories

Columns: weight · score rule (`fixed` / `state` = never scores, closes cards / `inherited` = takes the score of another card, weight is the default) · class · effort tier · kind · stage · emitted by · € = carries an amount · asks us = counts as a request to us.

### A · PIPELINE

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SALES_TENDER_INVITATION` | Tender invitation | 9 | fixed | chance | complex | event | active | both | yes | yes |
| `CONTRACT_TERMINATED` | Contract terminated | 9 | fixed | risk | — | event | active | both | — | — |
| `SALES_BOOKING_RECEIVED` | Booking received | 8 | fixed | chance | — | event | active | both | yes | — |
| `CONTRACT_FRAME_EXPIRY` | Framework/annual contract expires in <8 weeks | 8 | fixed | risk | — | watchdog | active | both | yes | yes |
| `SALES_BUDGET_CUT` | Budget cut announced | 8 | fixed | risk | — | event | active | both | yes | — |
| `CONTRACT_NOT_RENEWED` | Contract not renewed | 8 | fixed | risk | — | watchdog | onHold | process | — | — |
| `SALES_OFFER_SENT` | Offer sent | 0 | state | — | — | state | active | both | yes | — |
| `SALES_OFFER_NO_RESPONSE` | Offer sent, no response | 7 | fixed | risk | — | watchdog | onHold | process | yes | — |
| `SALES_OFFER_REQUESTED` | Offer/quote requested | 7 | fixed | chance | complex | event | active | both | yes | yes |
| `SALES_BOOKING_CANCELLED` | Booking cancelled | 7 | fixed | risk | — | event | active | both | yes | — |
| `SALES_RENEGOTIATION` | Renegotiation — terms, payment deadline, discount | 7 | fixed | risk | medium | event | active | both | yes | — |
| `SALES_NEW_DEMAND` | New demand — a different service, or more of it | 7 | fixed | chance | medium | event | active | both | yes | — |
| `SALES_BUDGET_INCREASE` | Budget increase announced | 7 | fixed | chance | — | event | active | both | yes | — |
| `CONTRACT_RENEWAL_INTENT` | Renewal raised by the client | 7 | fixed | chance | medium | event | active | both | — | yes |
| `SALES_PRICE_REQUEST` | Price list/terms requested | 6 | fixed | chance | quick | event | active | both | yes | yes |
| `SALES_MATERIAL_REQUESTED` | Concept/mockup/presentation requested | 6 | fixed | chance | complex | event | active | both | yes | yes |
| `SALES_ORDER_CONFIRMATION_REQUESTED` | Order confirmation requested | 6 | fixed | chance | quick | event | active | both | yes | yes |
| `SALES_OFFER_DECLINED` | Offer declined | 6 | fixed | risk | — | event | active | both | — | — |
| `SALES_ORDER_CONFIRMATION_OPEN` | Order confirmation open | 5 | fixed | risk | — | watchdog | onHold | process | yes | — |
| `SALES_ORDER_CONFIRMATION_SENT` | Order confirmation sent | 0 | state | — | — | state | active | both | — | — |
| `SALES_MATERIAL_NO_RESPONSE` | Concept/mockup/presentation sent, no response | 5 | fixed | risk | — | watchdog | onHold | process | yes | — |
| `SALES_PRICE_NO_RESPONSE` | Price list sent, no response | 5 | fixed | risk | — | watchdog | onHold | process | yes | — |
| `SALES_CATALOG_REQUESTED` | Product catalogue requested | 5 | fixed | chance | quick | event | active | both | — | yes |
| `SALES_BUDGET_MENTIONED` | Budget mentioned in communication | 4 | fixed | chance | — | event | active | both | yes | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`SALES_TENDER_INVITATION`** — The client invites us to a tender, or a public tender relevant to us becomes known. With a deadline and an award procedure. _(replaces `SIGNAL_TENDER`)_
- **`CONTRACT_TERMINATED`** — The client actively cancels. Not: the contract simply expires.
- **`SALES_BOOKING_RECEIVED`** — A binding order exists. Not: a mere declaration of intent. Hinweise: Auftragsbestätigung, Bestellung, Order, wir beauftragen, hiermit bestätigen _(replaces `SALES_ORDER_CONFIRM`)_
- **`CONTRACT_FRAME_EXPIRY`** — A framework or annual contract ends in under eight weeks. Watchdog. Hinweise: Rahmenvertrag, Laufzeit, läuft aus, Verlängerung, Kündigung — Enddatum extrahieren
- **`SALES_BUDGET_CUT`** — The client announces a cut to their budget with us. Not: a single booking gets smaller.
- **`CONTRACT_NOT_RENEWED`** — The contract end date has passed with no renewal visible. Watchdog.
- **`SALES_OFFER_SENT`** — State trigger, no score, no colour class — never produces a card by itself. Closes an open SALES_OFFER_REQUESTED card of the same client. The starting point for the watchdog: REPLY_WINDOW and facts.offerValidUntil both start running from here. Hinweise: Angebot, Offerte, Kostenvoranschlag, Quote, Proposal (.pdf/.docx) — von uns versendet _(closes open cards carrying `SALES_OFFER_REQUESTED`)_
- **`SALES_OFFER_NO_RESPONSE`** — An offer was sent, the client has not replied within REPLY_WINDOW — or, where a validity date is known, within the OFFER_COUNTDOWN_STEPS countdown, which then replaces REPLY_WINDOW entirely. Watchdog.
- **`SALES_OFFER_REQUESTED`** — The client asks for an offer for a specific project.
- **`SALES_BOOKING_CANCELLED`** — An order already placed is withdrawn.
- **`SALES_RENEGOTIATION`** — The client wants to reopen existing terms: price, discount, payment terms.
- **`SALES_NEW_DEMAND`** — The client asks for something beyond their existing bookings — a different service or more of the same. Needs the booking history.
- **`SALES_BUDGET_INCREASE`** — The client announces an increase to their budget with us. Not: a single larger booking.
- **`CONTRACT_RENEWAL_INTENT`** — The client raises the renewal on their own.
- **`SALES_PRICE_REQUEST`** — The client asks for prices or terms. A standard reply, not an individual offer. Not: a supplier or manufacturer sending us ITS price list or dealer prices — that is SUPPLIER_PRICE_CHANGE. Hinweise: Preis, Konditionen, Tarif, Kosten, was kostet, Preisliste, Rabatt, Staffel
- **`SALES_MATERIAL_REQUESTED`** — The client asks for a concept, mockup or presentation. Produced individually.
- **`SALES_ORDER_CONFIRMATION_REQUESTED`** — The client requests an order confirmation.
- **`SALES_OFFER_DECLINED`** — The client explicitly declines an offer. Not: they simply don't reply.
- **`SALES_ORDER_CONFIRMATION_OPEN`** — A promised order confirmation has not gone out yet. Watchdog.
- **`SALES_ORDER_CONFIRMATION_SENT`** — State trigger, no score. Closes the open SALES_ORDER_CONFIRMATION_REQUESTED and SALES_ORDER_CONFIRMATION_OPEN cards of the same client. _(closes open cards carrying `SALES_ORDER_CONFIRMATION_REQUESTED`, `SALES_ORDER_CONFIRMATION_OPEN`)_
- **`SALES_MATERIAL_NO_RESPONSE`** — A concept or presentation was sent, no reaction within REPLY_WINDOW. Watchdog.
- **`SALES_PRICE_NO_RESPONSE`** — A price list was sent, no reaction within REPLY_WINDOW. Watchdog.
- **`SALES_CATALOG_REQUESTED`** — The client asks for the product catalogue or overview. Sent, not produced.
- **`SALES_BUDGET_MENTIONED`** — The client names a figure for a specific project. Not: a number with no intent behind it, an invoice amount.

### B · CONTRACTS & LEGAL

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CONTRACT_DPA` | Data-processing agreement / DPA | 4 | fixed | fyi | medium | event | active | both | — | yes |
| `CONTRACT_NDA` | NDA signed | 2 | fixed | fyi | — | event | active | both | — | yes |
| `CONTRACT_COMPLIANCE_DECLARATION` | Compliance declaration requested | 4 | fixed | fyi | quick | event | active | parser | — | yes |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`CONTRACT_DPA`** — A data-processing agreement is requested, sent or signed. Hinweise: DPA, Datenschutzvertrag, AVV, Auftragsverarbeitung, DSGVO-Vereinbarung
- **`CONTRACT_NDA`** — A non-disclosure agreement is signed. A confirmation, not a task. Not: a compliance or self-declaration (sanctions, export control, PPWR, REACH) — that is CONTRACT_COMPLIANCE_DECLARATION. Not: a framework, service or agency contract sent to us to sign. Hinweise: NDA, Geheimhaltung, Vertraulichkeit, Non-Disclosure, Verschwiegenheit — unterzeichnet / signed
- **`CONTRACT_COMPLIANCE_DECLARATION`** — A customer, a public buyer or a tender asks us for a compliance, conformity or self-declaration, or we send one back — sanctions and export control (for example a self-declaration on EU sanctions, an end-use or recipient declaration), packaging (PPWR), REACH / RoHS, a supplier code of conduct, an ESG or sustainability questionnaire. Not: a non-disclosure agreement — that is CONTRACT_NDA. Hinweise: Eigenerklärung, Konformitätserklärung, Sanktionen, Russland-Sanktionen, Endverbleibserklärung, Empfängererklärung, Exportkontrolle, PPWR, Verpackungsverordnung, REACH, RoHS, Lieferantenkodex, Code of Conduct, Nachhaltigkeitsfragebogen, ESG

### C · SERVICE EVIDENCE

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DELIVERY_REPORT_REQUESTED` | Report requested | 6 | fixed | fyi | medium | event | active | both | — | yes |
| `DELIVERY_REPORT_OPEN` | Report open | 4 | fixed | risk | — | watchdog | onHold | process | — | — |
| `DELIVERY_PROTOCOL` | Protocol/meeting minutes | 2 | fixed | fyi | — | event | active | both | — | — |
| `THREAD_DEADLINE_NEAR` | Deadline within two days | 4 | fixed | risk | — | derived | parked | process | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`DELIVERY_REPORT_REQUESTED`** — The client requests a report or a closing report.
- **`DELIVERY_REPORT_OPEN`** — A promised report has not been delivered yet. Watchdog.
- **`DELIVERY_PROTOCOL`** — Minutes or meeting notes arrive from the client. For information. Not: the KAM's own outgoing protocol. Hinweise: Protokoll, Minutes, Gesprächsnotiz, Meeting Notes, Zusammenfassung des Gesprächs
- **`THREAD_DEADLINE_NEAR`** — The earliest open deadline on the thread is at most two days away. Computed by the thread sweep — parked with threads.

### D · INVOICE

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `INVOICE_OVERDUE` | Outgoing invoice open/overdue | 7 | fixed | risk | — | event | active | both | yes | — |
| `INVOICE_PAID` | Outgoing invoice paid | 0 | state | — | — | state | active | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`INVOICE_OVERDUE`** — An outgoing invoice is overdue, or disputed by the client. Hinweise: Mahnung, überfällig, offene Rechnung, Zahlungserinnerung, Fälligkeit überschritten, overdue
- **`INVOICE_PAID`** — State trigger without a score. Closes the open INVOICE_OVERDUE card of the same client. Never produces a card of its own. Hinweise: Rechnung bezahlt, Zahlung eingegangen, Überweisung, Zahlungseingang, paid, settled _(closes open cards carrying `INVOICE_OVERDUE`)_

### E · CLIENT FEEDBACK

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `COMPLAINT_PRICE` | Price/terms | 8 | fixed | risk | — | event | active | both | — | yes |
| `COMPLAINT_ESCALATED` | Escalation to a higher level | 8 | fixed | risk | — | event | active | both | — | yes |
| `COMPLAINT_TIMING` | Timing/delivery delay | 7 | fixed | risk | — | event | active | both | — | yes |
| `COMPLAINT_COMM` | Communication/reachability | 7 | fixed | risk | — | event | active | both | — | yes |
| `COMPLAINT_QUANTITY` | Quantity | 7 | fixed | risk | — | event | active | both | — | yes |
| `COMPLAINT_QUALITY` | Quality/error/complaint (merged) | 7 | fixed | risk | — | event | active | both | — | yes |
| `FEEDBACK_REFERRAL` | Referral | 5 | fixed | chance | — | event | active | both | — | — |
| `FEEDBACK_QUALITY_PRAISE` | Praise for quality | 3 | fixed | fyi | — | event | active | both | — | — |
| `FEEDBACK_COMM_PRAISE` | Praise for communication/account handling | 2 | fixed | fyi | — | event | active | both | — | — |
| `FEEDBACK_PRICE_PRAISE` | Fair terms confirmed | 2 | fixed | fyi | — | event | active | both | — | — |
| `THREAD_UNANSWERED_FOLLOWUP` | Third chase, still unanswered | 3 | fixed | risk | — | derived | parked | process | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`COMPLAINT_PRICE`** — The client complains about price or terms — often with a reference to the competition. Hinweise: zu teuer, Preis nicht akzeptabel, Konkurrenz günstiger, Rabatt gefordert, Nachlass
- **`COMPLAINT_ESCALATED`** — The client brings in a higher level — their boss, or ours, in copy.
- **`COMPLAINT_TIMING`** — The client complains about a delay on our side — response time, delivery time, report time, or similar. Not: a supplier telling us that a delivery TO US is late — that is SUPPLIER_DELIVERY_DELAY. Hinweise: zu spät, Verzug, nicht rechtzeitig, Deadline verpasst, wann kommt, wir warten noch
- **`COMPLAINT_COMM`** — The client complains about reachability or communication. Hinweise: nicht erreichbar, keine Antwort, warte seit Tagen, schlechte Kommunikation
- **`COMPLAINT_QUANTITY`** — The agreed quantity was not delivered. Too little counts as quantity, even when the client calls it a defect. Hinweise: zu wenig, Menge nicht ausreichend, fehlende Stückzahl
- **`COMPLAINT_QUALITY`** — What was delivered is faulty — wrong motif, wrong placement, a technical error. Hinweise: Qualität stimmt nicht, mangelhaft, Mängel, Fehler, falsch, Reklamation, nicht korrekt, Rückgabe _(replaces `COMPLAINT_ERROR`)_
- **`FEEDBACK_REFERRAL`** — The client recommends us further, or names a concrete contact. Hinweise: empfehle euch weiter, Empfehlung, ich habe von euch erzählt, referral, recommend
- **`FEEDBACK_QUALITY_PRAISE`** — The client praises the work. No action needed. Hinweise: sehr gut, ausgezeichnet, top Qualität, wir sind begeistert, hervorragend, exzellent
- **`FEEDBACK_COMM_PRAISE`** — The client praises the account handling or communication. No action needed. Hinweise: gute Betreuung, super Kommunikation, immer erreichbar, schnelle Antwort
- **`FEEDBACK_PRICE_PRAISE`** — The client confirms the terms as fair. No action needed. Hinweise: faire Preise, gutes Preis-Leistungs-Verhältnis, Konditionen passen, zufrieden mit Preis
- **`THREAD_UNANSWERED_FOLLOWUP`** — The client has chased us two or more times on the thread and we have not replied. Computed by the thread sweep — parked with threads.

### F · MEETINGS & APPOINTMENTS

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MEETING_CANCEL` | Cancellation with no new date | 7 | fixed | risk | — | event | active | both | — | — |
| `MEETING_URGENT` | Unusually soon | 6 | fixed | chance | quick | event | active | both | — | yes |
| `MEETING_URGENT_ISSUE` | Unusually soon, unresolved issue | 7 | fixed | risk | quick | event | active | both | — | — |
| `MEETING_NEW_STAKEHOLDER` | New stakeholder in a meeting | 5 | fixed | chance | — | event | active | both | — | — |
| `MEETING_DELAYED` | Unusually far out | 4 | fixed | risk | — | event | active | both | — | yes |
| `MEETING_SLOW` | Scheduling dragging on | 5 | fixed | risk | — | derived | parked | process | — | — |
| `MEETING_KEY_MISSING` | Key person missing | 5 | fixed | risk | — | derived | parked | process | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`MEETING_CANCEL`** — The client cancels a meeting without proposing a new one. Hinweise: Termin abgesagt, cancellation, cancel, Absage — ohne neuen Terminvorschlag
- **`MEETING_URGENT`** — The client wants a meeting unusually soon. Hinweise: sofort, heute noch, so schnell wie möglich, noch diese Woche — aus Interesse
- **`MEETING_URGENT_ISSUE`** — The client wants a meeting unusually soon because something is missing or not working — not interest, a problem.
- **`MEETING_NEW_STAKEHOLDER`** — A previously unknown person on the client side is invited to, or attends, a meeting. Hinweise: neuer Teilnehmer im Invite oder im Termin, der bisher nicht dabei war
- **`MEETING_DELAYED`** — The client proposes a meeting unusually far in the future. Hinweise: Terminvorschlag mehr als 4 Wochen in der Zukunft — Datum extrahieren
- **`MEETING_SLOW`** — Several cancellations or reschedules on the thread, no date found. Computed by the thread sweep — parked with threads.
- **`MEETING_KEY_MISSING`** — The known main contact is no longer among the attendees of a recurring meeting. Needs a calendar source — parked.

### G · NEW CONTACT

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CONTACT_LEAVING` | Contact is leaving the company | 7 | fixed | risk | — | event | active | both | — | — |
| `CONTACT_NEW_DECISION_MAKER` | New decision-maker | 6 | fixed | chance | — | event | active | both | — | — |
| `CONTACT_NEW_KNOWN_ORG` | New contact at a known company | 4 | fixed | chance | — | event | active | both | — | — |
| `CONTACT_OOO` | Contact out of office, with a deputy | 4 | fixed | risk | — | event | active | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`CONTACT_LEAVING`** — The contact is leaving the company — a farewell mail or an announcement.
- **`CONTACT_NEW_DECISION_MAKER`** — A person with decision authority newly enters the communication.
- **`CONTACT_NEW_KNOWN_ORG`** — A new contact person at an existing client.
- **`CONTACT_OOO`** — An out-of-office reply from the contact, usually naming a deputy and a return date.

### H · EXTERNAL MARKET SIGNALS

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SIGNAL_INSOLVENCY` | Crisis/insolvency | 9 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_DOWNSIZING` | Site closure/layoffs | 6 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_AGENCY_CHANGE` | Change of ad/PR agency | 6 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_NEGATIVE_PRESS` | Crisis PR/shitstorm | 6 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_NEW_MARKETING_LEAD` | New marketing/brand leadership | 5 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_MERGER` | Acquisition/merger | 5 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_COMPETITOR` | Competitor activity | 5 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_SPEND_UP` | Relevant spend rises significantly | 5 | fixed | chance | — | event | onHold | process | — | — |
| `SIGNAL_SPEND_DOWN` | Relevant spend falls significantly | 5 | fixed | risk | — | event | onHold | process | — | — |
| `SIGNAL_NEW_TOP_SPENDER` | New top spender/new entrant | 5 | fixed | chance | — | event | onHold | process | — | — |
| `SIGNAL_PRODUCT_NEWS` | Product news — launch, relaunch, facelift, reissue | 5 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_EXPANSION` | Expansion/new location | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_FUNDING` | Funding round | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_C_LEVEL_CHANGE` | C-level change | 4 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_REBRANDING` | Rebranding/name change | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_STRATEGY_ANNOUNCEMENT` | Strategy announcement | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_CHANNEL_SHIFT` | Channel shift (print to digital) | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_PRODUCT_DISCONTINUED` | Product discontinued | 4 | fixed | risk | — | event | active | both | — | — |
| `SIGNAL_NEW_COMPANY` | New company founded | 3 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_TRADEMARK` | Trademark/domain registration | 3 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_JOB_POSTING` | Relevant role advertised | 3 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_EVENT` | Event participation (past) | 3 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_IPO` | IPO | 3 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_ANNIVERSARY` | Anniversary with communication | 5 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_SPONSORING` | Sponsoring engagement | 3 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_CONTACT_QUIET` | Communication tailing off | 3 | fixed | fyi | — | trend | parked | both | — | — |
| `SIGNAL_INDUSTRY_TREND` | Industry trend/regulation | 2 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_RESULTS_POSITIVE` | Results positive | 3 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_RESULTS_NEGATIVE` | Results negative | 3 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_AWARD` | Award | 2 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_PARTNERSHIP` | Partnership | 3 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_AD_ACTIVITY` | Campaign running or ending | 4 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_ACCOUNT_WIN` | Account win (agency client) | 5 | fixed | chance | — | event | active | both | yes | — |
| `SIGNAL_OPERATIONS_INVESTMENT` | Investment in own operations | 2 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_STRATEGY_CONTEXT` | Strategy context (conversation starter) | 2 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_TRACKING_VENDOR_CHANGE` | Tracking agency / vendor change | 5 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_TRACKING_GAP` | Tracking gap on the website | 4 | fixed | chance | — | event | active | process | — | — |
| `SIGNAL_CAMPAIGN_PLANNED` | Campaign planned | 5 | fixed | chance | — | event | active | both | — | — |
| `SIGNAL_ANNIVERSARY_PLAIN` | Anniversary (no communication) | 2 | fixed | fyi | — | event | active | both | — | — |
| `SIGNAL_EVENT_UPCOMING` | Event participation (upcoming) | 3 | fixed | chance | — | event | active | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`SIGNAL_INSOLVENCY`** — Insolvency proceedings, a payment freeze, or restructuring. Not: bad press. Not: an item that reports that a buyer takes over or rescues the brand or business of an insolvent company — that is SIGNAL_MERGER for the buyer, and the insolvency is context on that item, not a code. Still this code when the item is about the company's OWN insolvency and a takeover is only mentioned. Hinweise: Insolvenzantrag, Insolvenzverfahren eröffnet, Konkurs, Zahlungsunfähigkeit, Sanierungsverfahren beantragt, Zahlungsstopp. NOT this code when the item reports the RESCUE or takeover out of an insolvency — 'rettet', 'übernimmt', 'Sanierungsplan angenommen', 'Fortführung gesichert' — that is SIGNAL_MERGER. A buyer that takes over the brand or business of an insolvent company: SIGNAL_MERGER for the buyer, and the insolvency is context on that item, never a second code. Still this code when the item is about the company's OWN insolvency and a buyer or takeover is only mentioned as a possibility.
- **`SIGNAL_DOWNSIZING`** — A site closure or layoffs at the client.
- **`SIGNAL_AGENCY_CHANGE`** — An advertiser reviews or moves its advertising, media or PR account (Etat): it puts the account out to pitch or tender ('schreibt den Etat aus', 'der Pitch läuft', 'sucht eine neue Agentur'), parts with its agency ('Agentur X ist raus'), or announces the new agency after a pitch. When the item names the winning agency, ALSO emit SIGNAL_ACCOUNT_WIN. When the agency that lost the account is OUR competitor and the advertiser is not our client, emit COMPETITOR_LOST_CLIENT instead. Not a new campaign by the existing agency (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY), and not a first appointment with no pitch and no previous agency (that is SIGNAL_ACCOUNT_WIN alone). Hinweise: schreibt den Etat aus, schreibt den Mediaetat neu aus, Etat-Ausschreibung, Pitch läuft, startet einen Pitch, Agentur-Pitch, sucht eine neue Agentur, stellt den Etat auf den Prüfstand, Agenturwechsel, wechselt die Agentur, trennt sich von der Agentur, ist raus, verliert den Etat, Pitch-Entscheidung. When the article names the agency that held the account UNTIL NOW (the incumbent: 'betreute bisher', 'bisherige Agentur', 'Bestandsagentur') — also in a tender ('schreibt neu aus', 'Neuausschreibung') — give this code to that agency's subject too, not only to the advertiser: each side is its own matter.
- **`SIGNAL_NEGATIVE_PRESS`** — Criticism, a shitstorm, or negative coverage. The company keeps operating. Also a product recall or a safety warning naming the company.
- **`SIGNAL_NEW_MARKETING_LEAD`** — New leadership for marketing, brand or communications — the position that decides on our business. Hinweise: NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- **`SIGNAL_MERGER`** — Control changes: acquisition, merger, majority stake. Hinweise: Übernahme, übernimmt, kauft, Fusion, fusioniert, Zusammenschluss, Mehrheitsbeteiligung, Mehrheit übernommen. Also a takeover of the brand or business OUT OF an insolvency (Sanierung, Rettung) — 'rettet', 'übernimmt die insolvente', 'Sanierungsplan angenommen', 'Fortführung gesichert': this code for the buyer; the insolvency is context on that item, not SIGNAL_INSOLVENCY.
- **`SIGNAL_COMPETITOR`** — A competitor becomes visible at the client. Without a link to the client it is not a signal.
- **`SIGNAL_SPEND_UP`** — The client's spend in a category relevant to us rises significantly — independent of their budget with us.
- **`SIGNAL_SPEND_DOWN`** — The client's spend in a category relevant to us falls significantly — independent of their budget with us.
- **`SIGNAL_NEW_TOP_SPENDER`** — A company appears in the market with high ad spend and is not yet a client.
- **`SIGNAL_PRODUCT_NEWS`** — A new product, relaunch, facelift, reissue, or range extension that the company SELLS. Not: goods the company buys for its own operations (vehicles for its fleet, machines, IT) — that is SIGNAL_OPERATIONS_INVESTMENT. Not: a product data sheet, technical sheet, certificate, declaration of conformity, manual, price list or catalogue page sent with an offer, an order or a request — that is information about an existing product, no event. Hinweise: neues Produkt, neues Angebot, neue Dienstleistung, Launch, Relaunch, Facelift, Neuauflage, Sortimentserweiterung, neues Programm für Firmenkunden (z. B. betriebliche Gesundheitsförderung). A new service or offer line counts too, also one for business customers.
- **`SIGNAL_EXPANSION`** — A new location, a new market or growth with headcount increase — a new store, branch, site or market entry, or new staff for one. 🔴 Only in the country or region the item's market is about: a new plant, site, store or market ABROAD is NOT this code — e.g. an Austrian retailer opening stores in Romania, an Austrian company building sites in Germany, an agency unit in Switzerland, a factory in Italy reported by an Austrian outlet. Emit nothing for such an expansion; other news in the same item keeps its own code. The card system also checks the place against the regions in the organization profile. Hinweise: neuer Standort, eröffnet, Filiale, Niederlassung, Markteintritt, expandiert nach, baut aus, stellt ein, neue Arbeitsplätze. NOT this code for a site, plant, store or market in ANOTHER country than the one the item reports for (Rumänien, Deutschland, Schweiz, Italien … in an Austrian outlet) — then emit no expansion code at all. NOT this code: general growth talk without a named new site in our regions ('mehr räumliche Präsenz', 'Wachstumsstrategie', 'will expandieren'). IS this code: a completed housing or building project that is now for sale or to let (a new site that has to be marketed).
- **`SIGNAL_FUNDING`** — A funding round, or a new stake, without control changing. _(replaces `SIGNAL_NEW_INVESTOR`)_
- **`SIGNAL_C_LEVEL_CHANGE`** — A change in leadership outside marketing — CEO / Geschäftsführung, CFO, COO, CTO, HR, head of sales (Vertrieb), the managing director of a division or business unit (e.g. 'Geschäftsführung Gastronomie'), or a board or presidium seat (Vorstand, Aufsichtsrat, Präsidium). A new head of marketing, brand or communications is SIGNAL_NEW_MARKETING_LEAD instead. Not: a change that took effect more than 6 months before the item's own date. Hinweise: neuer CEO, neue Geschäftsführerin, neuer Geschäftsführer, übernimmt die Geschäftsführung, Vorstand, Vorstandsvorsitz, CFO, Finanzvorstand, COO, CTO, Personalchef, verstärkt das Führungsteam, Vertriebsleiterin, Vertriebsleiter, Leitung Vertrieb, Head of Sales, Geschäftsführung einer Sparte oder eines Bereichs (z. B. Geschäftsführung Gastronomie), Bereichsleitung, Spartenleitung, Präsidium, Präsidentin, Präsident, Aufsichtsrat. NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- **`SIGNAL_REBRANDING`** — A new name, new logo or new brand identity — or a new or relaunched website (including a move to a new CMS), which also has to be made known. Hinweise: neuer Markenname, neues Logo, Rebranding, neuer Markenauftritt, Corporate Design, Website-Relaunch, neue Website, Relaunch, neues CMS, Umstellung auf
- **`SIGNAL_STRATEGY_ANNOUNCEMENT`** — A strategic direction decision with a NAMED marketing, communication, advertising or budget consequence — a new communication or brand strategy, a repositioning, a marketing budget raised or cut — but no concrete action yet. Catch-all for such decisions: fires only when no more specific H-category applies. Not: a strategic statement without such a consequence (production, plants, organisation, an interview about the business) — that is SIGNAL_STRATEGY_CONTEXT. Not: budget moving between channels — that is SIGNAL_CHANNEL_SHIFT. Hinweise: neue Kommunikationsstrategie, Markenstrategie, Neupositionierung, Marketingbudget erhöht, Werbebudget gekürzt, Budget wird überprüft, mehr in Marke investieren
- **`SIGNAL_CHANNEL_SHIFT`** — Budget shifts between advertising or marketing channels while the total stays about the same (from print to digital, from TV to social).
- **`SIGNAL_PRODUCT_DISCONTINUED`** — The client takes a product off the market. The ad budget for it disappears.
- **`SIGNAL_NEW_COMPANY`** — A company is newly founded.
- **`SIGNAL_TRADEMARK`** — A trademark or domain is registered. An early indicator.
- **`SIGNAL_JOB_POSTING`** — A role relevant to us is advertised.
- **`SIGNAL_EVENT`** — The company took part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event is OVER, or the item gives no date for it. An event that takes place AFTER the item's own date is SIGNAL_EVENT_UPCOMING. Hinweise: war vertreten, präsentierte auf, stellte aus, Rückblick, nahm teil, auf der Messe gezeigt. NOT this code when the event is still to come ('wird ausstellen', 'ist vertreten auf der kommenden', a date after the item's date) — that is SIGNAL_EVENT_UPCOMING.
- **`SIGNAL_IPO`** — An IPO, or its announcement.
- **`SIGNAL_ANNIVERSARY`** — A company anniversary that the company COMMUNICATES — the item names a campaign, special products or editions, an event, promotions or advertising around it. An anniversary with no such communication named is SIGNAL_ANNIVERSARY_PLAIN. Hinweise: Jubiläum mit Kampagne, Jubiläumskampagne, Jubiläumsedition, Sondermodell, Sonderedition, Jubiläumsaktion, Jubiläumsfest, feiert mit Aktionen, zum Jubiläum gibt es. NOT this code when the item only reports the anniversary ('feiert 50 Jahre', 'besteht seit 100 Jahren') with no campaign, product, event or promotion — that is SIGNAL_ANNIVERSARY_PLAIN.
- **`SIGNAL_SPONSORING`** — The client engages as a sponsor.
- **`SIGNAL_CONTACT_QUIET`** — Communication with the client noticeably tails off. Needs a baseline — parked 25.9.
- **`SIGNAL_INDUSTRY_TREND`** — Regulation or an industry development with a nameable consequence for the client.
- **`SIGNAL_RESULTS_POSITIVE`** — Published figures moving in a positive direction. Needs a number and a comparison period. _(replaces `SIGNAL_SALES_UP`)_
- **`SIGNAL_RESULTS_NEGATIVE`** — Published figures moving in a negative direction. Needs a number and a comparison period. _(replaces `SIGNAL_SALES_DOWN`)_
- **`SIGNAL_AWARD`** — An award or prize the company receives.
- **`SIGNAL_PARTNERSHIP`** — The client enters a cooperation or partnership with a third party — a joint campaign, a joint venture, a distribution deal. Not a change of control (that is SIGNAL_MERGER). Hinweise: Kooperation, Partnerschaft, Zusammenarbeit, Joint Venture, gemeinsam mit, kooperiert
- **`SIGNAL_AD_ACTIVITY`** — The company is visibly running paid advertising NOW, or a campaign is about to end — a campaign seen in a medium or an ad library, a spot on air, a current affiliate programme. A hint that a marketing budget exists, NOT a measured spend and NOT a competitor at the client (that is SIGNAL_COMPETITOR). A campaign that is announced or planned and has NOT started yet is SIGNAL_CAMPAIGN_PLANNED. Hinweise: läuft, ist gestartet, aktuelle Kampagne, schaltet, ist zu sehen, on air, Spot, Anzeige, Affiliate-Programm, endet, nur noch bis. NOT this code when the campaign starts AFTER the item's date ('plant', 'startet im …', 'ab März', 'wird gelauncht') — that is SIGNAL_CAMPAIGN_PLANNED. NOT this code: a yearly marketing budget or ad-spend figure in a financial report or results article ('investierte 3,2 Milliarden Euro in Marketing') — that is part of the results, not a running campaign.
- **`SIGNAL_ACCOUNT_WIN`** — An agency wins an advertiser's account, budget (Etat) or pitch, and the item names the winner: 'X gewinnt den Etat von Y', 'Y setzt auf Agentur X', 'der Etat geht an X', 'X betreut künftig Y'. Emit it when the subject is the agency OR the advertiser — it is one event seen from either side. When the award replaces a previous agency or ends a pitch, ALSO emit SIGNAL_AGENCY_CHANGE. When the winning agency is OUR competitor, emit COMPETITOR_NEW_CLIENT instead. Not the advertiser's own campaign (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY). Never an order placed with us. Hinweise: Etatgewinn, gewinnt den Etat, gewinnt den Pitch, Pitch gewonnen, holt sich den Etat, Etat geht an, Media-Etat geht an, setzt auf (Agentur), setzt künftig auf, betreut künftig, übernimmt die Betreuung, neue Lead-Agentur
- **`SIGNAL_OPERATIONS_INVESTMENT`** — A company buys goods or services for its OWN operations — vehicles for its fleet, logistics, machines, IT, buildings or energy — with no new product, no new location for customers and no marketing budget named. One event seen from two sides: the buyer invests, the supplier wins the order; emit it when the subject is either party. Not a new product or range (that is SIGNAL_PRODUCT_NEWS), not a new site or market (SIGNAL_EXPANSION), not a cooperation (SIGNAL_PARTNERSHIP). Hinweise: investiert in, schafft an, Anschaffung, neue Lkw, E-Lkw, Fuhrpark, Flotte, Logistikzentrum, Zentrallager, modernisiert, stellt um auf, liefert an, erhält den Auftrag, Großauftrag
- **`SIGNAL_STRATEGY_CONTEXT`** — A company's strategic statement, plan or debate WITHOUT a named marketing, communication or budget consequence — production sites and plants, organisation, a market outlook, an interview about the business. Worth knowing for the next conversation, not a sales trigger. When a marketing, communication, advertising or budget consequence IS named, it is SIGNAL_STRATEGY_ANNOUNCEMENT (or SIGNAL_CHANNEL_SHIFT). Not: a product data sheet, a specification, a tender document or an offer — those are no strategy statement. Hinweise: Interview, Strategie, Ausrichtung, Standortfrage, Werke, Produktion, Standortdebatte, Zukunftspläne, Marktausblick, Restrukturierung ohne Abbau
- **`SIGNAL_TRACKING_VENDOR_CHANGE`** — A company changes the performance-marketing or tracking agency that runs its web analytics and campaign tracking, OR replaces an external tracking / tag tool it relies on with another of the same kind: tag manager, web analytics, consent / cookie-banner tool, ad pixels or conversion tracking (for example Google Tag Manager → Tealium, Cookiebot → Usercentrics). A technology scan that shows one such tool gone and another in its place counts. Not: an advertising, media or PR agency change (that is SIGNAL_AGENCY_CHANGE). Not: a tool added beside the existing one, or a whole new website (that is SIGNAL_REBRANDING). Hinweise: neue Performance-Agentur, Performance-Marketing-Agentur, Tracking-Agentur, wechselt den Tracking-Anbieter, Umstellung des Trackings, Server-Side-Tracking, neues Consent-Management, neuer Cookie-Banner, Consent Management Platform, Wechsel des Tag-Managers, Google Tag Manager, Matomo statt Google Analytics, Umstieg auf GA4, betreut künftig das Tracking, Webanalyse übernimmt
- **`SIGNAL_TRACKING_GAP`** — A company's website shows no web analytics (no GA4 or other analytics) and / or no consent tool (no cookie-banner / consent-management platform, so no Consent Mode v2), found by a technology scan on two scans in a row. A reason to offer a tracking set-up. Set only by the deterministic website scan, never read from text.
- **`SIGNAL_CAMPAIGN_PLANNED`** — The company announces or plans a campaign, a launch communication or a media plan that has NOT started yet — a start date after the item's own date, a pitch or tender for a campaign, 'plant', 'startet im …', 'ab März'. The budget for it is not yet placed. A campaign that is already running or about to end is SIGNAL_AD_ACTIVITY. A new product on its own is SIGNAL_PRODUCT_NEWS; emit both when the item names the planned launch campaign. Not a competitor at the client (that is SIGNAL_COMPETITOR). Hinweise: plant eine Kampagne, Kampagne geplant, startet im Herbst, ab März, wird gelauncht, Launch-Kampagne, Kampagnenstart, Mediaplanung für, schreibt die Kampagne aus, sucht Agentur für die Kampagne, Jubiläumskampagne geplant, Kampagne in Produktion, wird gerade produziert, Dreh, startet demnächst, kommt in Kürze. NOT this code when the campaign is already running or ends soon ('läuft', 'ist gestartet', 'aktuelle Kampagne', 'endet') — that is SIGNAL_AD_ACTIVITY. A campaign that is being PRODUCED or starts soon has NOT started yet — it is this code.
- **`SIGNAL_ANNIVERSARY_PLAIN`** — A company anniversary that the item only reports — no campaign, no special products or editions, no event, no promotion named. Good to know for a client; nothing to act on. An anniversary WITH such communication is SIGNAL_ANNIVERSARY. Hinweise: feiert … Jahre, Jubiläum, besteht seit, wird 50, Firmenjubiläum, Gründung vor — with NO campaign, product, event or promotion named for it.
- **`SIGNAL_EVENT_UPCOMING`** — The company WILL take part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event takes place after the item's own date. A past event, or one with no date, is SIGNAL_EVENT. Hinweise: wird ausstellen, ist vertreten auf, präsentiert auf der kommenden, Aussteller auf, spricht auf, Messeauftritt geplant, Termin der Messe after the item's date.

### I · DELIVERY FAILURE

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MAILERDEMON_RECEIVED` | Mail undeliverable | 5 | inherited | risk | quick | event | active | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`MAILERDEMON_RECEIVED`** — A mailer-daemon / bounce-back notification comes back for a mail the KAM sent to a client. Inherits the score of the open card of the bounced mail; 5 when there is none.

### J · TEAM SIGNALS (INTERNAL)

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TEAM_HANDOVER` | Account handover / KAM change | 7 | fixed | fyi | — | event | gated | both | — | — |
| `TEAM_ESCALATION` | Escalation, internal | 6 | fixed | risk | — | event | gated | both | — | — |
| `TEAM_INSIDER` | Insider knowledge about a client | 5 | fixed | fyi | — | event | gated | both | — | — |
| `TEAM_DEAL_LOST` | Deal lost, with reason | 5 | fixed | risk | — | event | gated | both | — | — |
| `TEAM_CAPACITY` | Capacity problem / cover | 4 | fixed | risk | — | event | gated | both | — | — |
| `TEAM_DEAL_WON` | Deal won (similar client) | 3 | fixed | chance | — | event | gated | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`TEAM_HANDOVER`** — A colleague hands over an account, or a KAM leaves and a successor takes over their clients. Not negative by nature. Hinweise: Übergabe, KAM-Wechsel, übernimmt den Account, Verantwortung wechselt
- **`TEAM_ESCALATION`** — A colleague escalates a client matter internally, without the KAM being informed. Hinweise: Eskalation, Problem mit Kunden, brauche Hilfe, Kunde unzufrieden — intern
- **`TEAM_INSIDER`** — A colleague's message reveals something about a client the KAM does not yet know. Neutral by nature. Hinweise: intern geteilte Information über einen Kunden, die nicht in der Email steht
- **`TEAM_DEAL_LOST`** — A colleague reports a lost deal with a similar client, with the reason. Hinweise: verloren, nicht bekommen, Absage erhalten — Grund extrahieren wenn vorhanden — intern
- **`TEAM_CAPACITY`** — A colleague is unavailable and needs cover, or announces one. Hinweise: krank, Urlaub, nicht verfügbar, Vertretung — intern
- **`TEAM_DEAL_WON`** — A colleague reports a won deal with a similar client. Hinweise: Deal gewonnen, Auftrag erhalten, wir haben zugeschlagen — intern

### K · ACCOUNT (CRM)

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ACCOUNT_REVENUE_STAGNATION` | Revenue stagnation | 5 | fixed | risk | — | trend | onHold | process | — | — |
| `ACCOUNT_REVENUE_DECLINE_YOY` | Revenue decline (YoY) | 5 | fixed | risk | — | trend | active | process | — | — |
| `ACCOUNT_DORMANT` | Client stopped buying | 5 | fixed | risk | — | watchdog | active | process | — | — |
| `ACCOUNT_PRODUCT_NEW` | New product purchased | 4 | fixed | chance | — | event | onHold | process | — | — |
| `ACCOUNT_PRODUCT_STOPPED` | Product purchase stopped | 5 | fixed | risk | — | trend | active | process | — | — |
| `ACCOUNT_REVENUE_GROWTH_YOY` | Revenue growth (YoY) | 4 | fixed | chance | — | trend | active | process | — | — |
| `ACCOUNT_CROSS_SELL_GAP` | Cross-sell gap | 4 | fixed | chance | — | trend | parked | process | — | — |
| `ACCOUNT_MEETING_OVERDUE` | Meeting overdue for client segment | 4 | fixed | risk | — | trend | onHold | process | — | — |
| `ACCOUNT_SEGMENT_UPGRADED` | Client segment upgraded | 4 | fixed | chance | — | event | parked | process | — | — |
| `ACCOUNT_SEGMENT_DOWNGRADED` | Client segment downgraded | 5 | fixed | risk | — | event | parked | process | — | — |
| `ACCOUNT_NEW_FOLLOWUP` | New client, first-order follow-up | 4 | fixed | chance | — | event | onHold | process | — | — |
| `ACCOUNT_REACTIVATION_DUE` | Reactivation due — no contact for months | 4 | fixed | chance | quick | watchdog | active | process | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`ACCOUNT_REVENUE_STAGNATION`** — Annual revenue dropped by at least STAGNATION_THRESHOLD in at least one of the last 3 years.
- **`ACCOUNT_REVENUE_DECLINE_YOY`** — Revenue over the last 12 months is below the same period one year ago. Leads over ACCOUNT_REVENUE_STAGNATION when both fire.
- **`ACCOUNT_DORMANT`** — The client bought from us before (best year at least DORMANT_MIN_BEST_YEAR) and did not book inside its OWN rhythm, with nothing booked ahead. Rhythm: 3 or more bookings → the average gap between them; 2 bookings → that one gap; 1 booking → 12 months; never shorter than 3 months. A pause longer than the rhythm = we may be losing the client (Risk); longer than twice the rhythm = gone quiet, no urgent risk (the card is FYI). Watchdog: one card per client and last booking. Not: a client that only books less — that is ACCOUNT_REVENUE_DECLINE_YOY.
- **`ACCOUNT_PRODUCT_NEW`** — The client ordered a product never purchased before, based on their full order history.
- **`ACCOUNT_PRODUCT_STOPPED`** — The client bought a product at least PRODUCT_MIN_FREQUENCY for 3 years running, but not in the most recent 12 months.
- **`ACCOUNT_REVENUE_GROWTH_YOY`** — Total revenue is at least GROWTH_THRESHOLD above the same period one year ago.
- **`ACCOUNT_CROSS_SELL_GAP`** — Parked 22.9. — no basis for the recommendation without an industry rule or a client comparison (Context Graph). The advertiser buys only a single channel/format despite fitting a broader cross-sell profile.
- **`ACCOUNT_MEETING_OVERDUE`** — No meeting registered within the client segment's required frequency (MEETING_FREQUENCY_A/B/C), checked across all sources.
- **`ACCOUNT_SEGMENT_UPGRADED`** — The client's CRM segment moves up (e.g. B→A). Not worked out yet — parked 25.9.
- **`ACCOUNT_SEGMENT_DOWNGRADED`** — The client's CRM segment moves down (e.g. B→C). Not worked out yet — parked 25.9.
- **`ACCOUNT_NEW_FOLLOWUP`** — The first order was delivered NEW_CLIENT_FOLLOWUP_DAYS ago, with no follow-up since — check in.
- **`ACCOUNT_REACTIVATION_DUE`** — A former client (the collaboration is paused, finished, or the client declined our last offer) or a lead has had NO contact of any kind with us for the org's fixed interval (for example 6 months): no offer, no task, no card and no linked mail, news hit or system finding. A fallback: it fires only when no other signal and no buying-rhythm rule made a card in that time; any contact starts the interval again. Watchdog: one card per client and silence. Not: a client that stopped buying inside its own rhythm (that is ACCOUNT_DORMANT).

### L · COMPETITORS & PARTNERS

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `COMPETITOR_NEW_CLIENT` | Competitor wins a new client | 3 | fixed | fyi | — | event | active | both | — | — |
| `COMPETITOR_LOST_CLIENT` | Competitor loses a client | 4 | fixed | chance | — | event | active | both | — | — |
| `COMPETITOR_PRODUCT_NEW` | Competitor launches a new product | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_RATE_CHANGE` | Competitor changes rates | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_FUNDING` | Competitor raises funding | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_EXPANSION` | Competitor expands | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_PERSONNEL` | Competitor personnel change | 2 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_AWARD` | Competitor wins an award | 2 | fixed | fyi | — | event | onHold | both | — | — |
| `COMPETITOR_NEGATIVE_PRESS` | Negative press about a competitor | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_NEW_CLIENT` | Partner wins a new client | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_PRODUCT_NEW` | Partner launches a new product | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_FUNDING` | Partner raises funding | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_EXPANSION` | Partner expands | 3 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_PERSONNEL` | Partner personnel change | 2 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_AWARD` | Partner wins an award | 2 | fixed | fyi | — | event | onHold | both | — | — |
| `PARTNER_NEGATIVE_PRESS` | Negative press about a partner | 4 | fixed | risk | — | event | onHold | both | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`COMPETITOR_NEW_CLIENT`** — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) wins a new client, account, budget (Etat) or pitch. The won client is usually named in the same text. Not when the winner is not our competitor (that is SIGNAL_ACCOUNT_WIN), and never our own win. Hinweise: Mitbewerber gewinnt Etat, gewinnt den Pitch, holt sich den Etat, Etat geht an (Mitbewerber), setzt künftig auf (Mitbewerber), neuer Kunde der Agentur, betreut künftig
- **`COMPETITOR_LOST_CLIENT`** — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) loses or parts with a client, account or budget (Etat) — an opening to pitch that client. The lost client is usually named in the same text. Hinweise: verliert den Etat, Etat neu ausgeschrieben, trennt sich von (Mitbewerber), Zusammenarbeit beendet, ist raus, Pitch verloren, wechselt von (Mitbewerber)
- **`COMPETITOR_PRODUCT_NEW`** — A competitor launches a new product.
- **`COMPETITOR_RATE_CHANGE`** — A competitor changes their published price list or rate card.
- **`COMPETITOR_FUNDING`** — A competitor raises funding or is acquired.
- **`COMPETITOR_EXPANSION`** — A competitor expands — new market, new location, new team.
- **`COMPETITOR_PERSONNEL`** — A competitor's leadership or key staff changes.
- **`COMPETITOR_AWARD`** — A competitor wins an award or prize.
- **`COMPETITOR_NEGATIVE_PRESS`** — Negative press about a competitor.
- **`PARTNER_NEW_CLIENT`** — A partner wins a new client.
- **`PARTNER_PRODUCT_NEW`** — A partner launches a new product.
- **`PARTNER_FUNDING`** — A partner raises funding or is acquired.
- **`PARTNER_EXPANSION`** — A partner expands — new market, new location, new team.
- **`PARTNER_PERSONNEL`** — A partner's leadership or key staff changes.
- **`PARTNER_AWARD`** — A partner wins an award or prize.
- **`PARTNER_NEGATIVE_PRESS`** — Negative press about a partner — a risk to the partnership itself.

### M · INTERNAL (OUR OWN PRICE & PRODUCT)

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `INTERNAL_PRICE_CHANGE` | Price change | 3 | fixed | fyi | — | event | onHold | process | — | — |
| `INTERNAL_PRODUCT_STATUS_UPDATE` | Product status update | 3 | fixed | fyi | — | event | onHold | process | — | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`INTERNAL_PRICE_CHANGE`** — A price of ours changes. The KAM should know before the client asks.
- **`INTERNAL_PRODUCT_STATUS_UPDATE`** — One of our products is launched, discontinued, or changes status. The KAM should know before the client asks.

### N · SUPPLIERS & PURCHASING

| Code | Label | Weight | Score rule | Class | Effort | Kind | Stage | Emitted by | € | Asks us |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPLIER_DELIVERY_DELAY` | Supplier delivery delayed | 4 | fixed | fyi | quick | event | active | parser | — | — |
| `SUPPLIER_PRICE_CHANGE` | Supplier price list or price change | 3 | fixed | fyi | quick | event | active | parser | yes | — |

**Definitions** (what the parser prompt shows — the dictionary definition plus the keyword hints):

- **`SUPPLIER_DELIVERY_DELAY`** — A supplier of ours (a company we buy from) tells us that goods WE ordered come late, only in part or not at all — a moved delivery date, a backorder, a production or carrier delay, an article no longer available. Our customers may wait for these goods. Not: a customer complaining about OUR delay — that is COMPLAINT_TIMING. Hinweise: Lieferverzug, Lieferverzögerung, Liefertermin verschiebt sich, neuer Liefertermin, Rückstand, Backorder, nicht lieferbar, verspätet, Teillieferung, Spedition hat noch nicht übernommen, delayed, backorder
- **`SUPPLIER_PRICE_CHANGE`** — A supplier or manufacturer we buy from, or one that offers to supply us, sends a new or changed price list, new purchase or dealer prices, or a price increase for goods we buy or could buy. Not: a customer asking US for prices — that is SALES_PRICE_REQUEST. Not: a change of OUR own prices — that is INTERNAL_PRICE_CHANGE. Hinweise: Preisliste, neue Preise, Preiserhöhung, Preisanpassung, Händlerpreise, Einkaufspreise, gültig ab, price list, price increase, dealer prices

## Relations

`leads_over`: when both codes are detected, write the card around A and name B. `both`: not a conflict, both belong on the card. Those two are card-writing guidance only (Regelwerk v3 Case 22) and never change a score. `outranks`: when both are detected, B is context only — not counted, so A scores and leads.

| Kind | Code A | Code B | Why |
| --- | --- | --- | --- |
| leads_over | `SIGNAL_AGENCY_CHANGE` | `SIGNAL_AD_ACTIVITY` | the agency decision leads over the campaign it produced |
| outranks | `SIGNAL_MERGER` | `SIGNAL_INSOLVENCY` | a takeover reported together with an insolvency is the news (a rescue or a sale out of the insolvency) — the insolvency is context on that card, not its score |
| leads_over | `SIGNAL_MERGER` | `SIGNAL_PARTNERSHIP` | when control changes |
| leads_over | `SALES_BOOKING_CANCELLED` | `ACCOUNT_REVENUE_DECLINE_YOY` | one cancellation card — the decline is context in it, evidence of a wider pattern, not a card of its own |
| both | `SIGNAL_ACCOUNT_WIN` | `SIGNAL_AGENCY_CHANGE` | one pitch from two sides — the agency won it, the advertiser moved it; write for whichever party is our client and name the other |
| leads_over | `SIGNAL_INSOLVENCY` | `SIGNAL_NEGATIVE_PRESS` | existential beats reputational |
| leads_over | `SIGNAL_NEW_MARKETING_LEAD` | `SIGNAL_C_LEVEL_CHANGE` | for a CMO change |
| leads_over | `COMPLAINT_QUANTITY` | `COMPLAINT_QUALITY` | when too little was delivered |
| leads_over | `SIGNAL_MERGER` | `SIGNAL_FUNDING` | when control changes |
| leads_over | `SALES_OFFER_DECLINED` | `SALES_OFFER_NO_RESPONSE` | the explicit refusal closes the loop |
| leads_over | `CONTRACT_TERMINATED` | `CONTRACT_NOT_RENEWED` | an act beats the passing of time |
| leads_over | `CONTRACT_RENEWAL_INTENT` | `CONTRACT_FRAME_EXPIRY` | the opportunity beats the warning |
| leads_over | `SALES_BOOKING_CANCELLED` | `SALES_BUDGET_CUT` | the concrete loss counts |
| leads_over | `SIGNAL_CHANNEL_SHIFT` | `SIGNAL_SPEND_DOWN` | when the total stays the same |
| leads_over | `SIGNAL_REBRANDING` | `SIGNAL_PRODUCT_NEWS` | when the brand is what changed |
| leads_over | `ACCOUNT_REVENUE_DECLINE_YOY` | `ACCOUNT_REVENUE_STAGNATION` | the concrete, current loss leads; the stagnation is context |
| both | `COMPLAINT_ESCALATED` | `COMPLAINT_PRICE` | the escalation and the complaint underneath it |
| both | `COMPLAINT_ESCALATED` | `COMPLAINT_TIMING` | the escalation and the complaint underneath it |
| both | `COMPLAINT_ESCALATED` | `COMPLAINT_COMM` | the escalation and the complaint underneath it |
| both | `COMPLAINT_ESCALATED` | `COMPLAINT_QUANTITY` | the escalation and the complaint underneath it |
| both | `COMPLAINT_ESCALATED` | `COMPLAINT_QUALITY` | the escalation and the complaint underneath it |
| both | `SALES_NEW_DEMAND` | `SALES_OFFER_REQUESTED` | the opportunity and the task |

## Date gates

The model tags the code on topic and copies the date into `facts`; the parser keeps the code only when the date passes the test against the item's own date. The window is a platform setting.

| Code | Fact | Test | Setting | Current window (days) | Prompt rule |
| --- | --- | --- | --- | --- | --- |
| `CONTRACT_FRAME_EXPIRY` | contractEndDate | 0 … N days after the item | `cards.frameExpiryWindowDays` | 56 | emit it whenever the item discusses a framework/rolling contract's term AND you filled in `contractEndDate`. Do NOT try to work out whether the date is near — the system checks that and drops the code if it is not. |
| `MEETING_DELAYED` | proposedMeetingDate | more than N days after the item | `cards.meetingDelayedMinDays` | 28 | emit it whenever the item proposes a meeting AND you filled in `proposedMeetingDate`. The system decides whether that is unusually far out. |

## Attributes

Modifiers on the dominant category's weight. Exclusive within a group. Attributes carry no class. `message` scope is parsed; `account` / `contact` scope is derived server-side.

| Code | Group | Scope | Label | Weight | Stage | Profiles | Cue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ATTR_EMOTION_ANGRY` | Emotion | message | Angry | 2 | active | email, conversation | wütend, inakzeptabel, skandalös, das geht nicht, Konsequenzen, rechtliche Schritte, empört |
| `ATTR_EMOTION_FRUSTRATED` | Emotion | message | Frustrated | 2 | active | email, conversation | enttäuscht, frustriert, leider, erwarte mehr, nicht was ich mir vorgestellt hatte, schade |
| `ATTR_EMOTION_IMPATIENT` | Emotion | message | Impatient | 1 | active | email, conversation | dringend, sofort, asap, warte bereits, wann endlich, ich brauche das heute |
| `ATTR_EMOTION_NEUTRAL` | Emotion | message | Neutral | 0 | active | email, conversation | kein emotionaler Indikator erkennbar |
| `ATTR_EMOTION_POSITIVE` | Emotion | message | Positive | -1 | active | email, conversation | begeistert, freue mich, toll, wunderbar, super, sehr zufrieden, danke für alles |
| `ATTR_SALUTATION_SIE` | Salutation | message | Formal (Sie), consistent | 0 | active | email | Sie-Form: Sehr geehrte/r …, oder die Höflichkeitsform Sie / Ihnen / Ihr(e). Auch bei lockerem Gruß: 'Hallo Herr Müller' / 'Hi Frau Berger' sind SIE, weil mit Herr/Frau + Nachname angesprochen wird. |
| `ATTR_SALUTATION_DU` | Salutation | message | Informal (Du), consistent | -1 | active | email | Du-Form: die Anrede du / dir / dich / euch / Ihr, ODER Anrede nur mit VORNAMEN ohne Nachname ('Hallo Max', 'Hi Anna'). 🔴 NICHT vergeben, wenn irgendwo 'Herr'/'Frau' + Nachname oder Sie/Ihnen steht — der Gruß allein ('Hallo', 'Hi') entscheidet nichts. |
| `ATTR_TONE_BRIEF` | Brevity | message | Brief reply | 1 | active | email, conversation | Antwort unter 3 Sätzen auf eine längere Mail — keine Begründung, keine Fragen. Nur wenn der zitierte Verlauf im Body sichtbar ist. |
| `ATTR_TONE_NEGATIVE` | Tone | message | Negative tone | 1 | active | email, conversation | Bewertung oder Vorwurf, nicht die Feststellung eines Sachverhalts: 'schon wieder nichts erhalten', 'das ist jetzt die zweite Verzögerung'. NICHT: 'Ich habe noch nichts erhalten' |
| `ATTR_TONE_POSITIVE` | Tone | message | Positive tone | -1 | active | email, conversation | freut mich, gerne, sehr gut, wunderbar, klingt gut, machen wir |
| `ATTR_CLIENT_HIGH_VALUE` | Client value | account | High-value client | 2 | onHold | — | — |
| `ATTR_CLIENT_MID_VALUE` | Client value | account | Mid-value client | 1 | onHold | — | — |
| `ATTR_CLIENT_LOW_VALUE` | Client value | account | Low-value client | 0 | onHold | — | — |
| `ATTR_CLIENT_HIGH_POTENTIAL` | Client value | account | High-potential client | 2 | onHold | — | — |
| `ATTR_REL_DURATION_NEW` | Relationship duration | account | New (<6 months) | 1 | onHold | — | — |
| `ATTR_REL_DURATION_ESTABLISHED` | Relationship duration | account | Established (6 months–2 years) | 0 | onHold | — | — |
| `ATTR_REL_DURATION_LONGTERM` | Relationship duration | account | Long-term (>2 years) | -1 | onHold | — | — |
| `ATTR_COMM_SHORTER_COOLER` | Communication pattern | contact | Mails shorter + cooler | 2 | parked | — | — |
| `ATTR_COMM_SLOWER_RESPONSE` | Communication pattern | contact | Response times rising | 2 | parked | — | — |
| `ATTR_COMM_LONGER_WARMER` | Communication pattern | contact | Mails longer + warmer | -1 | parked | — | — |
| `ATTR_REL_QUALITY_GOOD` | Relationship quality | contact | Good | -1 | parked | — | — |
| `ATTR_REL_QUALITY_NEUTRAL` | Relationship quality | contact | Neutral | 0 | parked | — | — |
| `ATTR_REL_QUALITY_BAD` | Relationship quality | contact | Bad | 2 | parked | — | — |
| `ATTR_REL_TREND_RISING` | Relationship trend | contact | Rising | -1 | parked | — | — |
| `ATTR_REL_TREND_STABLE` | Relationship trend | contact | Stable | 0 | parked | — | — |
| `ATTR_REL_TREND_DECLINING` | Relationship trend | contact | Declining | 2 | parked | — | — |

**Salutation correction:** a `ATTR_SALUTATION_DU` verdict whose own evidence carries a formal marker (Herr/Frau + name, Sehr geehrte, Ihnen) is flipped to `ATTR_SALUTATION_SIE`. One direction only.

## Retired codes

Dropped before scoring when a model emits them. Old rows may still carry them.

| Code | Retired | Successor |
| --- | --- | --- |
| `SALES_CONCEPT` | 2026-09-25T00:00:00.000Z | — |
| `SALES_MOCKUP` | 2026-09-25T00:00:00.000Z | — |
| `SALES_PRESENTATION` | 2026-09-25T00:00:00.000Z | — |
| `SALES_ORDER_CONFIRM` | 2026-09-25T00:00:00.000Z | SALES_BOOKING_RECEIVED |
| `CONTRACT_LICENSE` | 2026-09-25T00:00:00.000Z | — |
| `CONTRACT_SLA` | 2026-09-25T00:00:00.000Z | — |
| `DELIVERY_REPORT` | 2026-09-25T00:00:00.000Z | — |
| `DELIVERY_CONFIRM` | 2026-09-25T00:00:00.000Z | — |
| `DELIVERY_ACCEPTANCE` | 2026-09-25T00:00:00.000Z | — |
| `COMPLAINT_ERROR` | 2026-09-25T00:00:00.000Z | COMPLAINT_QUALITY |
| `SIGNAL_TENDER` | 2026-09-25T00:00:00.000Z | SALES_TENDER_INVITATION |
| `SIGNAL_NEW_INVESTOR` | 2026-09-25T00:00:00.000Z | SIGNAL_FUNDING |
| `SIGNAL_SALES_UP` | 2026-09-25T00:00:00.000Z | SIGNAL_RESULTS_POSITIVE |
| `SIGNAL_SALES_DOWN` | 2026-09-25T00:00:00.000Z | SIGNAL_RESULTS_NEGATIVE |
| `ATTR_SALUTATION_DU_TO_SIE` | 2026-09-25T00:00:00.000Z | — |
