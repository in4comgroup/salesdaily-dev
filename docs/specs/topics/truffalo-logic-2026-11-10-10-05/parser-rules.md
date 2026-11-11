# Parser rules

_Generated 2026-11-10T10:05:52.856Z from the live code and database of this deployment._

What the parse pipeline (`src/server/parse-source-item.ts`) keeps, drops, tags and refuses. Platform rules come from code; per-organization rules come from the database.

## 1. Gate order in `parseSourceItem`

1. **GDPR Art. 18** — a restricted item is not processed.
2. **Org filter rule, deterministic half** — `BLOCK SUBJECTS` / `BLOCK SENDERS` against the sync-time envelope in `metadata_json`. Zero cost, before the item is marked `processing`.
3. **Parser policy** — per source × file type: enabled, max bytes, max chars, accepted media types / extensions (§ 2). Oversize or unsupported → `skipped` with a reason.
4. **Inside the mail parser** — the hard sender blocklist (§ 4.1), then the org filter rule again against the authoritative envelope.
5. **One LLM parse call** — markdown + junk verdict (`relevance`, § 3) + the org's `FILTER TOPICS` verdict (`orgFilter`) + signal codes (§ 5).
6. **Server post-processing** — deterministic detectors (bounce, auto-reply, calendar replies, § 4), date gates (§ 5.1), salutation correction, dropping `TEAM_*` codes on external items (§ 6), score computed server-side.

Rules that override: an `.ics` calendar invite beats the junk classifier and the org filter · an item that carries an active signal code is kept even when the junk classifier says junk · a filtered parent skips all its attachments.

## 2. Parser policies (limits and formats)

Resolution per field: `(source, file type)` row → `('*', file type)` row → code default. NULL in a row = inherit. Admin surface: Settings → Parsing.

### 2.1 Code defaults

| File type | Enabled | Max bytes | Max chars | Media types | Extensions |
| --- | --- | --- | --- | --- | --- |
| pdf | true | 20971520 | — | application/pdf | .pdf |
| image | true | 5242880 | — | image/jpeg, image/png | .jpg, .jpeg, .png |
| audio | true | 10485760 | — | audio/mpeg, audio/mp3, audio/mp4, audio/x-m4a, audio/m4a, audio/aac, audio/ogg, audio/opus | .mp3, .m4a, .aac, .ogg, .oga |
| video | true | 52428800 | — | video/mp4 | .mp4 |
| office | true | 20971520 | 120000 | application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation | .docx, .pptx |
| text | true | — | 60000 | — | — |

### 2.2 Database overrides (`parser_policy`, 7 rows)

| Source | File type | Enabled | Max bytes | Max chars | Media types | Extensions | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| * | audio | true | 10485760 | — | audio/mpeg, audio/mp3, audio/mp4, audio/x-m4a, audio/m4a, audio/aac, audio/ogg, audio/opus | .mp3, .m4a, .aac, .ogg, .oga | 2026-06-27T12:51:24.143Z |
| * | image | true | 5242880 | — | image/jpeg, image/png | .jpg, .jpeg, .png | 2026-06-15T10:46:01.743Z |
| * | office | true | 20971520 | 120000 | application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation | .docx, .pptx | 2026-06-15T10:46:01.862Z |
| * | pdf | true | 20971520 | — | application/pdf | .pdf | 2026-06-15T10:46:01.706Z |
| * | text | true | — | 60000 | — | — | 2026-06-15T10:46:01.896Z |
| gdrive | text | true | — | 120000 | — | — | 2026-06-15T10:46:01.933Z |
| * | video | true | 52428800 | — | video/mp4 | .mp4 | 2026-06-15T10:46:01.828Z |

### 2.3 Parser config (models and per-type knobs, `src/lib/parser-config.ts`)

~~~~json
{
  "text": {
    "model": "google/gemini-3.1-flash-lite"
  },
  "pdf": {
    "maxBytes": 20971520,
    "model": "google/gemini-3.5-flash"
  },
  "image": {
    "maxBytes": 5242880,
    "decorativeMaxBytes": 51200,
    "repeatedMinMails": 2,
    "model": "google/gemini-3.5-flash",
    "supportedMediaTypes": [
      "image/jpeg",
      "image/png"
    ],
    "supportedExtensions": [
      ".jpg",
      ".jpeg",
      ".png"
    ]
  },
  "audio": {
    "maxBytes": 10485760,
    "model": "google/gemini-3.5-flash",
    "supportedMediaTypes": [
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/x-m4a",
      "audio/m4a",
      "audio/aac",
      "audio/ogg",
      "audio/opus"
    ],
    "supportedExtensions": [
      ".mp3",
      ".m4a",
      ".aac",
      ".ogg",
      ".oga"
    ]
  },
  "video": {
    "maxBytes": 52428800,
    "model": "google/gemini-3.5-flash",
    "supportedMediaTypes": [
      "video/mp4"
    ],
    "supportedExtensions": [
      ".mp4"
    ]
  },
  "office": {
    "maxBytes": 20971520,
    "model": "google/gemini-3.5-flash",
    "supportedMediaTypes": [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ],
    "supportedExtensions": [
      ".docx",
      ".pptx"
    ]
  }
}
~~~~

## 3. Junk classifier (`relevance`, email parsers only)

The LLM may mark an email as junk in one of these categories. A junk email is `skipped` and never re-parses — UNLESS it carries an active signal code, which keeps it (the overridden verdict stays in `relevance.reason`).

- `account_verification`
- `security_alert`
- `system_notification`
- `system_invitation`
- `marketing`
- `service_status`
- `calendar_only`
- `other`

## 4. Deterministic rules (code, platform-wide)

### 4.1 Hard sender blocklist (`src/lib/email-blocklist.ts`)

| Kind | Values |
| --- | --- |
| Addresses | fred@fireflies.ai |
| Domains | — |

### 4.2 Automated addresses — excluded from contact discovery (`src/lib/is-automated-email.ts`)

| Match | Local-part tokens |
| --- | --- |
| Token anywhere in the local part (`-`/`_` delimited) | noreply, no-reply, no_reply, donotreply, do-not-reply, do_not_reply, mailer-daemon, mailerdaemon, mailer_daemon, postmaster, bounce, bounces, notification, notifications, automated, auto-reply, autoreply |
| Exact local part | daemon, system, root, abuse |

### 4.3 Freemail domains (39) — never treated as a company domain

126.com, 163.com, aol.com, gmail.com, gmx.com, gmx.de, gmx.net, googlemail.com, hotmail.co.uk, hotmail.com, hotmail.de, hotmail.fr, icloud.com, live.co.uk, live.com, mac.com, mail.com, mail.ru, me.com, msn.com, outlook.com, outlook.de, outlook.fr, proton.me, protonmail.com, qq.com, rocketmail.com, yahoo.ca, yahoo.co.jp, yahoo.co.uk, yahoo.com, yahoo.com.br, yahoo.de, yahoo.es, yahoo.fr, yahoo.it, yandex.com, yandex.ru, ymail.com

### 4.4 Bounce detector → `MAILERDEMON_RECEIVED` (`src/lib/mail-bounce.ts`)

A bounce = a mail-system sender AND a bounce subject, or a bounce subject AND a delivery-status part. The quoted original Message-IDs go to `facts.bouncedMessageIds`; the card inherits the score of that item's open card.

| Rule | Value |
| --- | --- |
| Mail-system sender local parts | mailer-daemon, mailerdaemon, postmaster |
| Bounce subject (regex) | `\b(?:undeliver(?:able\|ed)\|delivery status notification\|delivery (?:has )?failed\|mail delivery (?:failed\|failure\|subsystem)\|returned mail\|failure notice\|unzustellbar\|nicht zustellbar\|zustellung fehlgeschlagen\|unzustellbare nachricht)\b` |

### 4.5 Out-of-office / auto-reply detector (`src/lib/availability/detect.ts`)

Headers and subject prefixes decide WHETHER a mail is an auto-reply; the LLM only refines when and who deputises. Feeds the inferred calendar, never `user.away_until`.

**Headers** (value lower-cased, then tested):

| Header | Test |
| --- | --- |
| auto-submitted | `e=>e.startsWith("auto-replied")` |
| x-auto-response-suppress | `e=>/\b(oof\|all\|autoreply)\b/.test(e)` |
| x-autoreply | `e=>"yes"===e\|\|"true"===e\|\|"1"===e` |
| x-autorespond | `()=>!0` |
| x-auto-reply | `()=>!0` |
| precedence | `e=>e.includes("auto_reply")\|\|e.includes("auto-reply")` |
| x-vacation-reply | `()=>!0` |

**Subject prefixes** (after any RE:/AW:/WG:/FW: chain):

`automatische antwort`, `automatic reply`, `auto reply`, `autoreply`, `auto-reply`, `abwesenheitsnotiz`, `abwesenheit`, `abwesend`, `out of office`, `out of the office`, `outofoffice`, `außer haus`, `ausser haus`, `réponse automatique`, `reponse automatique`, `absence du bureau`, `risposta automatica`, `fuori sede`, `respuesta automática`, `автоответ`, `автоматический ответ`

**Body cues** (lower-cased text):

- `\bbin\s+(ab|bis|vom|von)\b.{0,80}\b(wieder\s+)?(erreichbar|im\s+(büro|haus|office))`
- `\bbis\s+(einschließlich|einschliesslich|zum|einschl\.?)\b.{0,60}\bnicht\s+(erreichbar|im\s+(büro|haus))`
- `\b(befinde\s+mich|bin)\b.{0,40}\b(im\s+urlaub|auf\s+urlaub|in\s+urlaub|außer\s+haus|ausser\s+haus|auf\s+dienstreise|auf\s+geschäftsreise)\b`
- `\bderzeit\s+nicht\s+(erreichbar|im\s+(büro|haus))\b`
- `\bin\s+ihrer\s+dringenden\s+angelegenheit\b`
- `\bin\s+dringenden\s+f[aä]llen\s+wenden\s+sie\s+sich\b`
- `\bihre\s+(e-?mail|nachricht)\s+wird\s+nicht\s+weitergeleitet\b`
- `\bi\s+am\s+(currently\s+)?out\s+of\s+(the\s+)?office\b`
- `\bi\s+will\s+be\s+(back|returning)\s+(on|in|from)\b`
- `\bi\s+am\s+(currently\s+)?(away|on\s+(vacation|leave|holiday|annual\s+leave|business\s+travel))\b`
- `\bwith\s+limited\s+access\s+to\s+(my\s+)?e-?mail\b`
- `\bfor\s+urgent\s+(matters|requests|inquiries)\s+(please\s+)?contact\b`
- `\bthis\s+is\s+an\s+automated\s+(reply|response)\b`
- `\bje\s+suis\s+absent`
- `\bsono\s+fuori\s+sede\b`

### 4.6 Calendar replies without an `.ics` (subject prefix → PARTSTAT)

| PARTSTAT | Subject regex |
| --- | --- |
| ACCEPTED | `^(angenommen\|zugesagt\|zusage\|accepted\|accepté\|accettato\|aceptado)\s*:\s*` |
| DECLINED | `^(abgelehnt\|absage\|declined\|refusé\|rifiutato\|rechazado)\s*:\s*` |
| TENTATIVE | `^(mit vorbehalt\|vorläufig\|unter vorbehalt\|tentative\|provisoire\|provvisorio\|provisional)\s*:\s*` |

### 4.7 Availability mention cues — gate before the availability LLM call

- `\bim\s+urlaub\b`
- `\burlaub\s+(vom|von|bis|ab)\b`
- `\bauf\s+urlaub\b`
- `\bnicht\s+erreichbar\b`
- `\bnicht\s+im\s+(haus|büro|office)\b`
- `\bau[sß]er\s+haus\b`
- `\bzurück\s+am\b`
- `\bab\s+(dem\s+)?\d{1,2}\.\s*\d{0,2}\.?\s*(wieder|zurück|erreichbar)`
- `\bkrank(geschrieben)?\b`
- `\bkrankenstand\b`
- `\bhome\s*office\b`
- `\bdienstreise\b`
- `\bgeschäftsreise\b`
- `\bon\s+(vacation|holiday|leave|annual\s+leave|sick\s+leave|business\s+travel)\b`
- `\bout\s+of\s+(the\s+)?office\b`
- `\bback\s+(on|in)\s+(the\s+)?(office|\d)`
- `\bunavailable\s+(until|till|from)\b`
- `\btravel+ing\b`
- `\boff\s+(next|this)\s+week\b`
- `\btermin\s+(am|um|für)\b`
- `\bpasst\s+(ihnen|dir|es)\b`
- `\bvorschlag\s*:`
- `\btreffen\s+wir\s+uns\b`
- `\bbesprechung\s+(am|um)\b`
- `\bmeeting\s+(on|at)\b`
- `\bcall\s+(on|at)\s+\d`
- `\bwould\s+\w+\s+work\s+for\s+you\b`
- `\bhow\s+about\s+(monday|tuesday|wednesday|thursday|friday|next)\b`
- `\bwie\s+w[äa]re\s+(es\s+)?(am|mit)\b`
- `\bshall\s+we\s+(meet|call)\b`
- `\bkönnen\s+wir\s+(uns\s+)?(am|um)\b`

### 4.8 Salutation correction

`ATTR_SALUTATION_DU` → `ATTR_SALUTATION_SIE` when the evidence matches `\b(?:Herr|Frau|Hrn\.?|Hr\.|Fr\.)\s+\p{Lu}|\bSehr\s+geehrte|\bIhnen\b|\bverbleibe\b`.

## 5. Signal extraction

The parser LLM emits codes + evidence; the server scores. Full vocabulary: see `signals-taxonomy.md`.

Dictionary version 204.

### 5.1 Date gates

| Code | Fact | Test | Window (days) | Setting |
| --- | --- | --- | --- | --- |
| `CONTRACT_FRAME_EXPIRY` | contractEndDate | within | 56 | `cards.frameExpiryWindowDays` |
| `MEETING_DELAYED` | proposedMeetingDate | beyond | 28 | `cards.meetingDelayedMinDays` |

### 5.2 Signal prompt per profile (as sent to the parser LLM)

