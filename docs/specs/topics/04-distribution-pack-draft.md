# Topics — IN4COM signal pack (draft for the workshop)

Status: **draft proposal**, 2026-11-10 — to be confirmed by the IN4COM business users who also review the tests (Q25 / Q17 in [02-open-questions.md](02-open-questions.md)). No meeting is required: they review this file and answer §3.

Scope of step one (Q26): **deals only.** Deal = a general agreement / contract with the client. Order = purchase of a specific product or service. Order codes below create topics and cards (attention) but no automation; the order-flow link is a later step.
Pilot org: IN4COM (`1dNkC4rBtl9FEvnK95Svlfs63oSU57Ni`), B2B wine / spirits distributor. Clients: HoReCa (`on_trade`), retail (`off_trade`), own needs, internet shops.

The pilot uses two packs: a **subset of `base`** (Truffalo v204 codes with Russian texts) and the new **`distribution`** pack. Weights, profiles and recipients below are proposals.

Legend:
- Weight 0–9 → default profile: 1–3 W1 «Неделя», 4–5 D4 «Сводка», 6–7 P6 «Сейчас» (≤3/day), 8–9 P8 «Сейчас».
- Class: risk / chance / fyi / state (state = closes, no card).
- Effort: quick / medium / complex. REQ = the client asks us for an action (topic waits on us).
- Recipient roles: `sales` = client's responsible manager (`client.responsible_user_id`), `finance`, `logistics`.
- Deal = may create or move a deal (Q26, Q27). Order = linked to the order flow in a later step; in step one, attention only.

---

## 1. New `distribution` codes

### 1.1 Orders (family `order`)

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `ORDER_REQUESTED` | Клиент прислал заказ | 7 | chance | quick | ✓ | sales | Order (later: «Создать заказ», replaces `new_order`) |
| `ORDER_CHANGE_REQUESTED` | Клиент просит изменить заказ | 6 | risk | quick | ✓ | sales | Order |
| `ORDER_CANCELLED` | Клиент отменил заказ | 7 | risk | quick | — | sales | Order |
| `ORDER_CONFIRMED` | Мы подтвердили заказ / выставили счёт | 0 | state | — | — | — | Closes `ORDER_REQUESTED`, `ORDER_CHANGE_REQUESTED`. Later also emitted from the order status in the CRM (no LLM). |

- `ORDER_REQUESTED` — Event: the client names positions and quantities to ship («прошу отгрузить», «заказ на», «нужно 12 кор.», «пришлите … бут.», a list of SKUs with numbers). **Boundary:** a price or availability question without quantities (→ `SALES_PRICE_REQUEST` / `STOCK_AVAILABILITY_REQUEST`); our own offer; a supplier's order confirmation to us.
- `ORDER_CHANGE_REQUESTED` — «добавьте в заказ», «уберите позицию», «замените на», «перенесите отгрузку». Boundary: a new separate order (→ `ORDER_REQUESTED`).
- `ORDER_CANCELLED` — «отменяем заказ», «заказ не нужен», «не отгружайте». Boundary: a delay request («перенесите») is a change, not a cancel.

### 1.2 Stock, samples, tastings (family `offer`)

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `STOCK_AVAILABILITY_REQUEST` | Запрос наличия / остатков / поступления | 5 | chance | quick | ✓ | sales | — |
| `SAMPLES_REQUESTED` | Запрошены образцы | 5 | chance | medium | ✓ | sales | — |
| `TASTING_REQUESTED` | Запрошена дегустация / обучение персонала | 5 | chance | medium | ✓ | sales | — |
| `PROMO_SUPPORT_REQUESTED` | Запрошена маркетинговая поддержка | 5 | chance | medium | ✓ | sales | — |

Cues: «есть ли в наличии», «остатки», «когда будет поступление», «сколько осталось»; «пришлите образцы», «бутылку на пробу»; «дегустация», «обучение персонала», «винный ужин», «презентация вин»; «промо», «бонус за объём», «ретро-бонус», «POS-материалы», «маркетинговая поддержка».

