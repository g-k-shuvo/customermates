# PRD 09 — What the client's live Pipedrive actually shows

Read from 13 screenshots of the production Pipedrive account (Jackim Woods & Co.,
Rich Jackim), 5 Sep 2026. Several of them carry the client's own annotations, which are
quoted verbatim below — those are requirements in their own words.

This changes the scope. Read it before the next estimate goes to the client.

---

## Already covered by the existing plan

| Observed | Where it lands |
|---|---|
| Pipeline "Engagement-Buyer Mandate", 12 stages, drag-and-drop | M2 |
| Multiple pipelines — *"sell-side vs buy-side vs consulting"* | M3 |
| Deal custom fields — Retainer, Estimated Commission, Opportunity Company, Referral Contact | Custom columns, exists |
| Days-in-stage bar on the deal header | M3 (`DealStageHistory`) |
| Overdue / no-activity warnings on kanban cards | M3 rotting + M5 |
| Activities: calls, meetings, due dates, week calendar, overdue list | M5 |
| Saved filters with saved columns and private visibility | Exists (`P13n`) |
| Deal list views filtered on title prefix (`RJ-HEO26`, 47 deals) | Exists |

The pipeline and activity work already specified maps cleanly onto how they work. That
part of the plan holds.

---

## Not in the plan — ordered by how much trouble each one is

### 1. Email sync — the Sales Inbox · **BLOCKER**

**26,549 conversations** across two mailboxes (`rjackim@jack…`, `rjackim@spor…`), with
Drafts (72), Outbox (11), Sent, Archive, follow-up status tracking, labels, and threads
linked to deals (a thread showing `RJ-25TRM - Paul…`, another `Court Reporting …`).

This is not a feature they use occasionally. It is the surface they work in all day. Every
contact, organization and deal record in their Pipedrive shows email history inline, and
the client annotated three separate screenshots to say so: *"It's important to be able to
see all of these from the individual contact's record."*

In our base, the unified inbox is in `ee/` — proprietary, Enterprise-tier, and disabled
outright when `APP_MODE=self-hosted` (`/inbox` redirects to `/dashboard`, as does
`/profile/connected-accounts`). `ConnectedAccount` is unavailable, and `Calendar`,
`CalendarEvent` and `AccountActivity` all hang off it.

Three ways out, all expensive:

- **Commercial agreement** with the upstream vendor for a self-hosted Enterprise
  deployment. Cost unknown; reintroduces a licence fee, which is the thing we sold against.
- **Build email sync ourselves** in the AGPL tree — IMAP/Gmail/Microsoft Graph
  connection, OAuth, threading, deduplication, attachment handling, linking threads to
  records, send-from-CRM. Realistically **6–10 weeks on its own**, and the hardest thing
  in the whole programme.
- **Accept it is out of scope.** The team keeps using Outlook or Gmail; the CRM holds no
  email history. Defensible, but it is a visible downgrade from what they have today and
  they will feel it on day one.

**This needs a decision from the client before anything else is quoted.** It is the one
finding capable of invalidating the base choice.

### 2. Automations — **37 active** · high

The automation list shows 37 of 150 slots in use, with real revenue-driving sequences:

- `Lead Creation // WP - How to Sell Your Court Reporting Firm for Top Dollar` (Lead Created)
- `Lead Created - EBITDA Worksheet` (Lead Created)
- `Initial Interest Email 1 - Under Contract`, `Initial Interest Email 4` (Deal Updated)
- `NDA Executed - Under Contract` (Deal Updated)
- `Executive Summary` (Deal Updated)

Our plan says automation is external n8n. That is a defensible architecture, but it means
**37 working automations have to be rebuilt in a second system**, and the client has to
learn that system or pay us to maintain it. Several are multi-step email sequences with
delays, which is real n8n work — call it **2–3 weeks** to port, plus running n8n.

Worth asking whether a small native trigger→action builder covering their actual patterns
(lead created, deal stage changed → send templated email, create task, set field) would be
cheaper than porting and maintaining 37 n8n flows. It probably would.