Profiles: `email` = nylas, imap · `conversation` = telegram, whatsapp, chat, audio, video · `document` = pdf, image, office, drive, dropoff · `press` = web news, exa (a third party's publication: no first-party-only block).

#### Profile `email`

~~~~text
═══════════════════════════════════════════════════════════
SIGNAL CLASSIFICATION (signalCategories / signalFacts / signalAttributes)
═══════════════════════════════════════════════════════════

Classify this item against the fixed taxonomy below. This is INDEPENDENT of the other fields — it describes what business event the item represents, not who is in it.

Rules that apply to every code:
- Emit a code ONLY when you can quote a phrase from this item that triggered it. Put that phrase, verbatim, in `evidence`. An entry with empty evidence is discarded, so a code you cannot quote for is wasted output.
- Emitting NOTHING is a normal, correct outcome. Most items match no category at all. Never reach for the closest-looking code to avoid an empty array.
- `confidence`: high = the cue is explicitly present; medium = strongly implied; low = a guess. Low-confidence entries are recorded but count for nothing, so prefer omitting them.
- Judge only what is IN this item. Do not infer from what a thread probably contained earlier, and never assume elapsed time.
- 🔴 A code describes what the AUTHOR of THIS message does, asks or reports. Text quoted from an earlier message (below 'Von:', 'From:', 'Am … schrieb', 'On … wrote', or lines starting with '>') is context only — never emit a code for it. When the author repeats or answers OUR request (we asked them for a price, an offer, samples or a delivery date; we ordered from them; we offered them something), that request is OUR action, not theirs: emit nothing for it.
- 🔴 When OUR organisation is the BUYER in this item — the author sells or delivers TO us: an order confirmation, a shipping notice, a delivery date, an invoice, a price list or a product offer FROM a supplier, or a reply to our purchase request — do not emit a code that describes a CUSTOMER of ours (a customer ordering from us, asking us for a price, an offer, a catalogue or samples, or complaining about our delivery, price or quality). Those codes are for the companies that buy from us.
- 🔴 The same holds when a company wants to SELL to us: an unsolicited offer, advertising, a newsletter, a product or price announcement, a webinar, seminar, trade-fair or event invitation, or a proposal to work with or resell for them. That is their marketing, not a customer's demand — never a code that describes a customer asking us for something.
- 🔴 A code about a NEW or CHANGED contact person describes a person of the COUNTERPARTY. A member of OUR organisation who introduces themself, sends their own contact details or asks the counterparty to store them as its contact is not such an event — emit nothing for it.

CATEGORIES — emit at most 3, most significant first:
- SALES_TENDER_INVITATION — The client invites us to a tender, or a public tender relevant to us becomes known. With a deadline and an award procedure.
- CONTRACT_TERMINATED — The client actively cancels. Not: the contract simply expires.
- SALES_BOOKING_RECEIVED — A binding order exists. Not: a mere declaration of intent. Hinweise: Auftragsbestätigung, Bestellung, Order, wir beauftragen, hiermit bestätigen
- CONTRACT_FRAME_EXPIRY — A framework or annual contract ends in under eight weeks. Watchdog. Hinweise: Rahmenvertrag, Laufzeit, läuft aus, Verlängerung, Kündigung — Enddatum extrahieren
- SALES_BUDGET_CUT — The client announces a cut to their budget with us. Not: a single booking gets smaller.
- SALES_OFFER_SENT — State trigger, no score, no colour class — never produces a card by itself. Closes an open SALES_OFFER_REQUESTED card of the same client. The starting point for the watchdog: REPLY_WINDOW and facts.offerValidUntil both start running from here. Hinweise: Angebot, Offerte, Kostenvoranschlag, Quote, Proposal (.pdf/.docx) — von uns versendet
- SALES_OFFER_REQUESTED — The client asks for an offer for a specific project.
- SALES_BOOKING_CANCELLED — An order already placed is withdrawn.
- SALES_RENEGOTIATION — The client wants to reopen existing terms: price, discount, payment terms.
- SALES_NEW_DEMAND — The client asks for something beyond their existing bookings — a different service or more of the same. Needs the booking history.
- SALES_BUDGET_INCREASE — The client announces an increase to their budget with us. Not: a single larger booking.
- CONTRACT_RENEWAL_INTENT — The client raises the renewal on their own.
- SALES_PRICE_REQUEST — The client asks for prices or terms. A standard reply, not an individual offer. Not: a supplier or manufacturer sending us ITS price list or dealer prices — that is SUPPLIER_PRICE_CHANGE. Hinweise: Preis, Konditionen, Tarif, Kosten, was kostet, Preisliste, Rabatt, Staffel
- SALES_MATERIAL_REQUESTED — The client asks for a concept, mockup or presentation. Produced individually.
- SALES_ORDER_CONFIRMATION_REQUESTED — The client requests an order confirmation.
- SALES_OFFER_DECLINED — The client explicitly declines an offer. Not: they simply don't reply.
- SALES_ORDER_CONFIRMATION_SENT — State trigger, no score. Closes the open SALES_ORDER_CONFIRMATION_REQUESTED and SALES_ORDER_CONFIRMATION_OPEN cards of the same client.
- SALES_CATALOG_REQUESTED — The client asks for the product catalogue or overview. Sent, not produced.
- SALES_BUDGET_MENTIONED — The client names a figure for a specific project. Not: a number with no intent behind it, an invoice amount.
- CONTRACT_DPA — A data-processing agreement is requested, sent or signed. Hinweise: DPA, Datenschutzvertrag, AVV, Auftragsverarbeitung, DSGVO-Vereinbarung
- CONTRACT_NDA — A non-disclosure agreement is signed. A confirmation, not a task. Not: a compliance or self-declaration (sanctions, export control, PPWR, REACH) — that is CONTRACT_COMPLIANCE_DECLARATION. Not: a framework, service or agency contract sent to us to sign. Hinweise: NDA, Geheimhaltung, Vertraulichkeit, Non-Disclosure, Verschwiegenheit — unterzeichnet / signed
- DELIVERY_REPORT_REQUESTED — The client requests a report or a closing report.
- DELIVERY_PROTOCOL — Minutes or meeting notes arrive from the client. For information. Not: the KAM's own outgoing protocol. Hinweise: Protokoll, Minutes, Gesprächsnotiz, Meeting Notes, Zusammenfassung des Gesprächs
- INVOICE_OVERDUE — An outgoing invoice is overdue, or disputed by the client. Hinweise: Mahnung, überfällig, offene Rechnung, Zahlungserinnerung, Fälligkeit überschritten, overdue
- INVOICE_PAID — State trigger without a score. Closes the open INVOICE_OVERDUE card of the same client. Never produces a card of its own. Hinweise: Rechnung bezahlt, Zahlung eingegangen, Überweisung, Zahlungseingang, paid, settled
- COMPLAINT_PRICE — The client complains about price or terms — often with a reference to the competition. Hinweise: zu teuer, Preis nicht akzeptabel, Konkurrenz günstiger, Rabatt gefordert, Nachlass
- COMPLAINT_ESCALATED — The client brings in a higher level — their boss, or ours, in copy.
- COMPLAINT_TIMING — The client complains about a delay on our side — response time, delivery time, report time, or similar. Not: a supplier telling us that a delivery TO US is late — that is SUPPLIER_DELIVERY_DELAY. Hinweise: zu spät, Verzug, nicht rechtzeitig, Deadline verpasst, wann kommt, wir warten noch
- COMPLAINT_COMM — The client complains about reachability or communication. Hinweise: nicht erreichbar, keine Antwort, warte seit Tagen, schlechte Kommunikation
- COMPLAINT_QUANTITY — The agreed quantity was not delivered. Too little counts as quantity, even when the client calls it a defect. Hinweise: zu wenig, Menge nicht ausreichend, fehlende Stückzahl
- COMPLAINT_QUALITY — What was delivered is faulty — wrong motif, wrong placement, a technical error. Hinweise: Qualität stimmt nicht, mangelhaft, Mängel, Fehler, falsch, Reklamation, nicht korrekt, Rückgabe
- FEEDBACK_REFERRAL — The client recommends us further, or names a concrete contact. Hinweise: empfehle euch weiter, Empfehlung, ich habe von euch erzählt, referral, recommend
- FEEDBACK_QUALITY_PRAISE — The client praises the work. No action needed. Hinweise: sehr gut, ausgezeichnet, top Qualität, wir sind begeistert, hervorragend, exzellent
- FEEDBACK_COMM_PRAISE — The client praises the account handling or communication. No action needed. Hinweise: gute Betreuung, super Kommunikation, immer erreichbar, schnelle Antwort
- FEEDBACK_PRICE_PRAISE — The client confirms the terms as fair. No action needed. Hinweise: faire Preise, gutes Preis-Leistungs-Verhältnis, Konditionen passen, zufrieden mit Preis
- MEETING_CANCEL — The client cancels a meeting without proposing a new one. Hinweise: Termin abgesagt, cancellation, cancel, Absage — ohne neuen Terminvorschlag
- MEETING_URGENT — The client wants a meeting unusually soon. Hinweise: sofort, heute noch, so schnell wie möglich, noch diese Woche — aus Interesse
- MEETING_URGENT_ISSUE — The client wants a meeting unusually soon because something is missing or not working — not interest, a problem.
- MEETING_NEW_STAKEHOLDER — A previously unknown person on the client side is invited to, or attends, a meeting. Hinweise: neuer Teilnehmer im Invite oder im Termin, der bisher nicht dabei war
- MEETING_DELAYED — The client proposes a meeting unusually far in the future. Hinweise: Terminvorschlag mehr als 4 Wochen in der Zukunft — Datum extrahieren
- CONTACT_LEAVING — The contact is leaving the company — a farewell mail or an announcement.
- CONTACT_NEW_DECISION_MAKER — A person with decision authority newly enters the communication.
- CONTACT_NEW_KNOWN_ORG — A new contact person at an existing client.
- CONTACT_OOO — An out-of-office reply from the contact, usually naming a deputy and a return date.
- SIGNAL_INSOLVENCY — Insolvency proceedings, a payment freeze, or restructuring. Not: bad press. Not: an item that reports that a buyer takes over or rescues the brand or business of an insolvent company — that is SIGNAL_MERGER for the buyer, and the insolvency is context on that item, not a code. Still this code when the item is about the company's OWN insolvency and a takeover is only mentioned. Hinweise: Insolvenzantrag, Insolvenzverfahren eröffnet, Konkurs, Zahlungsunfähigkeit, Sanierungsverfahren beantragt, Zahlungsstopp. NOT this code when the item reports the RESCUE or takeover out of an insolvency — 'rettet', 'übernimmt', 'Sanierungsplan angenommen', 'Fortführung gesichert' — that is SIGNAL_MERGER. A buyer that takes over the brand or business of an insolvent company: SIGNAL_MERGER for the buyer, and the insolvency is context on that item, never a second code. Still this code when the item is about the company's OWN insolvency and a buyer or takeover is only mentioned as a possibility.
- SIGNAL_DOWNSIZING — A site closure or layoffs at the client.
- SIGNAL_AGENCY_CHANGE — An advertiser reviews or moves its advertising, media or PR account (Etat): it puts the account out to pitch or tender ('schreibt den Etat aus', 'der Pitch läuft', 'sucht eine neue Agentur'), parts with its agency ('Agentur X ist raus'), or announces the new agency after a pitch. When the item names the winning agency, ALSO emit SIGNAL_ACCOUNT_WIN. When the agency that lost the account is OUR competitor and the advertiser is not our client, emit COMPETITOR_LOST_CLIENT instead. Not a new campaign by the existing agency (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY), and not a first appointment with no pitch and no previous agency (that is SIGNAL_ACCOUNT_WIN alone). Hinweise: schreibt den Etat aus, schreibt den Mediaetat neu aus, Etat-Ausschreibung, Pitch läuft, startet einen Pitch, Agentur-Pitch, sucht eine neue Agentur, stellt den Etat auf den Prüfstand, Agenturwechsel, wechselt die Agentur, trennt sich von der Agentur, ist raus, verliert den Etat, Pitch-Entscheidung. When the article names the agency that held the account UNTIL NOW (the incumbent: 'betreute bisher', 'bisherige Agentur', 'Bestandsagentur') — also in a tender ('schreibt neu aus', 'Neuausschreibung') — give this code to that agency's subject too, not only to the advertiser: each side is its own matter.
- SIGNAL_NEGATIVE_PRESS — Criticism, a shitstorm, or negative coverage. The company keeps operating. Also a product recall or a safety warning naming the company.
- SIGNAL_NEW_MARKETING_LEAD — New leadership for marketing, brand or communications — the position that decides on our business. Hinweise: NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_MERGER — Control changes: acquisition, merger, majority stake. Hinweise: Übernahme, übernimmt, kauft, Fusion, fusioniert, Zusammenschluss, Mehrheitsbeteiligung, Mehrheit übernommen. Also a takeover of the brand or business OUT OF an insolvency (Sanierung, Rettung) — 'rettet', 'übernimmt die insolvente', 'Sanierungsplan angenommen', 'Fortführung gesichert': this code for the buyer; the insolvency is context on that item, not SIGNAL_INSOLVENCY.
- SIGNAL_COMPETITOR — A competitor becomes visible at the client. Without a link to the client it is not a signal.
- SIGNAL_PRODUCT_NEWS — A new product, relaunch, facelift, reissue, or range extension that the company SELLS. Not: goods the company buys for its own operations (vehicles for its fleet, machines, IT) — that is SIGNAL_OPERATIONS_INVESTMENT. Not: a product data sheet, technical sheet, certificate, declaration of conformity, manual, price list or catalogue page sent with an offer, an order or a request — that is information about an existing product, no event. Hinweise: neues Produkt, neues Angebot, neue Dienstleistung, Launch, Relaunch, Facelift, Neuauflage, Sortimentserweiterung, neues Programm für Firmenkunden (z. B. betriebliche Gesundheitsförderung). A new service or offer line counts too, also one for business customers.
- SIGNAL_EXPANSION — A new location, a new market or growth with headcount increase — a new store, branch, site or market entry, or new staff for one. 🔴 Only in the country or region the item's market is about: a new plant, site, store or market ABROAD is NOT this code — e.g. an Austrian retailer opening stores in Romania, an Austrian company building sites in Germany, an agency unit in Switzerland, a factory in Italy reported by an Austrian outlet. Emit nothing for such an expansion; other news in the same item keeps its own code. The card system also checks the place against the regions in the organization profile. Hinweise: neuer Standort, eröffnet, Filiale, Niederlassung, Markteintritt, expandiert nach, baut aus, stellt ein, neue Arbeitsplätze. NOT this code for a site, plant, store or market in ANOTHER country than the one the item reports for (Rumänien, Deutschland, Schweiz, Italien … in an Austrian outlet) — then emit no expansion code at all. NOT this code: general growth talk without a named new site in our regions ('mehr räumliche Präsenz', 'Wachstumsstrategie', 'will expandieren'). IS this code: a completed housing or building project that is now for sale or to let (a new site that has to be marketed).
- SIGNAL_FUNDING — A funding round, or a new stake, without control changing.
- SIGNAL_C_LEVEL_CHANGE — A change in leadership outside marketing — CEO / Geschäftsführung, CFO, COO, CTO, HR, head of sales (Vertrieb), the managing director of a division or business unit (e.g. 'Geschäftsführung Gastronomie'), or a board or presidium seat (Vorstand, Aufsichtsrat, Präsidium). A new head of marketing, brand or communications is SIGNAL_NEW_MARKETING_LEAD instead. Not: a change that took effect more than 6 months before the item's own date. Hinweise: neuer CEO, neue Geschäftsführerin, neuer Geschäftsführer, übernimmt die Geschäftsführung, Vorstand, Vorstandsvorsitz, CFO, Finanzvorstand, COO, CTO, Personalchef, verstärkt das Führungsteam, Vertriebsleiterin, Vertriebsleiter, Leitung Vertrieb, Head of Sales, Geschäftsführung einer Sparte oder eines Bereichs (z. B. Geschäftsführung Gastronomie), Bereichsleitung, Spartenleitung, Präsidium, Präsidentin, Präsident, Aufsichtsrat. NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_REBRANDING — A new name, new logo or new brand identity — or a new or relaunched website (including a move to a new CMS), which also has to be made known. Hinweise: neuer Markenname, neues Logo, Rebranding, neuer Markenauftritt, Corporate Design, Website-Relaunch, neue Website, Relaunch, neues CMS, Umstellung auf
- SIGNAL_STRATEGY_ANNOUNCEMENT — A strategic direction decision with a NAMED marketing, communication, advertising or budget consequence — a new communication or brand strategy, a repositioning, a marketing budget raised or cut — but no concrete action yet. Catch-all for such decisions: fires only when no more specific H-category applies. Not: a strategic statement without such a consequence (production, plants, organisation, an interview about the business) — that is SIGNAL_STRATEGY_CONTEXT. Not: budget moving between channels — that is SIGNAL_CHANNEL_SHIFT. Hinweise: neue Kommunikationsstrategie, Markenstrategie, Neupositionierung, Marketingbudget erhöht, Werbebudget gekürzt, Budget wird überprüft, mehr in Marke investieren
- SIGNAL_CHANNEL_SHIFT — Budget shifts between advertising or marketing channels while the total stays about the same (from print to digital, from TV to social).
- SIGNAL_PRODUCT_DISCONTINUED — The client takes a product off the market. The ad budget for it disappears.
- SIGNAL_NEW_COMPANY — A company is newly founded.
- SIGNAL_TRADEMARK — A trademark or domain is registered. An early indicator.
- SIGNAL_JOB_POSTING — A role relevant to us is advertised.
- SIGNAL_EVENT — The company took part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event is OVER, or the item gives no date for it. An event that takes place AFTER the item's own date is SIGNAL_EVENT_UPCOMING. Hinweise: war vertreten, präsentierte auf, stellte aus, Rückblick, nahm teil, auf der Messe gezeigt. NOT this code when the event is still to come ('wird ausstellen', 'ist vertreten auf der kommenden', a date after the item's date) — that is SIGNAL_EVENT_UPCOMING.
- SIGNAL_IPO — An IPO, or its announcement.
- SIGNAL_ANNIVERSARY — A company anniversary that the company COMMUNICATES — the item names a campaign, special products or editions, an event, promotions or advertising around it. An anniversary with no such communication named is SIGNAL_ANNIVERSARY_PLAIN. Hinweise: Jubiläum mit Kampagne, Jubiläumskampagne, Jubiläumsedition, Sondermodell, Sonderedition, Jubiläumsaktion, Jubiläumsfest, feiert mit Aktionen, zum Jubiläum gibt es. NOT this code when the item only reports the anniversary ('feiert 50 Jahre', 'besteht seit 100 Jahren') with no campaign, product, event or promotion — that is SIGNAL_ANNIVERSARY_PLAIN.
- SIGNAL_SPONSORING — The client engages as a sponsor.
- SIGNAL_INDUSTRY_TREND — Regulation or an industry development with a nameable consequence for the client.
- SIGNAL_RESULTS_POSITIVE — Published figures moving in a positive direction. Needs a number and a comparison period.
- SIGNAL_RESULTS_NEGATIVE — Published figures moving in a negative direction. Needs a number and a comparison period.
- SIGNAL_AWARD — An award or prize the company receives.
- MAILERDEMON_RECEIVED — A mailer-daemon / bounce-back notification comes back for a mail the KAM sent to a client. Inherits the score of the open card of the bounced mail; 5 when there is none.
- COMPETITOR_NEW_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) wins a new client, account, budget (Etat) or pitch. The won client is usually named in the same text. Not when the winner is not our competitor (that is SIGNAL_ACCOUNT_WIN), and never our own win. Hinweise: Mitbewerber gewinnt Etat, gewinnt den Pitch, holt sich den Etat, Etat geht an (Mitbewerber), setzt künftig auf (Mitbewerber), neuer Kunde der Agentur, betreut künftig
- COMPETITOR_LOST_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) loses or parts with a client, account or budget (Etat) — an opening to pitch that client. The lost client is usually named in the same text. Hinweise: verliert den Etat, Etat neu ausgeschrieben, trennt sich von (Mitbewerber), Zusammenarbeit beendet, ist raus, Pitch verloren, wechselt von (Mitbewerber)
- SIGNAL_PARTNERSHIP — The client enters a cooperation or partnership with a third party — a joint campaign, a joint venture, a distribution deal. Not a change of control (that is SIGNAL_MERGER). Hinweise: Kooperation, Partnerschaft, Zusammenarbeit, Joint Venture, gemeinsam mit, kooperiert
- SIGNAL_AD_ACTIVITY — The company is visibly running paid advertising NOW, or a campaign is about to end — a campaign seen in a medium or an ad library, a spot on air, a current affiliate programme. A hint that a marketing budget exists, NOT a measured spend and NOT a competitor at the client (that is SIGNAL_COMPETITOR). A campaign that is announced or planned and has NOT started yet is SIGNAL_CAMPAIGN_PLANNED. Hinweise: läuft, ist gestartet, aktuelle Kampagne, schaltet, ist zu sehen, on air, Spot, Anzeige, Affiliate-Programm, endet, nur noch bis. NOT this code when the campaign starts AFTER the item's date ('plant', 'startet im …', 'ab März', 'wird gelauncht') — that is SIGNAL_CAMPAIGN_PLANNED. NOT this code: a yearly marketing budget or ad-spend figure in a financial report or results article ('investierte 3,2 Milliarden Euro in Marketing') — that is part of the results, not a running campaign.
- SIGNAL_ACCOUNT_WIN — An agency wins an advertiser's account, budget (Etat) or pitch, and the item names the winner: 'X gewinnt den Etat von Y', 'Y setzt auf Agentur X', 'der Etat geht an X', 'X betreut künftig Y'. Emit it when the subject is the agency OR the advertiser — it is one event seen from either side. When the award replaces a previous agency or ends a pitch, ALSO emit SIGNAL_AGENCY_CHANGE. When the winning agency is OUR competitor, emit COMPETITOR_NEW_CLIENT instead. Not the advertiser's own campaign (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY). Never an order placed with us. Hinweise: Etatgewinn, gewinnt den Etat, gewinnt den Pitch, Pitch gewonnen, holt sich den Etat, Etat geht an, Media-Etat geht an, setzt auf (Agentur), setzt künftig auf, betreut künftig, übernimmt die Betreuung, neue Lead-Agentur
- SIGNAL_OPERATIONS_INVESTMENT — A company buys goods or services for its OWN operations — vehicles for its fleet, logistics, machines, IT, buildings or energy — with no new product, no new location for customers and no marketing budget named. One event seen from two sides: the buyer invests, the supplier wins the order; emit it when the subject is either party. Not a new product or range (that is SIGNAL_PRODUCT_NEWS), not a new site or market (SIGNAL_EXPANSION), not a cooperation (SIGNAL_PARTNERSHIP). Hinweise: investiert in, schafft an, Anschaffung, neue Lkw, E-Lkw, Fuhrpark, Flotte, Logistikzentrum, Zentrallager, modernisiert, stellt um auf, liefert an, erhält den Auftrag, Großauftrag
- SIGNAL_STRATEGY_CONTEXT — A company's strategic statement, plan or debate WITHOUT a named marketing, communication or budget consequence — production sites and plants, organisation, a market outlook, an interview about the business. Worth knowing for the next conversation, not a sales trigger. When a marketing, communication, advertising or budget consequence IS named, it is SIGNAL_STRATEGY_ANNOUNCEMENT (or SIGNAL_CHANNEL_SHIFT). Not: a product data sheet, a specification, a tender document or an offer — those are no strategy statement. Hinweise: Interview, Strategie, Ausrichtung, Standortfrage, Werke, Produktion, Standortdebatte, Zukunftspläne, Marktausblick, Restrukturierung ohne Abbau
- SIGNAL_TRACKING_VENDOR_CHANGE — A company changes the performance-marketing or tracking agency that runs its web analytics and campaign tracking, OR replaces an external tracking / tag tool it relies on with another of the same kind: tag manager, web analytics, consent / cookie-banner tool, ad pixels or conversion tracking (for example Google Tag Manager → Tealium, Cookiebot → Usercentrics). A technology scan that shows one such tool gone and another in its place counts. Not: an advertising, media or PR agency change (that is SIGNAL_AGENCY_CHANGE). Not: a tool added beside the existing one, or a whole new website (that is SIGNAL_REBRANDING). Hinweise: neue Performance-Agentur, Performance-Marketing-Agentur, Tracking-Agentur, wechselt den Tracking-Anbieter, Umstellung des Trackings, Server-Side-Tracking, neues Consent-Management, neuer Cookie-Banner, Consent Management Platform, Wechsel des Tag-Managers, Google Tag Manager, Matomo statt Google Analytics, Umstieg auf GA4, betreut künftig das Tracking, Webanalyse übernimmt
- SIGNAL_CAMPAIGN_PLANNED — The company announces or plans a campaign, a launch communication or a media plan that has NOT started yet — a start date after the item's own date, a pitch or tender for a campaign, 'plant', 'startet im …', 'ab März'. The budget for it is not yet placed. A campaign that is already running or about to end is SIGNAL_AD_ACTIVITY. A new product on its own is SIGNAL_PRODUCT_NEWS; emit both when the item names the planned launch campaign. Not a competitor at the client (that is SIGNAL_COMPETITOR). Hinweise: plant eine Kampagne, Kampagne geplant, startet im Herbst, ab März, wird gelauncht, Launch-Kampagne, Kampagnenstart, Mediaplanung für, schreibt die Kampagne aus, sucht Agentur für die Kampagne, Jubiläumskampagne geplant, Kampagne in Produktion, wird gerade produziert, Dreh, startet demnächst, kommt in Kürze. NOT this code when the campaign is already running or ends soon ('läuft', 'ist gestartet', 'aktuelle Kampagne', 'endet') — that is SIGNAL_AD_ACTIVITY. A campaign that is being PRODUCED or starts soon has NOT started yet — it is this code.
- SIGNAL_ANNIVERSARY_PLAIN — A company anniversary that the item only reports — no campaign, no special products or editions, no event, no promotion named. Good to know for a client; nothing to act on. An anniversary WITH such communication is SIGNAL_ANNIVERSARY. Hinweise: feiert … Jahre, Jubiläum, besteht seit, wird 50, Firmenjubiläum, Gründung vor — with NO campaign, product, event or promotion named for it.
- SIGNAL_EVENT_UPCOMING — The company WILL take part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event takes place after the item's own date. A past event, or one with no date, is SIGNAL_EVENT. Hinweise: wird ausstellen, ist vertreten auf, präsentiert auf der kommenden, Aussteller auf, spricht auf, Messeauftritt geplant, Termin der Messe after the item's date.
- CONTRACT_COMPLIANCE_DECLARATION — A customer, a public buyer or a tender asks us for a compliance, conformity or self-declaration, or we send one back — sanctions and export control (for example a self-declaration on EU sanctions, an end-use or recipient declaration), packaging (PPWR), REACH / RoHS, a supplier code of conduct, an ESG or sustainability questionnaire. Not: a non-disclosure agreement — that is CONTRACT_NDA. Hinweise: Eigenerklärung, Konformitätserklärung, Sanktionen, Russland-Sanktionen, Endverbleibserklärung, Empfängererklärung, Exportkontrolle, PPWR, Verpackungsverordnung, REACH, RoHS, Lieferantenkodex, Code of Conduct, Nachhaltigkeitsfragebogen, ESG
- SUPPLIER_DELIVERY_DELAY — A supplier of ours (a company we buy from) tells us that goods WE ordered come late, only in part or not at all — a moved delivery date, a backorder, a production or carrier delay, an article no longer available. Our customers may wait for these goods. Not: a customer complaining about OUR delay — that is COMPLAINT_TIMING. Hinweise: Lieferverzug, Lieferverzögerung, Liefertermin verschiebt sich, neuer Liefertermin, Rückstand, Backorder, nicht lieferbar, verspätet, Teillieferung, Spedition hat noch nicht übernommen, delayed, backorder
- SUPPLIER_PRICE_CHANGE — A supplier or manufacturer we buy from, or one that offers to supply us, sends a new or changed price list, new purchase or dealer prices, or a price increase for goods we buy or could buy. Not: a customer asking US for prices — that is SALES_PRICE_REQUEST. Not: a change of OUR own prices — that is INTERNAL_PRICE_CHANGE. Hinweise: Preisliste, neue Preise, Preiserhöhung, Preisanpassung, Händlerpreise, Einkaufspreise, gültig ab, price list, price increase, dealer prices