### 1.3 Listings and venues (family `account`) — deal codes

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `LISTING_OPPORTUNITY` | Возможность ввода в карту / ассортимент | 7 | chance | complex | — | sales | **Deal entry** |
| `NEW_VENUE_OPENING` | Клиент открывает новую точку | 6 | chance | medium | — | sales | **Deal entry** |
| `DELISTING_RISK` | Клиент выводит наши позиции | 7 | risk | medium | — | sales | Deal risk (no stage move) |

- `LISTING_OPPORTUNITY` — «обновляем винную карту», «ввод в ассортимент», «листинг», «рассматриваем ваши позиции». Boundary: a single order of a new SKU is an order, not a listing.
- `NEW_VENUE_OPENING` — «открываем второй ресторан», «новая точка», «новый магазин». Boundary: a rumour or press mention without the client confirming it.
- `DELISTING_RISK` — «выводим из карты», «убираем из ассортимента», «больше не будем брать». Boundary: one SKU out of stock at the client.

### 1.4 Delivery and returns (family `delivery`)

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `DELIVERY_SCHEDULE_REQUEST` | Вопрос о сроке / окне доставки | 4 | fyi | quick | ✓ | logistics | — |
| `DELIVERY_DISCREPANCY` | Расхождение при приёмке (бой, недовложение, пересорт) | 7 | risk | medium | ✓ | logistics + sales | — |
| `DELIVERY_DISCREPANCY_RESOLVED` | Расхождение закрыто | 3 | state (S1) | — | — | logistics | Closes `DELIVERY_DISCREPANCY` on the same topic |
| `RETURN_REQUESTED` | Клиент просит возврат | 6 | risk | medium | ✓ | logistics + sales | — |

Cues: «бой», «недовложение», «пересорт», «не та позиция», «акт расхождений», «ТОРГ-2»; «замену получили», «расхождение закрыли»; «хотим вернуть», «возврат товара», «заберите». Boundary for discrepancy: a taste / quality complaint (→ base `COMPLAINT_QUALITY`).

### 1.5 Compliance: ЕГАИС, marking, licence, documents (family `delivery` / `contract`)

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `EGAIS_ISSUE` | Проблема в ЕГАИС (ТТН, остатки, акт) | 7 | risk | quick | ✓ | logistics | — |
| `EGAIS_ISSUE_RESOLVED` | Проблема в ЕГАИС решена | 3 | state (S1) | — | — | logistics | Closes `EGAIS_ISSUE` |
| `MARKING_ISSUE` | Проблема с марками (ФСМ / акцизные марки) | 6 | risk | quick | ✓ | logistics | — |
| `LICENSE_EXPIRING` | Лицензия клиента заканчивается / приостановлена | 7 | risk | medium | — | sales + finance | Date gate: `licenseEndDate` within 30 days |
| `DOCUMENTS_REQUESTED` | Запрошены документы (УПД, ТТН, сертификаты, декларации, справки А/Б) | 5 | fyi | quick | ✓ | logistics | — |

Cues: «ЕГАИС», «не можем подтвердить ТТН», «отказ от ТТН», «акт расхождений в ЕГАИС», «остатки не сходятся»; «акцизная марка», «ФСМ», «не считывается марка»; «лицензия заканчивается», «продление лицензии», «лицензия приостановлена»; «УПД», «счёт-фактура», «ТТН», «сертификат», «декларация соответствия», «удостоверение качества», «справка А», «справка Б».

### 1.6 Payment terms (family `invoice`)

| Code | Name (RU) | W | Class | Effort | REQ | Recipient | Link |
|---|---|---|---|---|---|---|---|
| `PAYMENT_TERMS_REQUEST` | Просьба об отсрочке / лимите / без предоплаты | 6 | risk | medium | ✓ | finance + sales | — |
| `PAYMENT_PROMISE` | Клиент обещал оплатить к дате | 3 | fyi | — | — | finance | Attaches to the open invoice topic; deadline owner = them |
| `RECONCILIATION_REQUESTED` | Запрошен акт сверки | 4 | fyi | quick | ✓ | finance | — |