### 3. Merge duplicates · high

Client's own annotation: *"We have over 10,000 records in our CRM, so we need to be able
to easily dedupe records when we import new ones or the same buyers complete different
lead magnets with slightly different information."*

Their Pipedrive currently shows **229 duplicate groups in People**. There is no dedupe
tooling in our base at all.

This is directly downstream of the lead-capture work in M7 — the same buyer filling in
three different lead magnets with three spellings is exactly how those 229 groups formed.
Fuzzy match on name and email, a review-and-merge UI, field-level winner selection,
relationship re-parenting. **5–8 days.**

### 4. Bulk personalised email to a filtered list · high

Client's own annotation on the contacts view: *"When you click on multiple contacts in
this view, you can send a customized email to each contact. This is important to us for
email marketing and deal follow-up. It also allows use to create complicated lists based
on any field in the CRM."*

Their `CDI Targets` filter selects 538 people by cross-object conditions — person is on a
list AND the organization's industry is Higher Education — and they mail all of them
individually.

We have filtering. We have no bulk send, no merge fields, no send tracking, no
suppression list. And note this is a **sending** feature, so it is partly independent of
the inbox problem above — it needs SMTP and templating, not sync. **8–12 days**, plus
deliverability work that is not development.

### 5. Static lists / segments · medium

The contact records carry a `Lists` field with values like `CDI Target`, and it is used as
a filter condition. That is a named static segment a person is added to, distinct from a
saved filter. We have no equivalent — closest is a custom column, which does not support
membership operations. Either a `List` + `ContactList` model, or accept a multi-select
custom column. **3–5 days** done properly.

### 6. Documents and eSignature · medium

Client's annotation: *"Documents are things like contracts that were sent out for
eSignature."* DocuSign appears in their connected apps, and Documents is a tab on contact,
organization and deal records. No Document model exists in our base. **5–8 days** for
storage, status tracking and a DocuSign or Dropbox Sign integration.

### 7. File attachments on records · medium

Client's annotation: *"Files are attachments related to the contact."* Files is a tab on
all three record types. I listed file storage as out of scope in the client-facing
document; the screenshots show they use it. **4–6 days** with S3-compatible storage.

### 8. Invoices · low

An Invoice tab exists on the deal detail. Whether they actually use it is unknown — worth
one question rather than an assumption.

### 9. Projects · low

A Projects section appears on contact and organization records. Same — ask before costing.

### 10. Calendar sync · low, but blocked

`SYNC ACTIVE` on the activities calendar. Same `ee/` and `ConnectedAccount` problem as the
inbox. Out of scope unless item 1 is resolved.

---

## What this does to the number

The earlier estimate was 45–70 days for pipeline, migration, activities and reporting.
Adding what is visible here:

| Addition | Days |
|---|---|
| Leads + web lead capture (M7) | 9–14 |
| Merge duplicates | 5–8 |
| Bulk personalised email | 8–12 |
| Automation port to n8n *(or a native builder)* | 10–15 |
| Static lists | 3–5 |
| Documents + eSignature | 5–8 |
| File attachments | 4–6 |
| **Subtotal** | **44–68** |
| Email sync, if built | +30–50 |

So **90–140 days without email sync**, and **120–190 with it**. That is six to nine months
of one developer, against a client who is today running all of it on a subscription.

---

## What to do with this

Three questions, in this order, before any further estimate:

1. **Does the team need email inside the CRM?** 26,549 conversations says yes. If the
   answer is yes and a commercial agreement with the upstream vendor is not on the table,
   the base choice should be revisited rather than the gap built.
2. **Which of the 37 automations actually matter?** Ask them to mark the ten they would
   miss. Porting ten is a week; porting thirty-seven is a month.
3. **Invoices and Projects — used, or leftovers?** Two minutes of their time removes or
   adds two weeks of ours.

Nothing here means the plan is wrong. It means the plan was scoped against a feature
comparison, and this is scoped against how they actually work — which is always bigger.
Better to find it now than at milestone four.