ATTRIBUTES — how the message is written. At most ONE per group:
- ATTR_EMOTION_ANGRY [group: emotion] — wütend, inakzeptabel, skandalös, das geht nicht, Konsequenzen, rechtliche Schritte, empört
- ATTR_EMOTION_FRUSTRATED [group: emotion] — enttäuscht, frustriert, leider, erwarte mehr, nicht was ich mir vorgestellt hatte, schade
- ATTR_EMOTION_IMPATIENT [group: emotion] — dringend, sofort, asap, warte bereits, wann endlich, ich brauche das heute
- ATTR_EMOTION_NEUTRAL [group: emotion] — kein emotionaler Indikator erkennbar
- ATTR_EMOTION_POSITIVE [group: emotion] — begeistert, freue mich, toll, wunderbar, super, sehr zufrieden, danke für alles
- ATTR_SALUTATION_SIE [group: salutation] — Sie-Form: Sehr geehrte/r …, oder die Höflichkeitsform Sie / Ihnen / Ihr(e). Auch bei lockerem Gruß: 'Hallo Herr Müller' / 'Hi Frau Berger' sind SIE, weil mit Herr/Frau + Nachname angesprochen wird.
- ATTR_SALUTATION_DU [group: salutation] — Du-Form: die Anrede du / dir / dich / euch / Ihr, ODER Anrede nur mit VORNAMEN ohne Nachname ('Hallo Max', 'Hi Anna'). 🔴 NICHT vergeben, wenn irgendwo 'Herr'/'Frau' + Nachname oder Sie/Ihnen steht — der Gruß allein ('Hallo', 'Hi') entscheidet nichts.
- ATTR_TONE_BRIEF [group: brevity] — Antwort unter 3 Sätzen auf eine längere Mail — keine Begründung, keine Fragen. Nur wenn der zitierte Verlauf im Body sichtbar ist.
- ATTR_TONE_NEGATIVE [group: tone] — Bewertung oder Vorwurf, nicht die Feststellung eines Sachverhalts: 'schon wieder nichts erhalten', 'das ist jetzt die zweite Verzögerung'. NICHT: 'Ich habe noch nichts erhalten'
- ATTR_TONE_POSITIVE [group: tone] — freut mich, gerne, sehr gut, wunderbar, klingt gut, machen wir

Groups present here: emotion, salutation, brevity, tone. Picking two codes from one group is an error — choose the one that fits best.
Attributes are only meaningful alongside a category. If you emit no category, attributes are ignored entirely.

DATES (signalFacts) — copy dates, never compute with them:
- `contractEndDate`: when the item states when a contract term ends / expires, copy that date as YYYY-MM-DD.
- `proposedMeetingDate`: when the item proposes or schedules a meeting on a specific date, copy it as YYYY-MM-DD.
- Empty string for either when the item states no such date. Never guess or derive one.

🔴 These categories depend on those dates, and the SYSTEM does the arithmetic — not you:
- CONTRACT_FRAME_EXPIRY: emit it whenever the item discusses a framework/rolling contract's term AND you filled in `contractEndDate`. Do NOT try to work out whether the date is near — the system checks that and drops the code if it is not.
- MEETING_DELAYED: emit it whenever the item proposes a meeting AND you filled in `proposedMeetingDate`. The system decides whether that is unusually far out.

MONEY (signalFacts.amounts) — every monetary figure the item states:
- Emit one entry per DISTINCT figure, most significant first, at most 5. A contract value, an order total, a quoted price, an invoiced sum, a per-article price, a stated budget, a fee — all qualify.
- Read the number correctly and emit it as a plain number: European '48.000,00 €' is 48000, '1.234,50' is 1234.5, '€ 12k' is 12000. Never emit the digits as written when the formatting says otherwise.
- Set `currency` to the ISO 4217 code (€ → EUR, $ → USD, £ → GBP). Empty string only when the item quotes a bare number with no currency anywhere.
- `scope` is the BASIS: total for a whole sum, per_unit for a price per piece / licence, per_month / per_year for a recurring rate. Getting this wrong makes the system state the wrong number, so read the wording ('pro Stück', 'monatlich', 'insgesamt').
- When an item states net AND gross AND VAT, emit them as separate entries — do not add, subtract or reconcile them.
- NEVER convert between currencies, never sum figures, never carry a figure over from a quoted earlier message unless this item restates it.
- `evidence` must quote the phrase the figure came from. An entry you cannot quote for is discarded.
- Empty array when the item mentions no money. That is the normal case for most items.

DEADLINES (signalFacts.deadlines) — dates by which something must be DONE:
- A deadline is an obligation with a date: 'bitte bis Freitag bestätigen', 'Angebot gültig bis 31.08.', 'send the documents by the 20th', 'I need an answer within 14 days', 'Zahlungsziel 30 Tage'.
- 🔴 A deadline is a date by which someone must ACT — submit, register, reply, pay, deliver, sign. The date of an EVENT (a trade fair, a premiere, a presentation), a market launch, an 'available from' date or a delivery-to-dealers date is NOT a deadline: nobody has to do anything by it.
- NOT a deadline: a meeting time (that is `proposedMeetingDate`), a contract end date (that is `contractEndDate`), a date something merely happened on, or a vague 'soon' / 'asap' with no date you can pin down.
- 🔴 The `evidence` quote MUST contain the date as it is written in the item (e.g. '16.10.2026', '16. Oktober', 'October 16, 2026'), unless the date is resolved from a relative phrase ('bis Freitag'). A date that appears in no quote is discarded.
- 🔴 The item's OWN DATE is given to you at the top of the input. Relative deadlines ('by Friday', 'next week', 'in 14 days', 'end of the month') MUST be resolved against THAT date, never against today, and marked `precision: "resolved"`. A date written out in the item is `precision: "exact"`.
- If the item's own date is not given to you, emit ONLY deadlines whose date is written out. Never invent an anchor.
- `what` says what has to be done, in a few words, in the item's own language. `owner` says which side owes it — use `unknown` rather than guessing.
- `evidence` must quote the phrase. At most 5, and an empty array is the normal case.