Cues: «отсрочка», «увеличить лимит», «без предоплаты», «рассрочка»; «оплатим до пятницы», «платёж запланирован»; «акт сверки».

---

## 2. `base` codes switched on for IN4COM (Russian cues for wine distribution)

| Code | W | Note for IN4COM | Extra RU cues |
|---|---|---|---|
| `SALES_PRICE_REQUEST` | 6 | price list, special prices | «прайс», «прайс-лист», «актуальные цены», «спеццена» |
| `SALES_CATALOG_REQUESTED` | 5 | portfolio / catalog | «каталог», «портфель», «что есть из Бургундии» |
| `SALES_OFFER_REQUESTED` | 7 | individual offer (wine card, event, chain) | «КП», «коммерческое предложение», «предложите подборку» — **deal entry for new clients only** |
| `SALES_OFFER_SENT` | 0 state | closes `SALES_OFFER_REQUESTED` | «направляем предложение», «во вложении КП» (our mail) |
| `SALES_OFFER_DECLINED` | 6 | | «не подходит», «выбрали другого поставщика» |
| `SALES_RENEGOTIATION` | 7 | price / discount / terms reopened | «пересмотреть скидку», «поднять скидку», «изменить условия» |
| `SALES_TENDER_INVITATION` | 9 | chains, hotel groups, state buyers | «тендер», «закупка», «44-ФЗ», «223-ФЗ», «котировка» — **deal entry** |
| `CONTRACT_FRAME_EXPIRY` | 8 | annual supply agreement | «договор поставки заканчивается», «пролонгация», «доп. соглашение» |
| `CONTRACT_RENEWAL_INTENT` | 7 | | «продлим договор на следующий год» — **deal entry (renewal)** |
| `CONTRACT_TERMINATED` | 9 | | «расторгаем договор» |
| `INVOICE_OVERDUE` | 7 | receivables | «задолженность», «просрочка оплаты», «дебиторка» |
| `INVOICE_PAID` | 0 state | closes overdue on the same invoice topic | «оплатили», «платёжка», «платёжное поручение» |
| `COMPLAINT_QUALITY` | 7 | wine faults | «пробковый», «окислено», «осадок», «подтёк», «повреждена этикетка», «брак» |
| `COMPLAINT_TIMING` | 7 | late delivery by us | «не привезли вовремя», «опять задержка», «мы до сих пор ждём» |
| `COMPLAINT_PRICE` | 8 | incl. competitor's cheaper offer | «у другого поставщика дешевле», «нам предложили по …» |
| `COMPLAINT_QUANTITY`, `COMPLAINT_COMM`, `COMPLAINT_ESCALATED` | 7 / 7 / 8 | as base | |
| `FEEDBACK_REFERRAL`, `FEEDBACK_QUALITY_PRAISE` | 5 / 3 | | «рекомендовали вас», «гостям очень понравилось» |
| `MEETING_CANCEL`, `MEETING_URGENT`, `MEETING_URGENT_ISSUE` | 7 / 6 / 7 | | |
| `CONTACT_LEAVING`, `CONTACT_NEW_DECISION_MAKER`, `CONTACT_NEW_KNOWN_ORG`, `CONTACT_OOO` | 7 / 6 / 4 / 4 | sommelier / buyer / chef changes | «новый сомелье», «новый закупщик», «я больше не работаю в …» |
| `MAILERDEMON_RECEIVED` | inherited (5) | | |
| `SUPPLIER_DELIVERY_DELAY` | 4 → **5?** | producer / importer delay to us; affects stock | «контейнер задерживается», «задержка на таможне», «поставка от производителя переносится» |
| `SUPPLIER_PRICE_CHANGE` | 3 | producer price change | «новый прайс от производителя», «повышение цен с …» |
| `SIGNAL_INSOLVENCY` | 9 | client bankruptcy | «банкротство», «наблюдение», «конкурсное производство», «Федресурс» |