SUBJECTS (`subjects`) — the separate matters of work in this item:
- One entry per (company × matter). A second entry for the SAME company only when it needs a DIFFERENT action (an offer request and a complaint in one mail = two entries; a question and its reminder = one).
- `counterparty` = the OTHER company the matter is with — the counterpart of OUR organisation (named at the top of the input): in a mail we received, the sender's company; in a mail WE wrote (our reply, our order, our forward to a customer or supplier), the recipient's company or the company the matter is about. NEVER our own organisation, never a company only mentioned. Empty string only for internal work of our own organisation.
- `onBehalfOf` = the company the matter really belongs to when the counterparty only acts FOR it (its consultant, agency, IT / punchout / logistics provider writing about that company's order, connection or project); empty string otherwise.
- Copy reference numbers (offer, order, invoice, confirmation, contract) and product names exactly as written. At most 6 entries; an empty array when the item holds no business matter.
- Each signal category, money figure and deadline lists the subjects it belongs to in its own `subjects` (0-based positions); an empty array = all of them.
~~~~

#### Profile `conversation`

~~~~text
═══════════════════════════════════════════════════════════
SIGNAL CLASSIFICATION (signalCategories / signalFacts / signalAttributes)
═══════════════════════════════════════════════════════════

Classify this item against the fixed taxonomy below. This is INDEPENDENT of the other fields — it describes what business event the item represents, not who is in it.

Rules that apply to every code:
- Emit a code ONLY when you can quote a phrase from this item that triggered it. Put that phrase, verbatim, in `evidence`. An entry with empty evidence is discarded, so a code you cannot quote for is wasted output.
- Emitting NOTHING is a normal, correct outcome. Most items match no category at all. Never reach for the closest-looking code to avoid an empty array.
- `confidence`: high = the cue is explicitly present; medium = strongly implied; low = a guess. Low-confidence entries are recorded but count for nothing, so prefer omitting them.
- Judge only what is IN this item. Do not infer from what a thread probably contained earlier, and never assume elapsed time.
- 🔴 A code describes what the AUTHOR of THIS message does, asks or reports. Text quoted from an earlier message (below 'Von:', 'From:', 'Am … schrieb', 'On … wrote', or lines starting with '>') is context only — never emit a code for it. When the author repeats or answers OUR request (we asked them for a price, an offer, samples or a delivery date; we ordered from them; we offered them something), that request is OUR action, not theirs: emit nothing for it.
- 🔴 When OUR organisation is the BUYER in this item — the author sells or delivers TO us: an order confirmation, a shipping notice, a delivery date, an invoice, a price list or a product offer FROM a supplier, or a reply to our purchase request — do not emit a code that describes a CUSTOMER of ours (a customer ordering from us, asking us for a price, an offer, a catalogue or samples, or complaining about our delivery, price or quality). Those codes are for the companies that buy from us.
- 🔴 The same holds when a company wants to SELL to us: an unsolicited offer, advertising, a newsletter, a product or price announcement, a webinar, seminar, trade-fair or event invitation, or a proposal to work with or resell for them. That is their marketing, not a customer's demand — never a code that describes a customer asking us for something.
- 🔴 A code about a NEW or CHANGED contact person describes a person of the COUNTERPARTY. A member of OUR organisation who introduces themself, sends their own contact details or asks the counterparty to store them as its contact is not such an event — emit nothing for it.

CATEGORIES — emit at most 3, most significant first:
- SALES_TENDER_INVITATION — The client invites us to a tender, or a public tender relevant to us becomes known. With a deadline and an award procedure.
- CONTRACT_TERMINATED — The client actively cancels. Not: the contract simply expires.
- SALES_BOOKING_RECEIVED — A binding order exists. Not: a mere declaration of intent. Hinweise: Auftragsbestätigung, Bestellung, Order, wir beauftragen, hiermit bestätigen
- CONTRACT_FRAME_EXPIRY — A framework or annual contract ends in under eight weeks. Watchdog. Hinweise: Rahmenvertrag, Laufzeit, läuft aus, Verlängerung, Kündigung — Enddatum extrahieren
- SALES_BUDGET_CUT — The client announces a cut to their budget with us. Not: a single booking gets smaller.
- SALES_OFFER_SENT — State trigger, no score, no colour class — never produces a card by itself. Closes an open SALES_OFFER_REQUESTED card of the same client. The starting point for the watchdog: REPLY_WINDOW and facts.offerValidUntil both start running from here. Hinweise: Angebot, Offerte, Kostenvoranschlag, Quote, Proposal (.pdf/.docx) — von uns versendet
- SALES_OFFER_REQUESTED — The client asks for an offer for a specific project.
- SALES_BOOKING_CANCELLED — An order already placed is withdrawn.
- SALES_RENEGOTIATION — The client wants to reopen existing terms: price, discount, payment terms.
- SALES_NEW_DEMAND — The client asks for something beyond their existing bookings — a different service or more of the same. Needs the booking history.
- SALES_BUDGET_INCREASE — The client announces an increase to their budget with us. Not: a single larger booking.
- CONTRACT_RENEWAL_INTENT — The client raises the renewal on their own.
- SALES_PRICE_REQUEST — The client asks for prices or terms. A standard reply, not an individual offer. Not: a supplier or manufacturer sending us ITS price list or dealer prices — that is SUPPLIER_PRICE_CHANGE. Hinweise: Preis, Konditionen, Tarif, Kosten, was kostet, Preisliste, Rabatt, Staffel
- SALES_MATERIAL_REQUESTED — The client asks for a concept, mockup or presentation. Produced individually.
- SALES_ORDER_CONFIRMATION_REQUESTED — The client requests an order confirmation.
- SALES_OFFER_DECLINED — The client explicitly declines an offer. Not: they simply don't reply.
- SALES_ORDER_CONFIRMATION_SENT — State trigger, no score. Closes the open SALES_ORDER_CONFIRMATION_REQUESTED and SALES_ORDER_CONFIRMATION_OPEN cards of the same client.
- SALES_CATALOG_REQUESTED — The client asks for the product catalogue or overview. Sent, not produced.
- SALES_BUDGET_MENTIONED — The client names a figure for a specific project. Not: a number with no intent behind it, an invoice amount.
- CONTRACT_DPA — A data-processing agreement is requested, sent or signed. Hinweise: DPA, Datenschutzvertrag, AVV, Auftragsverarbeitung, DSGVO-Vereinbarung
- CONTRACT_NDA — A non-disclosure agreement is signed. A confirmation, not a task. Not: a compliance or self-declaration (sanctions, export control, PPWR, REACH) — that is CONTRACT_COMPLIANCE_DECLARATION. Not: a framework, service or agency contract sent to us to sign. Hinweise: NDA, Geheimhaltung, Vertraulichkeit, Non-Disclosure, Verschwiegenheit — unterzeichnet / signed
- DELIVERY_REPORT_REQUESTED — The client requests a report or a closing report.
- DELIVERY_PROTOCOL — Minutes or meeting notes arrive from the client. For information. Not: the KAM's own outgoing protocol. Hinweise: Protokoll, Minutes, Gesprächsnotiz, Meeting Notes, Zusammenfassung des Gesprächs
- INVOICE_OVERDUE — An outgoing invoice is overdue, or disputed by the client. Hinweise: Mahnung, überfällig, offene Rechnung, Zahlungserinnerung, Fälligkeit überschritten, overdue
- INVOICE_PAID — State trigger without a score. Closes the open INVOICE_OVERDUE card of the same client. Never produces a card of its own. Hinweise: Rechnung bezahlt, Zahlung eingegangen, Überweisung, Zahlungseingang, paid, settled
- COMPLAINT_PRICE — The client complains about price or terms — often with a reference to the competition. Hinweise: zu teuer, Preis nicht akzeptabel, Konkurrenz günstiger, Rabatt gefordert, Nachlass
- COMPLAINT_ESCALATED — The client brings in a higher level — their boss, or ours, in copy.
- COMPLAINT_TIMING — The client complains about a delay on our side — response time, delivery time, report time, or similar. Not: a supplier telling us that a delivery TO US is late — that is SUPPLIER_DELIVERY_DELAY. Hinweise: zu spät, Verzug, nicht rechtzeitig, Deadline verpasst, wann kommt, wir warten noch
- COMPLAINT_COMM — The client complains about reachability or communication. Hinweise: nicht erreichbar, keine Antwort, warte seit Tagen, schlechte Kommunikation
- COMPLAINT_QUANTITY — The agreed quantity was not delivered. Too little counts as quantity, even when the client calls it a defect. Hinweise: zu wenig, Menge nicht ausreichend, fehlende Stückzahl
- COMPLAINT_QUALITY — What was delivered is faulty — wrong motif, wrong placement, a technical error. Hinweise: Qualität stimmt nicht, mangelhaft, Mängel, Fehler, falsch, Reklamation, nicht korrekt, Rückgabe
- FEEDBACK_REFERRAL — The client recommends us further, or names a concrete contact. Hinweise: empfehle euch weiter, Empfehlung, ich habe von euch erzählt, referral, recommend
- FEEDBACK_QUALITY_PRAISE — The client praises the work. No action needed. Hinweise: sehr gut, ausgezeichnet, top Qualität, wir sind begeistert, hervorragend, exzellent
- FEEDBACK_COMM_PRAISE — The client praises the account handling or communication. No action needed. Hinweise: gute Betreuung, super Kommunikation, immer erreichbar, schnelle Antwort
- FEEDBACK_PRICE_PRAISE — The client confirms the terms as fair. No action needed. Hinweise: faire Preise, gutes Preis-Leistungs-Verhältnis, Konditionen passen, zufrieden mit Preis
- MEETING_CANCEL — The client cancels a meeting without proposing a new one. Hinweise: Termin abgesagt, cancellation, cancel, Absage — ohne neuen Terminvorschlag
- MEETING_URGENT — The client wants a meeting unusually soon. Hinweise: sofort, heute noch, so schnell wie möglich, noch diese Woche — aus Interesse
- MEETING_URGENT_ISSUE — The client wants a meeting unusually soon because something is missing or not working — not interest, a problem.
- MEETING_NEW_STAKEHOLDER — A previously unknown person on the client side is invited to, or attends, a meeting. Hinweise: neuer Teilnehmer im Invite oder im Termin, der bisher nicht dabei war
- MEETING_DELAYED — The client proposes a meeting unusually far in the future. Hinweise: Terminvorschlag mehr als 4 Wochen in der Zukunft — Datum extrahieren
- CONTACT_LEAVING — The contact is leaving the company — a farewell mail or an announcement.
- CONTACT_NEW_DECISION_MAKER — A person with decision authority newly enters the communication.
- CONTACT_NEW_KNOWN_ORG — A new contact person at an existing client.
- CONTACT_OOO — An out-of-office reply from the contact, usually naming a deputy and a return date.
- SIGNAL_INSOLVENCY — Insolvency proceedings, a payment freeze, or restructuring. Not: bad press. Not: an item that reports that a buyer takes over or rescues the brand or business of an insolvent company — that is SIGNAL_MERGER for the buyer, and the insolvency is context on that item, not a code. Still this code when the item is about the company's OWN insolvency and a takeover is only mentioned. Hinweise: Insolvenzantrag, Insolvenzverfahren eröffnet, Konkurs, Zahlungsunfähigkeit, Sanierungsverfahren beantragt, Zahlungsstopp. NOT this code when the item reports the RESCUE or takeover out of an insolvency — 'rettet', 'übernimmt', 'Sanierungsplan angenommen', 'Fortführung gesichert' — that is SIGNAL_MERGER. A buyer that takes over the brand or business of an insolvent company: SIGNAL_MERGER for the buyer, and the insolvency is context on that item, never a second code. Still this code when the item is about the company's OWN insolvency and a buyer or takeover is only mentioned as a possibility.
- SIGNAL_DOWNSIZING — A site closure or layoffs at the client.
- SIGNAL_AGENCY_CHANGE — An advertiser reviews or moves its advertising, media or PR account (Etat): it puts the account out to pitch or tender ('schreibt den Etat aus', 'der Pitch läuft', 'sucht eine neue Agentur'), parts with its agency ('Agentur X ist raus'), or announces the new agency after a pitch. When the item names the winning agency, ALSO emit SIGNAL_ACCOUNT_WIN. When the agency that lost the account is OUR competitor and the advertiser is not our client, emit COMPETITOR_LOST_CLIENT instead. Not a new campaign by the existing agency (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY), and not a first appointment with no pitch and no previous agency (that is SIGNAL_ACCOUNT_WIN alone). Hinweise: schreibt den Etat aus, schreibt den Mediaetat neu aus, Etat-Ausschreibung, Pitch läuft, startet einen Pitch, Agentur-Pitch, sucht eine neue Agentur, stellt den Etat auf den Prüfstand, Agenturwechsel, wechselt die Agentur, trennt sich von der Agentur, ist raus, verliert den Etat, Pitch-Entscheidung. When the article names the agency that held the account UNTIL NOW (the incumbent: 'betreute bisher', 'bisherige Agentur', 'Bestandsagentur') — also in a tender ('schreibt neu aus', 'Neuausschreibung') — give this code to that agency's subject too, not only to the advertiser: each side is its own matter.
- SIGNAL_NEGATIVE_PRESS — Criticism, a shitstorm, or negative coverage. The company keeps operating. Also a product recall or a safety warning naming the company.
- SIGNAL_NEW_MARKETING_LEAD — New leadership for marketing, brand or communications — the position that decides on our business. Hinweise: NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_MERGER — Control changes: acquisition, merger, majority stake. Hinweise: Übernahme, übernimmt, kauft, Fusion, fusioniert, Zusammenschluss, Mehrheitsbeteiligung, Mehrheit übernommen. Also a takeover of the brand or business OUT OF an insolvency (Sanierung, Rettung) — 'rettet', 'übernimmt die insolvente', 'Sanierungsplan angenommen', 'Fortführung gesichert': this code for the buyer; the insolvency is context on that item, not SIGNAL_INSOLVENCY.
- SIGNAL_COMPETITOR — A competitor becomes visible at the client. Without a link to the client it is not a signal.
- SIGNAL_PRODUCT_NEWS — A new product, relaunch, facelift, reissue, or range extension that the company SELLS. Not: goods the company buys for its own operations (vehicles for its fleet, machines, IT) — that is SIGNAL_OPERATIONS_INVESTMENT. Not: a product data sheet, technical sheet, certificate, declaration of conformity, manual, price list or catalogue page sent with an offer, an order or a request — that is information about an existing product, no event. Hinweise: neues Produkt, neues Angebot, neue Dienstleistung, Launch, Relaunch, Facelift, Neuauflage, Sortimentserweiterung, neues Programm für Firmenkunden (z. B. betriebliche Gesundheitsförderung). A new service or offer line counts too, also one for business customers.
- SIGNAL_EXPANSION — A new location, a new market or growth with headcount increase — a new store, branch, site or market entry, or new staff for one. 🔴 Only in the country or region the item's market is about: a new plant, site, store or market ABROAD is NOT this code — e.g. an Austrian retailer opening stores in Romania, an Austrian company building sites in Germany, an agency unit in Switzerland, a factory in Italy reported by an Austrian outlet. Emit nothing for such an expansion; other news in the same item keeps its own code. The card system also checks the place against the regions in the organization profile. Hinweise: neuer Standort, eröffnet, Filiale, Niederlassung, Markteintritt, expandiert nach, baut aus, stellt ein, neue Arbeitsplätze. NOT this code for a site, plant, store or market in ANOTHER country than the one the item reports for (Rumänien, Deutschland, Schweiz, Italien … in an Austrian outlet) — then emit no expansion code at all. NOT this code: general growth talk without a named new site in our regions ('mehr räumliche Präsenz', 'Wachstumsstrategie', 'will expandieren'). IS this code: a completed housing or building project that is now for sale or to let (a new site that has to be marketed).
- SIGNAL_FUNDING — A funding round, or a new stake, without control changing.
- SIGNAL_C_LEVEL_CHANGE — A change in leadership outside marketing — CEO / Geschäftsführung, CFO, COO, CTO, HR, head of sales (Vertrieb), the managing director of a division or business unit (e.g. 'Geschäftsführung Gastronomie'), or a board or presidium seat (Vorstand, Aufsichtsrat, Präsidium). A new head of marketing, brand or communications is SIGNAL_NEW_MARKETING_LEAD instead. Not: a change that took effect more than 6 months before the item's own date. Hinweise: neuer CEO, neue Geschäftsführerin, neuer Geschäftsführer, übernimmt die Geschäftsführung, Vorstand, Vorstandsvorsitz, CFO, Finanzvorstand, COO, CTO, Personalchef, verstärkt das Führungsteam, Vertriebsleiterin, Vertriebsleiter, Leitung Vertrieb, Head of Sales, Geschäftsführung einer Sparte oder eines Bereichs (z. B. Geschäftsführung Gastronomie), Bereichsleitung, Spartenleitung, Präsidium, Präsidentin, Präsident, Aufsichtsrat. NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_REBRANDING — A new name, new logo or new brand identity — or a new or relaunched website (including a move to a new CMS), which also has to be made known. Hinweise: neuer Markenname, neues Logo, Rebranding, neuer Markenauftritt, Corporate Design, Website-Relaunch, neue Website, Relaunch, neues CMS, Umstellung auf
- SIGNAL_STRATEGY_ANNOUNCEMENT — A strategic direction decision with a NAMED marketing, communication, advertising or budget consequence — a new communication or brand strategy, a repositioning, a marketing budget raised or cut — but no concrete action yet. Catch-all for such decisions: fires only when no more specific H-category applies. Not: a strategic statement without such a consequence (production, plants, organisation, an interview about the business) — that is SIGNAL_STRATEGY_CONTEXT. Not: budget moving between channels — that is SIGNAL_CHANNEL_SHIFT. Hinweise: neue Kommunikationsstrategie, Markenstrategie, Neupositionierung, Marketingbudget erhöht, Werbebudget gekürzt, Budget wird überprüft, mehr in Marke investieren
- SIGNAL_CHANNEL_SHIFT — Budget shifts between advertising or marketing channels while the total stays about the same (from print to digital, from TV to social).
- SIGNAL_PRODUCT_DISCONTINUED — The client takes a product off the market. The ad budget for it disappears.
- SIGNAL_NEW_COMPANY — A company is newly founded.
- SIGNAL_TRADEMARK — A trademark or domain is registered. An early indicator.
- SIGNAL_JOB_POSTING — A role relevant to us is advertised.
- SIGNAL_EVENT — The company took part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event is OVER, or the item gives no date for it. An event that takes place AFTER the item's own date is SIGNAL_EVENT_UPCOMING. Hinweise: war vertreten, präsentierte auf, stellte aus, Rückblick, nahm teil, auf der Messe gezeigt. NOT this code when the event is still to come ('wird ausstellen', 'ist vertreten auf der kommenden', a date after the item's date) — that is SIGNAL_EVENT_UPCOMING.
- SIGNAL_IPO — An IPO, or its announcement.
- SIGNAL_ANNIVERSARY — A company anniversary that the company COMMUNICATES — the item names a campaign, special products or editions, an event, promotions or advertising around it. An anniversary with no such communication named is SIGNAL_ANNIVERSARY_PLAIN. Hinweise: Jubiläum mit Kampagne, Jubiläumskampagne, Jubiläumsedition, Sondermodell, Sonderedition, Jubiläumsaktion, Jubiläumsfest, feiert mit Aktionen, zum Jubiläum gibt es. NOT this code when the item only reports the anniversary ('feiert 50 Jahre', 'besteht seit 100 Jahren') with no campaign, product, event or promotion — that is SIGNAL_ANNIVERSARY_PLAIN.
- SIGNAL_SPONSORING — The client engages as a sponsor.
- SIGNAL_INDUSTRY_TREND — Regulation or an industry development with a nameable consequence for the client.
- SIGNAL_RESULTS_POSITIVE — Published figures moving in a positive direction. Needs a number and a comparison period.
- SIGNAL_RESULTS_NEGATIVE — Published figures moving in a negative direction. Needs a number and a comparison period.
- SIGNAL_AWARD — An award or prize the company receives.
- MAILERDEMON_RECEIVED — A mailer-daemon / bounce-back notification comes back for a mail the KAM sent to a client. Inherits the score of the open card of the bounced mail; 5 when there is none.
- COMPETITOR_NEW_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) wins a new client, account, budget (Etat) or pitch. The won client is usually named in the same text. Not when the winner is not our competitor (that is SIGNAL_ACCOUNT_WIN), and never our own win. Hinweise: Mitbewerber gewinnt Etat, gewinnt den Pitch, holt sich den Etat, Etat geht an (Mitbewerber), setzt künftig auf (Mitbewerber), neuer Kunde der Agentur, betreut künftig
- COMPETITOR_LOST_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) loses or parts with a client, account or budget (Etat) — an opening to pitch that client. The lost client is usually named in the same text. Hinweise: verliert den Etat, Etat neu ausgeschrieben, trennt sich von (Mitbewerber), Zusammenarbeit beendet, ist raus, Pitch verloren, wechselt von (Mitbewerber)
- SIGNAL_PARTNERSHIP — The client enters a cooperation or partnership with a third party — a joint campaign, a joint venture, a distribution deal. Not a change of control (that is SIGNAL_MERGER). Hinweise: Kooperation, Partnerschaft, Zusammenarbeit, Joint Venture, gemeinsam mit, kooperiert
- SIGNAL_AD_ACTIVITY — The company is visibly running paid advertising NOW, or a campaign is about to end — a campaign seen in a medium or an ad library, a spot on air, a current affiliate programme. A hint that a marketing budget exists, NOT a measured spend and NOT a competitor at the client (that is SIGNAL_COMPETITOR). A campaign that is announced or planned and has NOT started yet is SIGNAL_CAMPAIGN_PLANNED. Hinweise: läuft, ist gestartet, aktuelle Kampagne, schaltet, ist zu sehen, on air, Spot, Anzeige, Affiliate-Programm, endet, nur noch bis. NOT this code when the campaign starts AFTER the item's date ('plant', 'startet im …', 'ab März', 'wird gelauncht') — that is SIGNAL_CAMPAIGN_PLANNED. NOT this code: a yearly marketing budget or ad-spend figure in a financial report or results article ('investierte 3,2 Milliarden Euro in Marketing') — that is part of the results, not a running campaign.
- SIGNAL_ACCOUNT_WIN — An agency wins an advertiser's account, budget (Etat) or pitch, and the item names the winner: 'X gewinnt den Etat von Y', 'Y setzt auf Agentur X', 'der Etat geht an X', 'X betreut künftig Y'. Emit it when the subject is the agency OR the advertiser — it is one event seen from either side. When the award replaces a previous agency or ends a pitch, ALSO emit SIGNAL_AGENCY_CHANGE. When the winning agency is OUR competitor, emit COMPETITOR_NEW_CLIENT instead. Not the advertiser's own campaign (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY). Never an order placed with us. Hinweise: Etatgewinn, gewinnt den Etat, gewinnt den Pitch, Pitch gewonnen, holt sich den Etat, Etat geht an, Media-Etat geht an, setzt auf (Agentur), setzt künftig auf, betreut künftig, übernimmt die Betreuung, neue Lead-Agentur
- SIGNAL_OPERATIONS_INVESTMENT — A company buys goods or services for its OWN operations — vehicles for its fleet, logistics, machines, IT, buildings or energy — with no new product, no new location for customers and no marketing budget named. One event seen from two sides: the buyer invests, the supplier wins the order; emit it when the subject is either party. Not a new product or range (that is SIGNAL_PRODUCT_NEWS), not a new site or market (SIGNAL_EXPANSION), not a cooperation (SIGNAL_PARTNERSHIP). Hinweise: investiert in, schafft an, Anschaffung, neue Lkw, E-Lkw, Fuhrpark, Flotte, Logistikzentrum, Zentrallager, modernisiert, stellt um auf, liefert an, erhält den Auftrag, Großauftrag
- SIGNAL_STRATEGY_CONTEXT — A company's strategic statement, plan or debate WITHOUT a named marketing, communication or budget consequence — production sites and plants, organisation, a market outlook, an interview about the business. Worth knowing for the next conversation, not a sales trigger. When a marketing, communication, advertising or budget consequence IS named, it is SIGNAL_STRATEGY_ANNOUNCEMENT (or SIGNAL_CHANNEL_SHIFT). Not: a product data sheet, a specification, a tender document or an offer — those are no strategy statement. Hinweise: Interview, Strategie, Ausrichtung, Standortfrage, Werke, Produktion, Standortdebatte, Zukunftspläne, Marktausblick, Restrukturierung ohne Abbau
- SIGNAL_TRACKING_VENDOR_CHANGE — A company changes the performance-marketing or tracking agency that runs its web analytics and campaign tracking, OR replaces an external tracking / tag tool it relies on with another of the same kind: tag manager, web analytics, consent / cookie-banner tool, ad pixels or conversion tracking (for example Google Tag Manager → Tealium, Cookiebot → Usercentrics). A technology scan that shows one such tool gone and another in its place counts. Not: an advertising, media or PR agency change (that is SIGNAL_AGENCY_CHANGE). Not: a tool added beside the existing one, or a whole new website (that is SIGNAL_REBRANDING). Hinweise: neue Performance-Agentur, Performance-Marketing-Agentur, Tracking-Agentur, wechselt den Tracking-Anbieter, Umstellung des Trackings, Server-Side-Tracking, neues Consent-Management, neuer Cookie-Banner, Consent Management Platform, Wechsel des Tag-Managers, Google Tag Manager, Matomo statt Google Analytics, Umstieg auf GA4, betreut künftig das Tracking, Webanalyse übernimmt
- SIGNAL_CAMPAIGN_PLANNED — The company announces or plans a campaign, a launch communication or a media plan that has NOT started yet — a start date after the item's own date, a pitch or tender for a campaign, 'plant', 'startet im …', 'ab März'. The budget for it is not yet placed. A campaign that is already running or about to end is SIGNAL_AD_ACTIVITY. A new product on its own is SIGNAL_PRODUCT_NEWS; emit both when the item names the planned launch campaign. Not a competitor at the client (that is SIGNAL_COMPETITOR). Hinweise: plant eine Kampagne, Kampagne geplant, startet im Herbst, ab März, wird gelauncht, Launch-Kampagne, Kampagnenstart, Mediaplanung für, schreibt die Kampagne aus, sucht Agentur für die Kampagne, Jubiläumskampagne geplant, Kampagne in Produktion, wird gerade produziert, Dreh, startet demnächst, kommt in Kürze. NOT this code when the campaign is already running or ends soon ('läuft', 'ist gestartet', 'aktuelle Kampagne', 'endet') — that is SIGNAL_AD_ACTIVITY. A campaign that is being PRODUCED or starts soon has NOT started yet — it is this code.
- SIGNAL_ANNIVERSARY_PLAIN — A company anniversary that the item only reports — no campaign, no special products or editions, no event, no promotion named. Good to know for a client; nothing to act on. An anniversary WITH such communication is SIGNAL_ANNIVERSARY. Hinweise: feiert … Jahre, Jubiläum, besteht seit, wird 50, Firmenjubiläum, Gründung vor — with NO campaign, product, event or promotion named for it.
- SIGNAL_EVENT_UPCOMING — The company WILL take part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event takes place after the item's own date. A past event, or one with no date, is SIGNAL_EVENT. Hinweise: wird ausstellen, ist vertreten auf, präsentiert auf der kommenden, Aussteller auf, spricht auf, Messeauftritt geplant, Termin der Messe after the item's date.
- CONTRACT_COMPLIANCE_DECLARATION — A customer, a public buyer or a tender asks us for a compliance, conformity or self-declaration, or we send one back — sanctions and export control (for example a self-declaration on EU sanctions, an end-use or recipient declaration), packaging (PPWR), REACH / RoHS, a supplier code of conduct, an ESG or sustainability questionnaire. Not: a non-disclosure agreement — that is CONTRACT_NDA. Hinweise: Eigenerklärung, Konformitätserklärung, Sanktionen, Russland-Sanktionen, Endverbleibserklärung, Empfängererklärung, Exportkontrolle, PPWR, Verpackungsverordnung, REACH, RoHS, Lieferantenkodex, Code of Conduct, Nachhaltigkeitsfragebogen, ESG
- SUPPLIER_DELIVERY_DELAY — A supplier of ours (a company we buy from) tells us that goods WE ordered come late, only in part or not at all — a moved delivery date, a backorder, a production or carrier delay, an article no longer available. Our customers may wait for these goods. Not: a customer complaining about OUR delay — that is COMPLAINT_TIMING. Hinweise: Lieferverzug, Lieferverzögerung, Liefertermin verschiebt sich, neuer Liefertermin, Rückstand, Backorder, nicht lieferbar, verspätet, Teillieferung, Spedition hat noch nicht übernommen, delayed, backorder
- SUPPLIER_PRICE_CHANGE — A supplier or manufacturer we buy from, or one that offers to supply us, sends a new or changed price list, new purchase or dealer prices, or a price increase for goods we buy or could buy. Not: a customer asking US for prices — that is SALES_PRICE_REQUEST. Not: a change of OUR own prices — that is INTERNAL_PRICE_CHANGE. Hinweise: Preisliste, neue Preise, Preiserhöhung, Preisanpassung, Händlerpreise, Einkaufspreise, gültig ab, price list, price increase, dealer prices

ATTRIBUTES — how the message is written. At most ONE per group:
- ATTR_EMOTION_ANGRY [group: emotion] — wütend, inakzeptabel, skandalös, das geht nicht, Konsequenzen, rechtliche Schritte, empört
- ATTR_EMOTION_FRUSTRATED [group: emotion] — enttäuscht, frustriert, leider, erwarte mehr, nicht was ich mir vorgestellt hatte, schade
- ATTR_EMOTION_IMPATIENT [group: emotion] — dringend, sofort, asap, warte bereits, wann endlich, ich brauche das heute
- ATTR_EMOTION_NEUTRAL [group: emotion] — kein emotionaler Indikator erkennbar
- ATTR_EMOTION_POSITIVE [group: emotion] — begeistert, freue mich, toll, wunderbar, super, sehr zufrieden, danke für alles
- ATTR_TONE_BRIEF [group: brevity] — Antwort unter 3 Sätzen auf eine längere Mail — keine Begründung, keine Fragen. Nur wenn der zitierte Verlauf im Body sichtbar ist.
- ATTR_TONE_NEGATIVE [group: tone] — Bewertung oder Vorwurf, nicht die Feststellung eines Sachverhalts: 'schon wieder nichts erhalten', 'das ist jetzt die zweite Verzögerung'. NICHT: 'Ich habe noch nichts erhalten'
- ATTR_TONE_POSITIVE [group: tone] — freut mich, gerne, sehr gut, wunderbar, klingt gut, machen wir

Groups present here: emotion, brevity, tone. Picking two codes from one group is an error — choose the one that fits best.
Attributes are only meaningful alongside a category. If you emit no category, attributes are ignored entirely.

DATES (signalFacts) — copy dates, never compute with them:
- `contractEndDate`: when the item states when a contract term ends / expires, copy that date as YYYY-MM-DD.
- `proposedMeetingDate`: when the item proposes or schedules a meeting on a specific date, copy it as YYYY-MM-DD.
- Empty string for either when the item states no such date. Never guess or derive one.

🔴 These categories depend on those dates, and the SYSTEM does the arithmetic — not you:
- CONTRACT_FRAME_EXPIRY: emit it whenever the item discusses a framework/rolling contract's term AND you filled in `contractEndDate`. Do NOT try to work out whether the date is near — the system checks that and drops the code if it is not.
- MEETING_DELAYED: emit it whenever the item proposes a meeting AND you filled in `proposedMeetingDate`. The system decides whether that is unusually far out.

MONEY (signalFacts.amounts) — every monetary figure the item states:
- Emit one entry per DISTINCT figure, most significant first, at most 5. A contract value, an order total, a quoted price, an invoiced sum, a per-article price, a stated budget, a fee — all qualify.
- Read the number correctly and emit it as a plain number: European '48.000,00 €' is 48000, '1.234,50' is 1234.5, '€ 12k' is 12000. Never emit the digits as written when the formatting says otherwise.
- Set `currency` to the ISO 4217 code (€ → EUR, $ → USD, £ → GBP). Empty string only when the item quotes a bare number with no currency anywhere.
- `scope` is the BASIS: total for a whole sum, per_unit for a price per piece / licence, per_month / per_year for a recurring rate. Getting this wrong makes the system state the wrong number, so read the wording ('pro Stück', 'monatlich', 'insgesamt').
- When an item states net AND gross AND VAT, emit them as separate entries — do not add, subtract or reconcile them.
- NEVER convert between currencies, never sum figures, never carry a figure over from a quoted earlier message unless this item restates it.
- `evidence` must quote the phrase the figure came from. An entry you cannot quote for is discarded.
- Empty array when the item mentions no money. That is the normal case for most items.

DEADLINES (signalFacts.deadlines) — dates by which something must be DONE:
- A deadline is an obligation with a date: 'bitte bis Freitag bestätigen', 'Angebot gültig bis 31.08.', 'send the documents by the 20th', 'I need an answer within 14 days', 'Zahlungsziel 30 Tage'.
- 🔴 A deadline is a date by which someone must ACT — submit, register, reply, pay, deliver, sign. The date of an EVENT (a trade fair, a premiere, a presentation), a market launch, an 'available from' date or a delivery-to-dealers date is NOT a deadline: nobody has to do anything by it.
- NOT a deadline: a meeting time (that is `proposedMeetingDate`), a contract end date (that is `contractEndDate`), a date something merely happened on, or a vague 'soon' / 'asap' with no date you can pin down.
- 🔴 The `evidence` quote MUST contain the date as it is written in the item (e.g. '16.10.2026', '16. Oktober', 'October 16, 2026'), unless the date is resolved from a relative phrase ('bis Freitag'). A date that appears in no quote is discarded.
- 🔴 The item's OWN DATE is given to you at the top of the input. Relative deadlines ('by Friday', 'next week', 'in 14 days', 'end of the month') MUST be resolved against THAT date, never against today, and marked `precision: "resolved"`. A date written out in the item is `precision: "exact"`.
- If the item's own date is not given to you, emit ONLY deadlines whose date is written out. Never invent an anchor.
- `what` says what has to be done, in a few words, in the item's own language. `owner` says which side owes it — use `unknown` rather than guessing.
- `evidence` must quote the phrase. At most 5, and an empty array is the normal case.