Proposed **off** for IN4COM: `SALES_BOOKING_*` (replaced by `ORDER_*`), `SALES_MATERIAL_*`, `SALES_BUDGET_*`, `CONTRACT_DPA`, `CONTRACT_NDA`, block C delivery reports, most of block H (market), J, L, M.

---

## 3. Questions for the IN4COM review

1. **Order volume:** how many orders per day arrive by email / Telegram? If many, `ORDER_REQUESTED` at weight 7 (P6, ≤3 per day per person) overflows «Сейчас». Option: weight 5 (D4 «Сводка») + deadline escalation (same-day shipment → «Сейчас»).
2. Who handles orders — the client's sales manager or an order desk (functional role `orders`)?
3. Which events must ALWAYS be «Сейчас» (P8)? Proposal: `SALES_TENDER_INVITATION`, `CONTRACT_TERMINATED`, `SIGNAL_INSOLVENCY`, `COMPLAINT_ESCALATED`.
4. Deal types IN4COM tracks (deal = agreement / contract with the client): new client / venue, listing in a wine card, chain listing, tender, annual supply agreement, renewal — others?
5. ЕГАИС / marking / licence: does IN4COM handle these by email at all, or in other systems? (If not by email, these codes stay off.)
6. Should `SUPPLIER_DELIVERY_DELAY` be a risk at weight 5 (stock shortage for clients)?
7. Missing situations? Examples from real mail are welcome; they also go into the golden set.
8. **Deal risks for IN4COM (Q30):** is the list in §4 right? Which risks are missing, and which are not risks for a distributor?

---

## 4. Deal risks for IN4COM (draft, Q30)

Requirements v2: a deal card shows «Есть риски» with a 1–2 sentence explanation of the most critical risk (spec §9.4). The v2 examples are agency risks; below is our proposal for a distributor. A risk applies only to a **deal** (agreement / contract, listing, tender, new venue — Q26), never to a single order. A risk never moves the stage.

| Risk (RU label) | Triggers (codes) | Condition / stage guard | Clears when | Severity |
|---|---|---|---|---|
| Клиент выводит позиции | `DELISTING_RISK` | deal is a listing / supply agreement | client confirms the positions stay, or a new listing | 8 |
| Конкурент предлагает дешевле | `COMPLAINT_PRICE` (competitor offer), `SALES_RENEGOTIATION` | not at the first contact stage | new terms agreed, or the client confirms our offer | 7 |
| Смена закупщика / сомелье | `CONTACT_LEAVING`, `CONTACT_NEW_DECISION_MAKER` | the person is linked to the deal (`deal_contact`) and no new contact is confirmed | the new person confirms the current terms | 6 |
| Решение откладывается | postponement events on the deal topic (`SALES_RENEGOTIATION` / meeting moves) | **2nd** distinct postponement with no new date + next step (same rule as Q24-3) | a date and a next step are agreed | 6 |
| Долг клиента | `INVOICE_OVERDUE` on the same client | open deal of this client | `INVOICE_PAID` / `PAYMENT_PROMISE` kept | 7 |
| Жёсткие условия оплаты | `PAYMENT_TERMS_REQUEST` (long deferral) | terms above the org's policy (setting) | terms agreed within policy | 5 |
| Повторные жалобы | `COMPLAINT_QUALITY`, `COMPLAINT_TIMING`, `COMPLAINT_ESCALATED` | ≥ 2 complaints of this client in 30 days, or 1 escalated | complaint topics resolved | 7 |
| Договор заканчивается без продления | `CONTRACT_FRAME_EXPIRY` | no `CONTRACT_RENEWAL_INTENT` within the date window | renewal intent or a signed renewal | 8 |
| Нет товара для поставки | `SUPPLIER_DELIVERY_DELAY`, `STOCK_AVAILABILITY_REQUEST` (out of stock) | the SKU is in the deal (listing / tender) | stock confirmed | 5 |