SUBJECTS (`subjects`) — the separate matters of work in this item:
- One entry per (company × matter). A second entry for the SAME company only when it needs a DIFFERENT action (an offer request and a complaint in one mail = two entries; a question and its reminder = one).
- `counterparty` = the OTHER company the matter is with — the counterpart of OUR organisation (named at the top of the input): in a mail we received, the sender's company; in a mail WE wrote (our reply, our order, our forward to a customer or supplier), the recipient's company or the company the matter is about. NEVER our own organisation, never a company only mentioned. Empty string only for internal work of our own organisation.
- `onBehalfOf` = the company the matter really belongs to when the counterparty only acts FOR it (its consultant, agency, IT / punchout / logistics provider writing about that company's order, connection or project); empty string otherwise.
- Copy reference numbers (offer, order, invoice, confirmation, contract) and product names exactly as written. At most 6 entries; an empty array when the item holds no business matter.
- Each signal category, money figure and deadline lists the subjects it belongs to in its own `subjects` (0-based positions); an empty array = all of them.
~~~~

#### Profile `document`

~~~~text
═══════════════════════════════════════════════════════════
SIGNAL CLASSIFICATION (signalCategories / signalFacts)
═══════════════════════════════════════════════════════════

Classify this item against the fixed taxonomy below. This is INDEPENDENT of the other fields — it describes what business event the item represents, not who is in it.

Rules that apply to every code:
- Emit a code ONLY when you can quote a phrase from this item that triggered it. Put that phrase, verbatim, in `evidence`. An entry with empty evidence is discarded, so a code you cannot quote for is wasted output.
- Emitting NOTHING is a normal, correct outcome. Most items match no category at all. Never reach for the closest-looking code to avoid an empty array.
- `confidence`: high = the cue is explicitly present; medium = strongly implied; low = a guess. Low-confidence entries are recorded but count for nothing, so prefer omitting them.
- Judge only what is IN this item. Do not infer from what a thread probably contained earlier, and never assume elapsed time.
- 🔴 A code describes what the AUTHOR of THIS message does, asks or reports. Text quoted from an earlier message (below 'Von:', 'From:', 'Am … schrieb', 'On … wrote', or lines starting with '>') is context only — never emit a code for it. When the author repeats or answers OUR request (we asked them for a price, an offer, samples or a delivery date; we ordered from them; we offered them something), that request is OUR action, not theirs: emit nothing for it.
- 🔴 When OUR organisation is the BUYER in this item — the author sells or delivers TO us: an order confirmation, a shipping notice, a delivery date, an invoice, a price list or a product offer FROM a supplier, or a reply to our purchase request — do not emit a code that describes a CUSTOMER of ours (a customer ordering from us, asking us for a price, an offer, a catalogue or samples, or complaining about our delivery, price or quality). Those codes are for the companies that buy from us.
- 🔴 The same holds when a company wants to SELL to us: an unsolicited offer, advertising, a newsletter, a product or price announcement, a webinar, seminar, trade-fair or event invitation, or a proposal to work with or resell for them. That is their marketing, not a customer's demand — never a code that describes a customer asking us for something.
- 🔴 A code about a NEW or CHANGED contact person describes a person of the COUNTERPARTY. A member of OUR organisation who introduces themself, sends their own contact details or asks the counterparty to store them as its contact is not such an event — emit nothing for it.

CATEGORIES — emit at most 3, most significant first:
- SALES_TENDER_INVITATION — The client invites us to a tender, or a public tender relevant to us becomes known. With a deadline and an award procedure.
- CONTRACT_TERMINATED — The client actively cancels. Not: the contract simply expires.
- SALES_BOOKING_RECEIVED — A binding order exists. Not: a mere declaration of intent. Hinweise: Auftragsbestätigung, Bestellung, Order, wir beauftragen, hiermit bestätigen
- CONTRACT_FRAME_EXPIRY — A framework or annual contract ends in under eight weeks. Watchdog. Hinweise: Rahmenvertrag, Laufzeit, läuft aus, Verlängerung, Kündigung — Enddatum extrahieren
- SALES_BUDGET_CUT — The client announces a cut to their budget with us. Not: a single booking gets smaller.
- SALES_OFFER_SENT — State trigger, no score, no colour class — never produces a card by itself. Closes an open SALES_OFFER_REQUESTED card of the same client. The starting point for the watchdog: REPLY_WINDOW and facts.offerValidUntil both start running from here. Hinweise: Angebot, Offerte, Kostenvoranschlag, Quote, Proposal (.pdf/.docx) — von uns versendet
- SALES_OFFER_REQUESTED — The client asks for an offer for a specific project.
- SALES_BOOKING_CANCELLED — An order already placed is withdrawn.
- SALES_RENEGOTIATION — The client wants to reopen existing terms: price, discount, payment terms.
- SALES_NEW_DEMAND — The client asks for something beyond their existing bookings — a different service or more of the same. Needs the booking history.
- SALES_BUDGET_INCREASE — The client announces an increase to their budget with us. Not: a single larger booking.
- CONTRACT_RENEWAL_INTENT — The client raises the renewal on their own.
- SALES_PRICE_REQUEST — The client asks for prices or terms. A standard reply, not an individual offer. Not: a supplier or manufacturer sending us ITS price list or dealer prices — that is SUPPLIER_PRICE_CHANGE. Hinweise: Preis, Konditionen, Tarif, Kosten, was kostet, Preisliste, Rabatt, Staffel
- SALES_MATERIAL_REQUESTED — The client asks for a concept, mockup or presentation. Produced individually.
- SALES_ORDER_CONFIRMATION_REQUESTED — The client requests an order confirmation.
- SALES_OFFER_DECLINED — The client explicitly declines an offer. Not: they simply don't reply.
- SALES_ORDER_CONFIRMATION_SENT — State trigger, no score. Closes the open SALES_ORDER_CONFIRMATION_REQUESTED and SALES_ORDER_CONFIRMATION_OPEN cards of the same client.
- SALES_CATALOG_REQUESTED — The client asks for the product catalogue or overview. Sent, not produced.
- SALES_BUDGET_MENTIONED — The client names a figure for a specific project. Not: a number with no intent behind it, an invoice amount.
- CONTRACT_DPA — A data-processing agreement is requested, sent or signed. Hinweise: DPA, Datenschutzvertrag, AVV, Auftragsverarbeitung, DSGVO-Vereinbarung
- CONTRACT_NDA — A non-disclosure agreement is signed. A confirmation, not a task. Not: a compliance or self-declaration (sanctions, export control, PPWR, REACH) — that is CONTRACT_COMPLIANCE_DECLARATION. Not: a framework, service or agency contract sent to us to sign. Hinweise: NDA, Geheimhaltung, Vertraulichkeit, Non-Disclosure, Verschwiegenheit — unterzeichnet / signed
- DELIVERY_REPORT_REQUESTED — The client requests a report or a closing report.
- DELIVERY_PROTOCOL — Minutes or meeting notes arrive from the client. For information. Not: the KAM's own outgoing protocol. Hinweise: Protokoll, Minutes, Gesprächsnotiz, Meeting Notes, Zusammenfassung des Gesprächs
- INVOICE_OVERDUE — An outgoing invoice is overdue, or disputed by the client. Hinweise: Mahnung, überfällig, offene Rechnung, Zahlungserinnerung, Fälligkeit überschritten, overdue
- INVOICE_PAID — State trigger without a score. Closes the open INVOICE_OVERDUE card of the same client. Never produces a card of its own. Hinweise: Rechnung bezahlt, Zahlung eingegangen, Überweisung, Zahlungseingang, paid, settled
- COMPLAINT_PRICE — The client complains about price or terms — often with a reference to the competition. Hinweise: zu teuer, Preis nicht akzeptabel, Konkurrenz günstiger, Rabatt gefordert, Nachlass
- COMPLAINT_ESCALATED — The client brings in a higher level — their boss, or ours, in copy.
- COMPLAINT_TIMING — The client complains about a delay on our side — response time, delivery time, report time, or similar. Not: a supplier telling us that a delivery TO US is late — that is SUPPLIER_DELIVERY_DELAY. Hinweise: zu spät, Verzug, nicht rechtzeitig, Deadline verpasst, wann kommt, wir warten noch
- COMPLAINT_COMM — The client complains about reachability or communication. Hinweise: nicht erreichbar, keine Antwort, warte seit Tagen, schlechte Kommunikation
- COMPLAINT_QUANTITY — The agreed quantity was not delivered. Too little counts as quantity, even when the client calls it a defect. Hinweise: zu wenig, Menge nicht ausreichend, fehlende Stückzahl
- COMPLAINT_QUALITY — What was delivered is faulty — wrong motif, wrong placement, a technical error. Hinweise: Qualität stimmt nicht, mangelhaft, Mängel, Fehler, falsch, Reklamation, nicht korrekt, Rückgabe
- FEEDBACK_REFERRAL — The client recommends us further, or names a concrete contact. Hinweise: empfehle euch weiter, Empfehlung, ich habe von euch erzählt, referral, recommend
- FEEDBACK_QUALITY_PRAISE — The client praises the work. No action needed. Hinweise: sehr gut, ausgezeichnet, top Qualität, wir sind begeistert, hervorragend, exzellent
- FEEDBACK_COMM_PRAISE — The client praises the account handling or communication. No action needed. Hinweise: gute Betreuung, super Kommunikation, immer erreichbar, schnelle Antwort
- FEEDBACK_PRICE_PRAISE — The client confirms the terms as fair. No action needed. Hinweise: faire Preise, gutes Preis-Leistungs-Verhältnis, Konditionen passen, zufrieden mit Preis
- MEETING_CANCEL — The client cancels a meeting without proposing a new one. Hinweise: Termin abgesagt, cancellation, cancel, Absage — ohne neuen Terminvorschlag
- MEETING_URGENT — The client wants a meeting unusually soon. Hinweise: sofort, heute noch, so schnell wie möglich, noch diese Woche — aus Interesse
- MEETING_URGENT_ISSUE — The client wants a meeting unusually soon because something is missing or not working — not interest, a problem.
- MEETING_NEW_STAKEHOLDER — A previously unknown person on the client side is invited to, or attends, a meeting. Hinweise: neuer Teilnehmer im Invite oder im Termin, der bisher nicht dabei war
- MEETING_DELAYED — The client proposes a meeting unusually far in the future. Hinweise: Terminvorschlag mehr als 4 Wochen in der Zukunft — Datum extrahieren
- CONTACT_LEAVING — The contact is leaving the company — a farewell mail or an announcement.
- CONTACT_NEW_DECISION_MAKER — A person with decision authority newly enters the communication.
- CONTACT_NEW_KNOWN_ORG — A new contact person at an existing client.
- CONTACT_OOO — An out-of-office reply from the contact, usually naming a deputy and a return date.
- SIGNAL_INSOLVENCY — Insolvency proceedings, a payment freeze, or restructuring. Not: bad press. Not: an item that reports that a buyer takes over or rescues the brand or business of an insolvent company — that is SIGNAL_MERGER for the buyer, and the insolvency is context on that item, not a code. Still this code when the item is about the company's OWN insolvency and a takeover is only mentioned. Hinweise: Insolvenzantrag, Insolvenzverfahren eröffnet, Konkurs, Zahlungsunfähigkeit, Sanierungsverfahren beantragt, Zahlungsstopp. NOT this code when the item reports the RESCUE or takeover out of an insolvency — 'rettet', 'übernimmt', 'Sanierungsplan angenommen', 'Fortführung gesichert' — that is SIGNAL_MERGER. A buyer that takes over the brand or business of an insolvent company: SIGNAL_MERGER for the buyer, and the insolvency is context on that item, never a second code. Still this code when the item is about the company's OWN insolvency and a buyer or takeover is only mentioned as a possibility.
- SIGNAL_DOWNSIZING — A site closure or layoffs at the client.
- SIGNAL_AGENCY_CHANGE — An advertiser reviews or moves its advertising, media or PR account (Etat): it puts the account out to pitch or tender ('schreibt den Etat aus', 'der Pitch läuft', 'sucht eine neue Agentur'), parts with its agency ('Agentur X ist raus'), or announces the new agency after a pitch. When the item names the winning agency, ALSO emit SIGNAL_ACCOUNT_WIN. When the agency that lost the account is OUR competitor and the advertiser is not our client, emit COMPETITOR_LOST_CLIENT instead. Not a new campaign by the existing agency (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY), and not a first appointment with no pitch and no previous agency (that is SIGNAL_ACCOUNT_WIN alone). Hinweise: schreibt den Etat aus, schreibt den Mediaetat neu aus, Etat-Ausschreibung, Pitch läuft, startet einen Pitch, Agentur-Pitch, sucht eine neue Agentur, stellt den Etat auf den Prüfstand, Agenturwechsel, wechselt die Agentur, trennt sich von der Agentur, ist raus, verliert den Etat, Pitch-Entscheidung. When the article names the agency that held the account UNTIL NOW (the incumbent: 'betreute bisher', 'bisherige Agentur', 'Bestandsagentur') — also in a tender ('schreibt neu aus', 'Neuausschreibung') — give this code to that agency's subject too, not only to the advertiser: each side is its own matter.
- SIGNAL_NEGATIVE_PRESS — Criticism, a shitstorm, or negative coverage. The company keeps operating. Also a product recall or a safety warning naming the company.
- SIGNAL_NEW_MARKETING_LEAD — New leadership for marketing, brand or communications — the position that decides on our business. Hinweise: NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_MERGER — Control changes: acquisition, merger, majority stake. Hinweise: Übernahme, übernimmt, kauft, Fusion, fusioniert, Zusammenschluss, Mehrheitsbeteiligung, Mehrheit übernommen. Also a takeover of the brand or business OUT OF an insolvency (Sanierung, Rettung) — 'rettet', 'übernimmt die insolvente', 'Sanierungsplan angenommen', 'Fortführung gesichert': this code for the buyer; the insolvency is context on that item, not SIGNAL_INSOLVENCY.
- SIGNAL_COMPETITOR — A competitor becomes visible at the client. Without a link to the client it is not a signal.
- SIGNAL_PRODUCT_NEWS — A new product, relaunch, facelift, reissue, or range extension that the company SELLS. Not: goods the company buys for its own operations (vehicles for its fleet, machines, IT) — that is SIGNAL_OPERATIONS_INVESTMENT. Not: a product data sheet, technical sheet, certificate, declaration of conformity, manual, price list or catalogue page sent with an offer, an order or a request — that is information about an existing product, no event. Hinweise: neues Produkt, neues Angebot, neue Dienstleistung, Launch, Relaunch, Facelift, Neuauflage, Sortimentserweiterung, neues Programm für Firmenkunden (z. B. betriebliche Gesundheitsförderung). A new service or offer line counts too, also one for business customers.
- SIGNAL_EXPANSION — A new location, a new market or growth with headcount increase — a new store, branch, site or market entry, or new staff for one. 🔴 Only in the country or region the item's market is about: a new plant, site, store or market ABROAD is NOT this code — e.g. an Austrian retailer opening stores in Romania, an Austrian company building sites in Germany, an agency unit in Switzerland, a factory in Italy reported by an Austrian outlet. Emit nothing for such an expansion; other news in the same item keeps its own code. The card system also checks the place against the regions in the organization profile. Hinweise: neuer Standort, eröffnet, Filiale, Niederlassung, Markteintritt, expandiert nach, baut aus, stellt ein, neue Arbeitsplätze. NOT this code for a site, plant, store or market in ANOTHER country than the one the item reports for (Rumänien, Deutschland, Schweiz, Italien … in an Austrian outlet) — then emit no expansion code at all. NOT this code: general growth talk without a named new site in our regions ('mehr räumliche Präsenz', 'Wachstumsstrategie', 'will expandieren'). IS this code: a completed housing or building project that is now for sale or to let (a new site that has to be marketed).
- SIGNAL_FUNDING — A funding round, or a new stake, without control changing.
- SIGNAL_C_LEVEL_CHANGE — A change in leadership outside marketing — CEO / Geschäftsführung, CFO, COO, CTO, HR, head of sales (Vertrieb), the managing director of a division or business unit (e.g. 'Geschäftsführung Gastronomie'), or a board or presidium seat (Vorstand, Aufsichtsrat, Präsidium). A new head of marketing, brand or communications is SIGNAL_NEW_MARKETING_LEAD instead. Not: a change that took effect more than 6 months before the item's own date. Hinweise: neuer CEO, neue Geschäftsführerin, neuer Geschäftsführer, übernimmt die Geschäftsführung, Vorstand, Vorstandsvorsitz, CFO, Finanzvorstand, COO, CTO, Personalchef, verstärkt das Führungsteam, Vertriebsleiterin, Vertriebsleiter, Leitung Vertrieb, Head of Sales, Geschäftsführung einer Sparte oder eines Bereichs (z. B. Geschäftsführung Gastronomie), Bereichsleitung, Spartenleitung, Präsidium, Präsidentin, Präsident, Aufsichtsrat. NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_REBRANDING — A new name, new logo or new brand identity — or a new or relaunched website (including a move to a new CMS), which also has to be made known. Hinweise: neuer Markenname, neues Logo, Rebranding, neuer Markenauftritt, Corporate Design, Website-Relaunch, neue Website, Relaunch, neues CMS, Umstellung auf
- SIGNAL_STRATEGY_ANNOUNCEMENT — A strategic direction decision with a NAMED marketing, communication, advertising or budget consequence — a new communication or brand strategy, a repositioning, a marketing budget raised or cut — but no concrete action yet. Catch-all for such decisions: fires only when no more specific H-category applies. Not: a strategic statement without such a consequence (production, plants, organisation, an interview about the business) — that is SIGNAL_STRATEGY_CONTEXT. Not: budget moving between channels — that is SIGNAL_CHANNEL_SHIFT. Hinweise: neue Kommunikationsstrategie, Markenstrategie, Neupositionierung, Marketingbudget erhöht, Werbebudget gekürzt, Budget wird überprüft, mehr in Marke investieren
- SIGNAL_CHANNEL_SHIFT — Budget shifts between advertising or marketing channels while the total stays about the same (from print to digital, from TV to social).
- SIGNAL_PRODUCT_DISCONTINUED — The client takes a product off the market. The ad budget for it disappears.
- SIGNAL_NEW_COMPANY — A company is newly founded.
- SIGNAL_TRADEMARK — A trademark or domain is registered. An early indicator.
- SIGNAL_JOB_POSTING — A role relevant to us is advertised.
- SIGNAL_EVENT — The company took part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event is OVER, or the item gives no date for it. An event that takes place AFTER the item's own date is SIGNAL_EVENT_UPCOMING. Hinweise: war vertreten, präsentierte auf, stellte aus, Rückblick, nahm teil, auf der Messe gezeigt. NOT this code when the event is still to come ('wird ausstellen', 'ist vertreten auf der kommenden', a date after the item's date) — that is SIGNAL_EVENT_UPCOMING.
- SIGNAL_IPO — An IPO, or its announcement.
- SIGNAL_ANNIVERSARY — A company anniversary that the company COMMUNICATES — the item names a campaign, special products or editions, an event, promotions or advertising around it. An anniversary with no such communication named is SIGNAL_ANNIVERSARY_PLAIN. Hinweise: Jubiläum mit Kampagne, Jubiläumskampagne, Jubiläumsedition, Sondermodell, Sonderedition, Jubiläumsaktion, Jubiläumsfest, feiert mit Aktionen, zum Jubiläum gibt es. NOT this code when the item only reports the anniversary ('feiert 50 Jahre', 'besteht seit 100 Jahren') with no campaign, product, event or promotion — that is SIGNAL_ANNIVERSARY_PLAIN.
- SIGNAL_SPONSORING — The client engages as a sponsor.
- SIGNAL_INDUSTRY_TREND — Regulation or an industry development with a nameable consequence for the client.
- SIGNAL_RESULTS_POSITIVE — Published figures moving in a positive direction. Needs a number and a comparison period.
- SIGNAL_RESULTS_NEGATIVE — Published figures moving in a negative direction. Needs a number and a comparison period.
- SIGNAL_AWARD — An award or prize the company receives.
- MAILERDEMON_RECEIVED — A mailer-daemon / bounce-back notification comes back for a mail the KAM sent to a client. Inherits the score of the open card of the bounced mail; 5 when there is none.
- COMPETITOR_NEW_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) wins a new client, account, budget (Etat) or pitch. The won client is usually named in the same text. Not when the winner is not our competitor (that is SIGNAL_ACCOUNT_WIN), and never our own win. Hinweise: Mitbewerber gewinnt Etat, gewinnt den Pitch, holt sich den Etat, Etat geht an (Mitbewerber), setzt künftig auf (Mitbewerber), neuer Kunde der Agentur, betreut künftig
- COMPETITOR_LOST_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) loses or parts with a client, account or budget (Etat) — an opening to pitch that client. The lost client is usually named in the same text. Hinweise: verliert den Etat, Etat neu ausgeschrieben, trennt sich von (Mitbewerber), Zusammenarbeit beendet, ist raus, Pitch verloren, wechselt von (Mitbewerber)
- SIGNAL_PARTNERSHIP — The client enters a cooperation or partnership with a third party — a joint campaign, a joint venture, a distribution deal. Not a change of control (that is SIGNAL_MERGER). Hinweise: Kooperation, Partnerschaft, Zusammenarbeit, Joint Venture, gemeinsam mit, kooperiert
- SIGNAL_AD_ACTIVITY — The company is visibly running paid advertising NOW, or a campaign is about to end — a campaign seen in a medium or an ad library, a spot on air, a current affiliate programme. A hint that a marketing budget exists, NOT a measured spend and NOT a competitor at the client (that is SIGNAL_COMPETITOR). A campaign that is announced or planned and has NOT started yet is SIGNAL_CAMPAIGN_PLANNED. Hinweise: läuft, ist gestartet, aktuelle Kampagne, schaltet, ist zu sehen, on air, Spot, Anzeige, Affiliate-Programm, endet, nur noch bis. NOT this code when the campaign starts AFTER the item's date ('plant', 'startet im …', 'ab März', 'wird gelauncht') — that is SIGNAL_CAMPAIGN_PLANNED. NOT this code: a yearly marketing budget or ad-spend figure in a financial report or results article ('investierte 3,2 Milliarden Euro in Marketing') — that is part of the results, not a running campaign.
- SIGNAL_ACCOUNT_WIN — An agency wins an advertiser's account, budget (Etat) or pitch, and the item names the winner: 'X gewinnt den Etat von Y', 'Y setzt auf Agentur X', 'der Etat geht an X', 'X betreut künftig Y'. Emit it when the subject is the agency OR the advertiser — it is one event seen from either side. When the award replaces a previous agency or ends a pitch, ALSO emit SIGNAL_AGENCY_CHANGE. When the winning agency is OUR competitor, emit COMPETITOR_NEW_CLIENT instead. Not the advertiser's own campaign (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY). Never an order placed with us. Hinweise: Etatgewinn, gewinnt den Etat, gewinnt den Pitch, Pitch gewonnen, holt sich den Etat, Etat geht an, Media-Etat geht an, setzt auf (Agentur), setzt künftig auf, betreut künftig, übernimmt die Betreuung, neue Lead-Agentur
- SIGNAL_OPERATIONS_INVESTMENT — A company buys goods or services for its OWN operations — vehicles for its fleet, logistics, machines, IT, buildings or energy — with no new product, no new location for customers and no marketing budget named. One event seen from two sides: the buyer invests, the supplier wins the order; emit it when the subject is either party. Not a new product or range (that is SIGNAL_PRODUCT_NEWS), not a new site or market (SIGNAL_EXPANSION), not a cooperation (SIGNAL_PARTNERSHIP). Hinweise: investiert in, schafft an, Anschaffung, neue Lkw, E-Lkw, Fuhrpark, Flotte, Logistikzentrum, Zentrallager, modernisiert, stellt um auf, liefert an, erhält den Auftrag, Großauftrag
- SIGNAL_STRATEGY_CONTEXT — A company's strategic statement, plan or debate WITHOUT a named marketing, communication or budget consequence — production sites and plants, organisation, a market outlook, an interview about the business. Worth knowing for the next conversation, not a sales trigger. When a marketing, communication, advertising or budget consequence IS named, it is SIGNAL_STRATEGY_ANNOUNCEMENT (or SIGNAL_CHANNEL_SHIFT). Not: a product data sheet, a specification, a tender document or an offer — those are no strategy statement. Hinweise: Interview, Strategie, Ausrichtung, Standortfrage, Werke, Produktion, Standortdebatte, Zukunftspläne, Marktausblick, Restrukturierung ohne Abbau
- SIGNAL_TRACKING_VENDOR_CHANGE — A company changes the performance-marketing or tracking agency that runs its web analytics and campaign tracking, OR replaces an external tracking / tag tool it relies on with another of the same kind: tag manager, web analytics, consent / cookie-banner tool, ad pixels or conversion tracking (for example Google Tag Manager → Tealium, Cookiebot → Usercentrics). A technology scan that shows one such tool gone and another in its place counts. Not: an advertising, media or PR agency change (that is SIGNAL_AGENCY_CHANGE). Not: a tool added beside the existing one, or a whole new website (that is SIGNAL_REBRANDING). Hinweise: neue Performance-Agentur, Performance-Marketing-Agentur, Tracking-Agentur, wechselt den Tracking-Anbieter, Umstellung des Trackings, Server-Side-Tracking, neues Consent-Management, neuer Cookie-Banner, Consent Management Platform, Wechsel des Tag-Managers, Google Tag Manager, Matomo statt Google Analytics, Umstieg auf GA4, betreut künftig das Tracking, Webanalyse übernimmt
- SIGNAL_CAMPAIGN_PLANNED — The company announces or plans a campaign, a launch communication or a media plan that has NOT started yet — a start date after the item's own date, a pitch or tender for a campaign, 'plant', 'startet im …', 'ab März'. The budget for it is not yet placed. A campaign that is already running or about to end is SIGNAL_AD_ACTIVITY. A new product on its own is SIGNAL_PRODUCT_NEWS; emit both when the item names the planned launch campaign. Not a competitor at the client (that is SIGNAL_COMPETITOR). Hinweise: plant eine Kampagne, Kampagne geplant, startet im Herbst, ab März, wird gelauncht, Launch-Kampagne, Kampagnenstart, Mediaplanung für, schreibt die Kampagne aus, sucht Agentur für die Kampagne, Jubiläumskampagne geplant, Kampagne in Produktion, wird gerade produziert, Dreh, startet demnächst, kommt in Kürze. NOT this code when the campaign is already running or ends soon ('läuft', 'ist gestartet', 'aktuelle Kampagne', 'endet') — that is SIGNAL_AD_ACTIVITY. A campaign that is being PRODUCED or starts soon has NOT started yet — it is this code.
- SIGNAL_ANNIVERSARY_PLAIN — A company anniversary that the item only reports — no campaign, no special products or editions, no event, no promotion named. Good to know for a client; nothing to act on. An anniversary WITH such communication is SIGNAL_ANNIVERSARY. Hinweise: feiert … Jahre, Jubiläum, besteht seit, wird 50, Firmenjubiläum, Gründung vor — with NO campaign, product, event or promotion named for it.
- SIGNAL_EVENT_UPCOMING — The company WILL take part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event takes place after the item's own date. A past event, or one with no date, is SIGNAL_EVENT. Hinweise: wird ausstellen, ist vertreten auf, präsentiert auf der kommenden, Aussteller auf, spricht auf, Messeauftritt geplant, Termin der Messe after the item's date.
- CONTRACT_COMPLIANCE_DECLARATION — A customer, a public buyer or a tender asks us for a compliance, conformity or self-declaration, or we send one back — sanctions and export control (for example a self-declaration on EU sanctions, an end-use or recipient declaration), packaging (PPWR), REACH / RoHS, a supplier code of conduct, an ESG or sustainability questionnaire. Not: a non-disclosure agreement — that is CONTRACT_NDA. Hinweise: Eigenerklärung, Konformitätserklärung, Sanktionen, Russland-Sanktionen, Endverbleibserklärung, Empfängererklärung, Exportkontrolle, PPWR, Verpackungsverordnung, REACH, RoHS, Lieferantenkodex, Code of Conduct, Nachhaltigkeitsfragebogen, ESG
- SUPPLIER_DELIVERY_DELAY — A supplier of ours (a company we buy from) tells us that goods WE ordered come late, only in part or not at all — a moved delivery date, a backorder, a production or carrier delay, an article no longer available. Our customers may wait for these goods. Not: a customer complaining about OUR delay — that is COMPLAINT_TIMING. Hinweise: Lieferverzug, Lieferverzögerung, Liefertermin verschiebt sich, neuer Liefertermin, Rückstand, Backorder, nicht lieferbar, verspätet, Teillieferung, Spedition hat noch nicht übernommen, delayed, backorder
- SUPPLIER_PRICE_CHANGE — A supplier or manufacturer we buy from, or one that offers to supply us, sends a new or changed price list, new purchase or dealer prices, or a price increase for goods we buy or could buy. Not: a customer asking US for prices — that is SALES_PRICE_REQUEST. Not: a change of OUR own prices — that is INTERNAL_PRICE_CHANGE. Hinweise: Preisliste, neue Preise, Preiserhöhung, Preisanpassung, Händlerpreise, Einkaufspreise, gültig ab, price list, price increase, dealer prices

DATES (signalFacts) — copy dates, never compute with them:
- `contractEndDate`: when the item states when a contract term ends / expires, copy that date as YYYY-MM-DD.
- `proposedMeetingDate`: when the item proposes or schedules a meeting on a specific date, copy it as YYYY-MM-DD.
- Empty string for either when the item states no such date. Never guess or derive one.

🔴 These categories depend on those dates, and the SYSTEM does the arithmetic — not you:
- CONTRACT_FRAME_EXPIRY: emit it whenever the item discusses a framework/rolling contract's term AND you filled in `contractEndDate`. Do NOT try to work out whether the date is near — the system checks that and drops the code if it is not.
- MEETING_DELAYED: emit it whenever the item proposes a meeting AND you filled in `proposedMeetingDate`. The system decides whether that is unusually far out.

MONEY (signalFacts.amounts) — every monetary figure the item states:
- Emit one entry per DISTINCT figure, most significant first, at most 5. A contract value, an order total, a quoted price, an invoiced sum, a per-article price, a stated budget, a fee — all qualify.
- Read the number correctly and emit it as a plain number: European '48.000,00 €' is 48000, '1.234,50' is 1234.5, '€ 12k' is 12000. Never emit the digits as written when the formatting says otherwise.
- Set `currency` to the ISO 4217 code (€ → EUR, $ → USD, £ → GBP). Empty string only when the item quotes a bare number with no currency anywhere.
- `scope` is the BASIS: total for a whole sum, per_unit for a price per piece / licence, per_month / per_year for a recurring rate. Getting this wrong makes the system state the wrong number, so read the wording ('pro Stück', 'monatlich', 'insgesamt').
- When an item states net AND gross AND VAT, emit them as separate entries — do not add, subtract or reconcile them.
- NEVER convert between currencies, never sum figures, never carry a figure over from a quoted earlier message unless this item restates it.
- `evidence` must quote the phrase the figure came from. An entry you cannot quote for is discarded.
- Empty array when the item mentions no money. That is the normal case for most items.

DEADLINES (signalFacts.deadlines) — dates by which something must be DONE:
- A deadline is an obligation with a date: 'bitte bis Freitag bestätigen', 'Angebot gültig bis 31.08.', 'send the documents by the 20th', 'I need an answer within 14 days', 'Zahlungsziel 30 Tage'.
- 🔴 A deadline is a date by which someone must ACT — submit, register, reply, pay, deliver, sign. The date of an EVENT (a trade fair, a premiere, a presentation), a market launch, an 'available from' date or a delivery-to-dealers date is NOT a deadline: nobody has to do anything by it.
- NOT a deadline: a meeting time (that is `proposedMeetingDate`), a contract end date (that is `contractEndDate`), a date something merely happened on, or a vague 'soon' / 'asap' with no date you can pin down.
- 🔴 The `evidence` quote MUST contain the date as it is written in the item (e.g. '16.10.2026', '16. Oktober', 'October 16, 2026'), unless the date is resolved from a relative phrase ('bis Freitag'). A date that appears in no quote is discarded.
- 🔴 The item's OWN DATE is given to you at the top of the input. Relative deadlines ('by Friday', 'next week', 'in 14 days', 'end of the month') MUST be resolved against THAT date, never against today, and marked `precision: "resolved"`. A date written out in the item is `precision: "exact"`.
- If the item's own date is not given to you, emit ONLY deadlines whose date is written out. Never invent an anchor.
- `what` says what has to be done, in a few words, in the item's own language. `owner` says which side owes it — use `unknown` rather than guessing.
- `evidence` must quote the phrase. At most 5, and an empty array is the normal case.

SUBJECTS (`subjects`) — the separate matters of work in this item:
- One entry per (company × matter). A second entry for the SAME company only when it needs a DIFFERENT action (an offer request and a complaint in one mail = two entries; a question and its reminder = one).
- `counterparty` = the OTHER company the matter is with — the counterpart of OUR organisation (named at the top of the input): in a mail we received, the sender's company; in a mail WE wrote (our reply, our order, our forward to a customer or supplier), the recipient's company or the company the matter is about. NEVER our own organisation, never a company only mentioned. Empty string only for internal work of our own organisation.
- `onBehalfOf` = the company the matter really belongs to when the counterparty only acts FOR it (its consultant, agency, IT / punchout / logistics provider writing about that company's order, connection or project); empty string otherwise.
- Copy reference numbers (offer, order, invoice, confirmation, contract) and product names exactly as written. At most 6 entries; an empty array when the item holds no business matter.
- Each signal category, money figure and deadline lists the subjects it belongs to in its own `subjects` (0-based positions); an empty array = all of them.
~~~~

#### Profile `press`

~~~~text
═══════════════════════════════════════════════════════════
SIGNAL CLASSIFICATION (signalCategories / signalFacts)
═══════════════════════════════════════════════════════════

Classify this item against the fixed taxonomy below. This is INDEPENDENT of the other fields — it describes what business event the item represents, not who is in it.

Rules that apply to every code:
- Emit a code ONLY when you can quote a phrase from this item that triggered it. Put that phrase, verbatim, in `evidence`. An entry with empty evidence is discarded, so a code you cannot quote for is wasted output.
- Emitting NOTHING is a normal, correct outcome. Most items match no category at all. Never reach for the closest-looking code to avoid an empty array.
- `confidence`: high = the cue is explicitly present; medium = strongly implied; low = a guess. Low-confidence entries are recorded but count for nothing, so prefer omitting them.
- Judge only what is IN this item. Do not infer from what a thread probably contained earlier, and never assume elapsed time.

- 🔴 `about` on each category: `subject` for an event of the company that ACTS in the headline (most codes); `other` for an event of the company it rescues, buys or partners with, told as background — e.g. the insolvency of a brand the subject is rescuing — even when that company is also our client. An `other` code never decides the card.
CATEGORIES — emit at most 3, most significant first:
- SIGNAL_INSOLVENCY — Insolvency proceedings, a payment freeze, or restructuring. Not: bad press. Not: an item that reports that a buyer takes over or rescues the brand or business of an insolvent company — that is SIGNAL_MERGER for the buyer, and the insolvency is context on that item, not a code. Still this code when the item is about the company's OWN insolvency and a takeover is only mentioned. Hinweise: Insolvenzantrag, Insolvenzverfahren eröffnet, Konkurs, Zahlungsunfähigkeit, Sanierungsverfahren beantragt, Zahlungsstopp. NOT this code when the item reports the RESCUE or takeover out of an insolvency — 'rettet', 'übernimmt', 'Sanierungsplan angenommen', 'Fortführung gesichert' — that is SIGNAL_MERGER. A buyer that takes over the brand or business of an insolvent company: SIGNAL_MERGER for the buyer, and the insolvency is context on that item, never a second code. Still this code when the item is about the company's OWN insolvency and a buyer or takeover is only mentioned as a possibility. (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_DOWNSIZING — A site closure or layoffs at the client. (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_AGENCY_CHANGE — An advertiser reviews or moves its advertising, media or PR account (Etat): it puts the account out to pitch or tender ('schreibt den Etat aus', 'der Pitch läuft', 'sucht eine neue Agentur'), parts with its agency ('Agentur X ist raus'), or announces the new agency after a pitch. When the item names the winning agency, ALSO emit SIGNAL_ACCOUNT_WIN. When the agency that lost the account is OUR competitor and the advertiser is not our client, emit COMPETITOR_LOST_CLIENT instead. Not a new campaign by the existing agency (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY), and not a first appointment with no pitch and no previous agency (that is SIGNAL_ACCOUNT_WIN alone). Hinweise: schreibt den Etat aus, schreibt den Mediaetat neu aus, Etat-Ausschreibung, Pitch läuft, startet einen Pitch, Agentur-Pitch, sucht eine neue Agentur, stellt den Etat auf den Prüfstand, Agenturwechsel, wechselt die Agentur, trennt sich von der Agentur, ist raus, verliert den Etat, Pitch-Entscheidung. When the article names the agency that held the account UNTIL NOW (the incumbent: 'betreute bisher', 'bisherige Agentur', 'Bestandsagentur') — also in a tender ('schreibt neu aus', 'Neuausschreibung') — give this code to that agency's subject too, not only to the advertiser: each side is its own matter.
- SIGNAL_NEGATIVE_PRESS — Criticism, a shitstorm, or negative coverage. The company keeps operating. Also a product recall or a safety warning naming the company.
- SIGNAL_NEW_MARKETING_LEAD — New leadership for marketing, brand or communications — the position that decides on our business. Hinweise: NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_MERGER — Control changes: acquisition, merger, majority stake. Hinweise: Übernahme, übernimmt, kauft, Fusion, fusioniert, Zusammenschluss, Mehrheitsbeteiligung, Mehrheit übernommen. Also a takeover of the brand or business OUT OF an insolvency (Sanierung, Rettung) — 'rettet', 'übernimmt die insolvente', 'Sanierungsplan angenommen', 'Fortführung gesichert': this code for the buyer; the insolvency is context on that item, not SIGNAL_INSOLVENCY.
- SIGNAL_COMPETITOR — A competitor becomes visible at the client. Without a link to the client it is not a signal. (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_PRODUCT_NEWS — A new product, relaunch, facelift, reissue, or range extension that the company SELLS. Not: goods the company buys for its own operations (vehicles for its fleet, machines, IT) — that is SIGNAL_OPERATIONS_INVESTMENT. Not: a product data sheet, technical sheet, certificate, declaration of conformity, manual, price list or catalogue page sent with an offer, an order or a request — that is information about an existing product, no event. Hinweise: neues Produkt, neues Angebot, neue Dienstleistung, Launch, Relaunch, Facelift, Neuauflage, Sortimentserweiterung, neues Programm für Firmenkunden (z. B. betriebliche Gesundheitsförderung). A new service or offer line counts too, also one for business customers.
- SIGNAL_EXPANSION — A new location, a new market or growth with headcount increase — a new store, branch, site or market entry, or new staff for one. 🔴 Only in the country or region the item's market is about: a new plant, site, store or market ABROAD is NOT this code — e.g. an Austrian retailer opening stores in Romania, an Austrian company building sites in Germany, an agency unit in Switzerland, a factory in Italy reported by an Austrian outlet. Emit nothing for such an expansion; other news in the same item keeps its own code. The card system also checks the place against the regions in the organization profile. Hinweise: neuer Standort, eröffnet, Filiale, Niederlassung, Markteintritt, expandiert nach, baut aus, stellt ein, neue Arbeitsplätze. NOT this code for a site, plant, store or market in ANOTHER country than the one the item reports for (Rumänien, Deutschland, Schweiz, Italien … in an Austrian outlet) — then emit no expansion code at all. NOT this code: general growth talk without a named new site in our regions ('mehr räumliche Präsenz', 'Wachstumsstrategie', 'will expandieren'). IS this code: a completed housing or building project that is now for sale or to let (a new site that has to be marketed).
- SIGNAL_FUNDING — A funding round, or a new stake, without control changing.
- SIGNAL_C_LEVEL_CHANGE — A change in leadership outside marketing — CEO / Geschäftsführung, CFO, COO, CTO, HR, head of sales (Vertrieb), the managing director of a division or business unit (e.g. 'Geschäftsführung Gastronomie'), or a board or presidium seat (Vorstand, Aufsichtsrat, Präsidium). A new head of marketing, brand or communications is SIGNAL_NEW_MARKETING_LEAD instead. Not: a change that took effect more than 6 months before the item's own date. Hinweise: neuer CEO, neue Geschäftsführerin, neuer Geschäftsführer, übernimmt die Geschäftsführung, Vorstand, Vorstandsvorsitz, CFO, Finanzvorstand, COO, CTO, Personalchef, verstärkt das Führungsteam, Vertriebsleiterin, Vertriebsleiter, Leitung Vertrieb, Head of Sales, Geschäftsführung einer Sparte oder eines Bereichs (z. B. Geschäftsführung Gastronomie), Bereichsleitung, Spartenleitung, Präsidium, Präsidentin, Präsident, Aufsichtsrat. NOT this code when the change took effect MORE than 6 months before the item's own date — old news, e.g. an article from October 2026 about someone in the role 'seit November 2025'. A vague date ('seit dem Frühjahr', 'vor einigen Monaten') counts as 3–6 months ago and IS this code; no date at all = a new change.
- SIGNAL_REBRANDING — A new name, new logo or new brand identity — or a new or relaunched website (including a move to a new CMS), which also has to be made known. Hinweise: neuer Markenname, neues Logo, Rebranding, neuer Markenauftritt, Corporate Design, Website-Relaunch, neue Website, Relaunch, neues CMS, Umstellung auf
- SIGNAL_STRATEGY_ANNOUNCEMENT — A strategic direction decision with a NAMED marketing, communication, advertising or budget consequence — a new communication or brand strategy, a repositioning, a marketing budget raised or cut — but no concrete action yet. Catch-all for such decisions: fires only when no more specific H-category applies. Not: a strategic statement without such a consequence (production, plants, organisation, an interview about the business) — that is SIGNAL_STRATEGY_CONTEXT. Not: budget moving between channels — that is SIGNAL_CHANNEL_SHIFT. Hinweise: neue Kommunikationsstrategie, Markenstrategie, Neupositionierung, Marketingbudget erhöht, Werbebudget gekürzt, Budget wird überprüft, mehr in Marke investieren
- SIGNAL_CHANNEL_SHIFT — Budget shifts between advertising or marketing channels while the total stays about the same (from print to digital, from TV to social).
- SIGNAL_PRODUCT_DISCONTINUED — The client takes a product off the market. The ad budget for it disappears. (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_NEW_COMPANY — A company is newly founded.
- SIGNAL_TRADEMARK — A trademark or domain is registered. An early indicator.
- SIGNAL_JOB_POSTING — A role relevant to us is advertised.
- SIGNAL_EVENT — The company took part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event is OVER, or the item gives no date for it. An event that takes place AFTER the item's own date is SIGNAL_EVENT_UPCOMING. Hinweise: war vertreten, präsentierte auf, stellte aus, Rückblick, nahm teil, auf der Messe gezeigt. NOT this code when the event is still to come ('wird ausstellen', 'ist vertreten auf der kommenden', a date after the item's date) — that is SIGNAL_EVENT_UPCOMING.
- SIGNAL_IPO — An IPO, or its announcement.
- SIGNAL_ANNIVERSARY — A company anniversary that the company COMMUNICATES — the item names a campaign, special products or editions, an event, promotions or advertising around it. An anniversary with no such communication named is SIGNAL_ANNIVERSARY_PLAIN. Hinweise: Jubiläum mit Kampagne, Jubiläumskampagne, Jubiläumsedition, Sondermodell, Sonderedition, Jubiläumsaktion, Jubiläumsfest, feiert mit Aktionen, zum Jubiläum gibt es. NOT this code when the item only reports the anniversary ('feiert 50 Jahre', 'besteht seit 100 Jahren') with no campaign, product, event or promotion — that is SIGNAL_ANNIVERSARY_PLAIN.
- SIGNAL_SPONSORING — The client engages as a sponsor.
- SIGNAL_INDUSTRY_TREND — Regulation or an industry development with a nameable consequence for the client.
- SIGNAL_RESULTS_POSITIVE — Published figures moving in a positive direction. Needs a number and a comparison period.
- SIGNAL_RESULTS_NEGATIVE — Published figures moving in a negative direction. Needs a number and a comparison period.
- SIGNAL_AWARD — An award or prize the company receives.
- COMPETITOR_NEW_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) wins a new client, account, budget (Etat) or pitch. The won client is usually named in the same text. Not when the winner is not our competitor (that is SIGNAL_ACCOUNT_WIN), and never our own win. Hinweise: Mitbewerber gewinnt Etat, gewinnt den Pitch, holt sich den Etat, Etat geht an (Mitbewerber), setzt künftig auf (Mitbewerber), neuer Kunde der Agentur, betreut künftig (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- COMPETITOR_LOST_CLIENT — A competitor of ours (a company the item or our watch list names as our rival, offering what we offer) loses or parts with a client, account or budget (Etat) — an opening to pitch that client. The lost client is usually named in the same text. Hinweise: verliert den Etat, Etat neu ausgeschrieben, trennt sich von (Mitbewerber), Zusammenarbeit beendet, ist raus, Pitch verloren, wechselt von (Mitbewerber) (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_PARTNERSHIP — The client enters a cooperation or partnership with a third party — a joint campaign, a joint venture, a distribution deal. Not a change of control (that is SIGNAL_MERGER). Hinweise: Kooperation, Partnerschaft, Zusammenarbeit, Joint Venture, gemeinsam mit, kooperiert
- SIGNAL_AD_ACTIVITY — The company is visibly running paid advertising NOW, or a campaign is about to end — a campaign seen in a medium or an ad library, a spot on air, a current affiliate programme. A hint that a marketing budget exists, NOT a measured spend and NOT a competitor at the client (that is SIGNAL_COMPETITOR). A campaign that is announced or planned and has NOT started yet is SIGNAL_CAMPAIGN_PLANNED. Hinweise: läuft, ist gestartet, aktuelle Kampagne, schaltet, ist zu sehen, on air, Spot, Anzeige, Affiliate-Programm, endet, nur noch bis. NOT this code when the campaign starts AFTER the item's date ('plant', 'startet im …', 'ab März', 'wird gelauncht') — that is SIGNAL_CAMPAIGN_PLANNED. NOT this code: a yearly marketing budget or ad-spend figure in a financial report or results article ('investierte 3,2 Milliarden Euro in Marketing') — that is part of the results, not a running campaign.
- SIGNAL_ACCOUNT_WIN — An agency wins an advertiser's account, budget (Etat) or pitch, and the item names the winner: 'X gewinnt den Etat von Y', 'Y setzt auf Agentur X', 'der Etat geht an X', 'X betreut künftig Y'. Emit it when the subject is the agency OR the advertiser — it is one event seen from either side. When the award replaces a previous agency or ends a pitch, ALSO emit SIGNAL_AGENCY_CHANGE. When the winning agency is OUR competitor, emit COMPETITOR_NEW_CLIENT instead. Not the advertiser's own campaign (that is SIGNAL_CAMPAIGN_PLANNED or SIGNAL_AD_ACTIVITY). Never an order placed with us. Hinweise: Etatgewinn, gewinnt den Etat, gewinnt den Pitch, Pitch gewonnen, holt sich den Etat, Etat geht an, Media-Etat geht an, setzt auf (Agentur), setzt künftig auf, betreut künftig, übernimmt die Betreuung, neue Lead-Agentur
- SIGNAL_OPERATIONS_INVESTMENT — A company buys goods or services for its OWN operations — vehicles for its fleet, logistics, machines, IT, buildings or energy — with no new product, no new location for customers and no marketing budget named. One event seen from two sides: the buyer invests, the supplier wins the order; emit it when the subject is either party. Not a new product or range (that is SIGNAL_PRODUCT_NEWS), not a new site or market (SIGNAL_EXPANSION), not a cooperation (SIGNAL_PARTNERSHIP). Hinweise: investiert in, schafft an, Anschaffung, neue Lkw, E-Lkw, Fuhrpark, Flotte, Logistikzentrum, Zentrallager, modernisiert, stellt um auf, liefert an, erhält den Auftrag, Großauftrag
- SIGNAL_STRATEGY_CONTEXT — A company's strategic statement, plan or debate WITHOUT a named marketing, communication or budget consequence — production sites and plants, organisation, a market outlook, an interview about the business. Worth knowing for the next conversation, not a sales trigger. When a marketing, communication, advertising or budget consequence IS named, it is SIGNAL_STRATEGY_ANNOUNCEMENT (or SIGNAL_CHANNEL_SHIFT). Not: a product data sheet, a specification, a tender document or an offer — those are no strategy statement. Hinweise: Interview, Strategie, Ausrichtung, Standortfrage, Werke, Produktion, Standortdebatte, Zukunftspläne, Marktausblick, Restrukturierung ohne Abbau
- SIGNAL_TRACKING_VENDOR_CHANGE — A company changes the performance-marketing or tracking agency that runs its web analytics and campaign tracking, OR replaces an external tracking / tag tool it relies on with another of the same kind: tag manager, web analytics, consent / cookie-banner tool, ad pixels or conversion tracking (for example Google Tag Manager → Tealium, Cookiebot → Usercentrics). A technology scan that shows one such tool gone and another in its place counts. Not: an advertising, media or PR agency change (that is SIGNAL_AGENCY_CHANGE). Not: a tool added beside the existing one, or a whole new website (that is SIGNAL_REBRANDING). Hinweise: neue Performance-Agentur, Performance-Marketing-Agentur, Tracking-Agentur, wechselt den Tracking-Anbieter, Umstellung des Trackings, Server-Side-Tracking, neues Consent-Management, neuer Cookie-Banner, Consent Management Platform, Wechsel des Tag-Managers, Google Tag Manager, Matomo statt Google Analytics, Umstieg auf GA4, betreut künftig das Tracking, Webanalyse übernimmt
- SIGNAL_CAMPAIGN_PLANNED — The company announces or plans a campaign, a launch communication or a media plan that has NOT started yet — a start date after the item's own date, a pitch or tender for a campaign, 'plant', 'startet im …', 'ab März'. The budget for it is not yet placed. A campaign that is already running or about to end is SIGNAL_AD_ACTIVITY. A new product on its own is SIGNAL_PRODUCT_NEWS; emit both when the item names the planned launch campaign. Not a competitor at the client (that is SIGNAL_COMPETITOR). Hinweise: plant eine Kampagne, Kampagne geplant, startet im Herbst, ab März, wird gelauncht, Launch-Kampagne, Kampagnenstart, Mediaplanung für, schreibt die Kampagne aus, sucht Agentur für die Kampagne, Jubiläumskampagne geplant, Kampagne in Produktion, wird gerade produziert, Dreh, startet demnächst, kommt in Kürze. NOT this code when the campaign is already running or ends soon ('läuft', 'ist gestartet', 'aktuelle Kampagne', 'endet') — that is SIGNAL_AD_ACTIVITY. A campaign that is being PRODUCED or starts soon has NOT started yet — it is this code.
- SIGNAL_ANNIVERSARY_PLAIN — A company anniversary that the item only reports — no campaign, no special products or editions, no event, no promotion named. Good to know for a client; nothing to act on. An anniversary WITH such communication is SIGNAL_ANNIVERSARY. Hinweise: feiert … Jahre, Jubiläum, besteht seit, wird 50, Firmenjubiläum, Gründung vor — with NO campaign, product, event or promotion named for it. (ONLY when the company is our client, named as such in the SUBJECT line — never for any other company.)
- SIGNAL_EVENT_UPCOMING — The company WILL take part in a congress, trade fair or event — as exhibitor, speaker or partner — and the event takes place after the item's own date. A past event, or one with no date, is SIGNAL_EVENT. Hinweise: wird ausstellen, ist vertreten auf, präsentiert auf der kommenden, Aussteller auf, spricht auf, Messeauftritt geplant, Termin der Messe after the item's date.

DATES (signalFacts) — copy dates, never compute with them:
- `contractEndDate`: when the item states when a contract term ends / expires, copy that date as YYYY-MM-DD.
- `proposedMeetingDate`: when the item proposes or schedules a meeting on a specific date, copy it as YYYY-MM-DD.
- Empty string for either when the item states no such date. Never guess or derive one.

🔴 These categories depend on those dates, and the SYSTEM does the arithmetic — not you:

MONEY (signalFacts.amounts) — every monetary figure the item states:
- Emit one entry per DISTINCT figure, most significant first, at most 5. A contract value, an order total, a quoted price, an invoiced sum, a per-article price, a stated budget, a fee — all qualify.
- Read the number correctly and emit it as a plain number: European '48.000,00 €' is 48000, '1.234,50' is 1234.5, '€ 12k' is 12000. Never emit the digits as written when the formatting says otherwise.
- Set `currency` to the ISO 4217 code (€ → EUR, $ → USD, £ → GBP). Empty string only when the item quotes a bare number with no currency anywhere.
- `scope` is the BASIS: total for a whole sum, per_unit for a price per piece / licence, per_month / per_year for a recurring rate. Getting this wrong makes the system state the wrong number, so read the wording ('pro Stück', 'monatlich', 'insgesamt').
- When an item states net AND gross AND VAT, emit them as separate entries — do not add, subtract or reconcile them.
- NEVER convert between currencies, never sum figures, never carry a figure over from a quoted earlier message unless this item restates it.
- `evidence` must quote the phrase the figure came from. An entry you cannot quote for is discarded.
- 🔴 `about`: this is a third party's article. `subject` ONLY for a figure of the company the article is ABOUT (its own deal, order, investment, funding, budget, revenue). A market or industry total, a stock exchange's turnover, an index, a country's or a public budget, or ANOTHER company's figure is `other` — it is never the value of a deal with that company.
- Empty array when the item mentions no money. That is the normal case for most items.

DEADLINES (signalFacts.deadlines) — dates by which something must be DONE:
- A deadline is an obligation with a date: 'bitte bis Freitag bestätigen', 'Angebot gültig bis 31.08.', 'send the documents by the 20th', 'I need an answer within 14 days', 'Zahlungsziel 30 Tage'.
- 🔴 A deadline is a date by which someone must ACT — submit, register, reply, pay, deliver, sign. The date of an EVENT (a trade fair, a premiere, a presentation), a market launch, an 'available from' date or a delivery-to-dealers date is NOT a deadline: nobody has to do anything by it.
- NOT a deadline: a meeting time (that is `proposedMeetingDate`), a contract end date (that is `contractEndDate`), a date something merely happened on, or a vague 'soon' / 'asap' with no date you can pin down.
- 🔴 The `evidence` quote MUST contain the date as it is written in the item (e.g. '16.10.2026', '16. Oktober', 'October 16, 2026'), unless the date is resolved from a relative phrase ('bis Freitag'). A date that appears in no quote is discarded.
- 🔴 The item's OWN DATE is given to you at the top of the input. Relative deadlines ('by Friday', 'next week', 'in 14 days', 'end of the month') MUST be resolved against THAT date, never against today, and marked `precision: "resolved"`. A date written out in the item is `precision: "exact"`.
- If the item's own date is not given to you, emit ONLY deadlines whose date is written out. Never invent an anchor.
- `what` says what has to be done, in a few words, in the item's own language. `owner` says which side owes it — use `unknown` rather than guessing.
- `evidence` must quote the phrase. At most 5, and an empty array is the normal case.
~~~~

## 6. Own-org attribution

`source_item.org_attribution` = internal / external / unknown. Internal-only codes (blocks flagged `internal_only` in the dictionary) survive only on items that are internal by the explicit allow-list below; `unknown` counts as external.

Allow-list proofs (`matchedOn` tags): `sent_folder`, `sender_member_email`, `own_identity_email`, `sender_org_domain`, `own_identity_domain`

## 7. Organization filter rule — grammar

One `rule` row per org, designated in `organization.parser_rule_id` (Account → Sources). An ADD-ON to the generic filters, never a replacement.

| Section | Checked | Cost |
| --- | --- | --- |
| `## BLOCK SUBJECTS` | before the provider is contacted | zero |
| `## BLOCK SENDERS` | before the provider is contacted | zero |
| `## FILTER TOPICS` | inside the parse call | prompt tokens |

Limits: pattern min length 2 · max 200 patterns · topics max 4000 chars. Audit string: `org-filtered[subject|sender|topic]: … — rule <id>@<updated_at>`.

## 8. Per organization

| Organization | Filter rule | Subjects | Senders | Topics | Blocklist entries | Own-identity claims |
| --- | --- | --- | --- | --- | --- | --- |
| Ditachmair & Partner | — | — | — | — | — | — |
| Emre Kücükkaya | — | — | — | — | company 311 · email 30 · domain 314 | domain 3 · company_alias 8 |
| GEFAS Safety GmbH | — | — | — | — | company 2 · person 1 · email 1 · domain 1 | email 5 · domain 1 |
| Grundauf DMA GmbH | — | — | — | — | — | — |
| IN4COM | — | — | — | — | — | — |
| TEST ORG | — | — | — | — | person 1 · email 2 | — |
| tele.at | — | — | — | — | — | — |
| truffalo.ai | — | — | — | — | person 1 · company 86 · domain 8 | email 3 · company_alias 2 · domain 1 |
| ÄrzteVerlag GmbH | — | — | — | — | — | domain 1 |

Blocklist and own-identity rows hold personal data, so this export shows counts only. Tables: `discovery_blocklist`, `own_identity`.
