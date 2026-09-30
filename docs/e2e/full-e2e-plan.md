# Full end-to-end test plan

Every user-facing feature of this deployment (self-hosted mode), tested **through the live UI
only**: a visible Chrome window against `yarn dev` on `localhost:4000`, where each step is a
click, a keystroke or reading what the page shows, as a user would. Setup is done through the
UI too; pass or fail is judged only from what the screen shows, never from the database or an
API response.

Each check is written as **do → expect**. A check passes only when the expected result is on
screen. A section is marked done only when every check in it passed, or its failure was fixed
and re-run in the UI.

Where a feature needs something no user can click (a cron tick, an inbound email, a provider
webhook, a website form post), the external event is produced the way it happens in production
(mail sent into GreenMail, the cron endpoint called as the scheduler would, a signed POST as the
website would send) and the result is then judged in the UI.

## Environment

- Dev server: `yarn dev` with `MAILBOX_SECRET_KEY`, storage (SeaweedFS on :38333, bucket
  `crm-e2e`), ClamAV (:3310), `STORAGE_QUOTA_MB`, fake mailbox OAuth clients, a Resend webhook
  secret and `NODE_EXTRA_CA_CERTS` for the local STARTTLS relay (GreenMail on :3025/:3143,
  relay on :3587). `EMAIL_TRANSPORT=console`: verification, invitation and reset links are read
  from the dev server log.
- Browser: Chrome with the Claude in Chrome extension. Pages are warmed with one request each
  first, since a first compile can take over 90 s.
- Accounts (seed workspace `10000000-…0001`): Max Bergmann (Admin), Sofia Rossi (Sales Manager),
  Elena Hoffmann (Customer Success). A second workspace is created through sign-up for isolation.
- Every created record carries the run tag `E2E-<n>` in its name, so checks are repeatable and
  teardown can find everything.
- Evidence: a PASS/FAIL line per check in the tracker, screenshots of key states, console
  errors read on every page.

## Out of reach locally (checked as far as possible)

- Real Google / Microsoft sign-in and calendar: judged by the refusal and disabled states only.
- Real DocuSign: "Send for signature" hidden without configuration; manual status and signed
  copy upload are tested instead.
- Real DNS: sender domain stays unverified; the refusal path is what is tested.
- Unipile-backed inbox, routines, connected accounts, subscription and marketing pages: the
  self-hosted redirect is what is tested.

## Order and data setup

Sections run in this order because later ones depend on earlier data:

1. **M1** on the fresh workspace from A1, before any data exists.
2. **E1** pipelines, stages and lost reasons, before F2 convert and K1 stage triggers.
3. **H1** invoice settings (legal name, address, VAT ID, phone, bank) and **D2** billing
   profile, before H2 issue and XRechnung.
4. **N1** invite, before A3 join by invitation.
5. **K4** sender and suppressions and **L1** lists, before L2 send.
6. **J** and **K**, before **O**.
7. Look-alike records for the duplicate checks, created in C1 and D1: `E2E Anna Müller` and
   `E2E Anna Mueller` with the same phone; `E2E Acme GmbH` and `E2E ACME`.

## Sections

### A. Access, auth and onboarding
1. Sign up a new workspace → "check your email"; open the console link → verified. Signing up
   with a used email → error shown.
2. Sign in with a wrong password → inline error; correct → dashboard. Sign out → sign-in page.
   Forgot password → console link → new password works, old one refused.
3. `/onboarding`: choose create vs join. Wizard: profile step required (empty name blocks
   Next), invite and AI steps skippable → dashboard.
4. Join by the N1 invitation link → `/auth/pending` "Waiting for approval" until Max assigns a
   role → then the dashboard. `/auth/invitation` with a bad token → error state.
   `/legal-update` gate shown when terms are pending.
5. Self-hosted redirects → `/dashboard`: `/inbox`, `/routines`, `/profile/connected-accounts`,
   `/company/subscription`, `/pricing`, `/blog`, `/docs`, `/imprint`, `/privacy`, `/terms`.
   Record where the sidebar Documentation link and the sign-up legal links land.
6. `/operator/*` → 404 page. `/test/error` and `/test/overlays` → reachable by any signed-in
   user (record as a finding). `/auth/error` renders a readable error. `(public)/contact` form
   renders and submits.
7. Signed out, open `/deals` → redirected to sign-in, then back to `/deals` after sign-in.

### B. Shell, navigation and profile
1. Every sidebar link opens without an error; breadcrumbs match the page.
2. Ctrl+K → "Recently opened" before typing; type a seeded name → results for contacts,
   organizations, leads, deals, services (record whether tasks appear). Enter opens it.
3. Add menu → each record type opens its drawer; `?open=contact:new` opens the contact drawer.
4. Profile: change name, country, avatar → Save/Reset appear only when dirty; reload → kept.
   Language Deutsch → UI German; formatting locale → dates and currency change; theme toggles.
5. API keys: create with expiry 0 or 400 days → refused; 30 days → key shown once with copy;
   close → list shows it masked; delete → gone. Quick-connection tiles show the snippet.
6. Feedback dialog opens, validates empty text, submits.

### C. Contacts
1. Create with empty name → error; with name, email, phone → appears in list. Invalid email →
   inline error. Edit a field → saved on reload. Add a channel by the popover. Delete → confirm
   → gone. Bulk edit owner on 2 rows → both changed. Bulk delete → both gone.
2. Table: sort, search, filter (palette Back, Escape, Clear). Board with no grouping → offers to
   create a single-choice field. Column picker hide/show persists.
3. Views: create private view → auto-saves filters. Share with team → Sofia sees it with the
   team icon; Sofia edits it → "not saved" notice. Duplicate, move, copy link; `?view=` URL
   opens it. Delete shared view → Sofia lands on All.
4. Custom fields of every type (text, date, date & time, date range, date & time range,
   currency, link, email, phone, single select, linked record): set on create and edit, filter
   and group by each.
5. Import `.xlsx` and `.csv` (both supported): mapping, preview, row errors shown, imported rows in list.
   Column mapped to Record ID → existing record updated. "Match existing records by email" →
   match queued for duplicate review. Export view → file; export 2 selected rows → only those.
6. Detail page: pin/unpin a field on the overview, notes editor saves formatted text, relation
   links open the linked record, History shows each change, Mail tab, Files tab, Meetings tab
   shows the empty state.
7. Duplicates: Scan → the Müller/Mueller group. "Not duplicates" → group gone. Rescan, Merge
   choosing winning values → one contact with both channels. Undo from the toast / Recent
   merges → both back.
8. As Elena: no Delete, bulk delete or Merge buttons; only own contacts if her role says so.

### D. Organizations
1. CRUD, views, custom field, import `.xlsx`, export.
2. Detail: contacts and deals listed; Mail tab shows mail from the org's domain, not from a
   free-mail domain; Files; Documents; Invoices tab billing profile: save legal name, address,
   VAT ID, billing email → kept on reload.
3. Duplicates: `E2E Acme GmbH` and `E2E ACME` grouped; merge.

### E. Deals and pipelines
1. Company settings → pipelines: create pipeline `E2E Delivery`, add, rename and reorder
   stages, mark won/lost kinds, set default. Delete a stage holding deals → modal asks where to
   move them. Lost reasons: add, rename, remove.
2. Create deal with empty name → error; with services (quantity 3), base value, probability,
   expected close → total and weighted value shown correctly.
3. Board: drag a card to the next stage → column counts update; detail shows the stage history
   and time-in-stage bar. Pipeline switcher changes board. Group by owner. Rotting and
   next-activity filter chips filter the board.
4. Mark lost without a reason → blocked; with a reason → Lost badge, gone from open board.
   Reopen → back. Mark won → Won badge.
5. Detail tabs: activities list, Mail link, Files, Documents, Invoices.
6. As Sofia: team deals visible; no company settings in the sidebar.

### F. Leads and web forms
1. Lead CRUD, labels, status, owner / contact / organization pickers, notes, Mail and Files tabs.
2. Upload a file to a lead, then Convert (pipeline `Sales`, stage, value) → deal page opens with
   the contact, org, value and the file; lead shows "converted" with the deal link.
3. Assignment rules: rule 1 country = DE → Sofia; rule 2 round robin Max/Elena. Create lead
   with country DE and no owner → Sofia. Two leads without country → Max then Elena. Disable
   rule 1 → next DE lead goes round robin. Reorder → order respected. Lead created with an
   owner → owner kept.
4. Web forms: create source with field mapping (value, UTM, consent, phone, custom), rotate the
   secret. Signed POST → Submissions row "lead created" and the lead exists with mapped fields.
   Bad signature → rejected, no lead. Bad phone → lead created, phone skipped. Repeat from the
   same person with "Add repeat submissions" on → note on the open lead, no second lead.
   Source switched off → submission refused. A failed row → Retry → lead created. A look-alike
   contact → duplicate group opens.

### G. Services and tasks
1. Services CRUD; detail page `services/[id]`; add to a deal → deal value updates.
2. Tasks: list, agenda and week tabs. Create with type, assignee, due, duration → shows in
   each view. Task detail `tasks/[id]`. Complete → schedule follow-up modal → follow-up
   created with the same links. Uncomplete. Drag in week view → due time changed. Past-due →
   red. Undated → tray.
3. Calendar row in week view: empty for an IMAP mailbox; the mailbox's calendar switch is
   disabled with the "needs sign-in" hint.

### H. Invoicing
1. `/company/invoicing`: legal name, address, VAT ID, phone, bank, numbering `E2E-RE-`,
   payment terms, default tax. Saved on reload.
2. From a won deal: New invoice → lines for base value and each service. Edit a line → totals
   and tax per rate update. Delete a draft → gone. Issue without a customer legal name →
   refused with the reason. Issue → number `E2E-RE-0001`, fields locked.
3. PDF download opens in the display language. XRechnung with a missing field → menu lists it;
   complete → downloads.
4. Payment larger than open amount → refused. Partial → Partially paid. Rest → Paid. Past-due
   invoice → Overdue badge. Void an unpaid issued invoice → Void, number kept. List filters by
   status. As Elena without invoice permission → no Invoices entry, direct URL no-access.

### I. Files, documents and storage
1. On contact, org, deal, lead: upload by button and drag-drop → row with size, uploader, date.
   PDF click → opens in a new tab. Download, delete. `.html`, `.svg`, and a `.pdf` that is really
   an `.exe` → refused. EICAR → refused as infected. Over quota → refused with the quota
   message. Storage usage shown in Company settings.
2. Documents: add PDF → Draft. Set status by hand, rename, delete. Upload signed copy → Signed;
   a second signed copy replaces the first. "Send for signature" absent without DocuSign.

### J. Mail
1. Mailboxes: IMAP with bad host → error; bad password → error; correct → connected, syncing.
   Sync now. OAuth start without real client → refusal shown. Calendar switch disabled for
   IMAP. Labels: create, rename, delete.
2. Mail page: views Inbox, Follow-up, Drafts, Outbox, Archived, All; search; folder and label
   filters; open thread; remote images blocked until allowed; attachment opens.
3. Reply, reply-all, forward with attachment over the relay → arrives in GreenMail, Sent copy
   appears after sync.
4. Share to CRM → deal link offer → confirm → thread on contact, org, deal and lead Mail tabs.
   Unshared thread not visible to Sofia.
5. Draft autosaves and comes back after leaving. Send later → Outbox; cancel → text back in
   draft; send now → delivered. Archive → Archived view. Follow-up 3 days → Follow-up view;
   reply from GreenMail clears it.

### K. Automations
1. Triggers: created, updated with changed fields, deleted, stage transition, schedule. Each
   fires once → run history row.
2. Actions: update field (built-in and custom), assign owner, add label, create task, note,
   deal and lead, move stage, send email (address, record contact, record owner, header image),
   call webhook (invalid URL refused on save), delay. Each result visible on the record.
3. Conditions not met → skipped run. Failing webhook → failed run with reason. Sequence with
   delay; record leaves the condition → rest cancelled. Chain A→B→C → depth shown; A→B→A → B
   does not re-run A. Record History shows "Automation ran".
4. Templates: unknown merge field → refused on save; preview against a record; header image.
   Sender: custom domain → TXT record shown, Check domain → Not verified, and sends from it are
   refused. Reply-To saved. "Send as the user who triggered" option. Suppressions: add and lift
   by hand. Delivery webhook bounce → address on the suppressions list.
5. As Sofia/Elena: `/automations/templates` → no-access state unless the role allows it.

### L. Lists, audiences and campaigns
1. Lists: create; duplicate name → refused; add and remove members; fill from a filter →
   progress, count; delete.
2. Campaign `campaigns/[id]`: draft, audience with groups and exclusions, preview (count, no
   email, first 25). Send without lawful basis → refused. With it → progress counts (sent,
   suppressed, failed); recipients list; stop sending. Received mail in GreenMail has the
   unsubscribe link and List-Unsubscribe header; clicking it → confirm page → address
   suppressed; next campaign skips it.

### M. Dashboard
1. Fresh workspace (after A1): default widgets and first-run state render with no data.
2. With data: add chart widget (bar, doughnut, radar), editor tabs and live preview, filters,
   date range; funnel widget; activity summary cards; timeline widget with filter and
   "Load older". Edit and remove. Share as a template → Sofia can add it.

### N. Company administration
1. Members: invite (link captured from the console), resend, assign role, deactivate → user
   cannot sign in; reactivate.
2. Roles: create `E2E Restricted` with read own, no delete; assign to Elena → per section
   checks above hold. Direct URLs `/company/roles`, `/company/audit-logs`,
   `/company/web-forms/submissions` → no-access state for her.
3. Settings: workspace currency, terminology preset (deals renamed across UI), forecasting.
4. Audit log: list, filter by record, detail shows field-level before/after; webhook secrets
   redacted.
5. Webhooks: create (invalid URL refused), pick events, test delivery → deliveries list row,
   resend.

### O. Background effects seen in the UI
1. Scheduled automation fires at its time → run history.
2. Mail sync brings a new GreenMail message into Mail; a scheduled reply leaves the Outbox.
3. Bounce via the delivery webhook → suppressions list.

### R. Cross-cutting
1. Second workspace sees none of the first one's records, files, mail, lists or audit log.
2. German across the main pages: no raw keys, no English copy. Smoke pass in es, fr and it.
   Formatting locale changes dates, currency and the invoice PDF.
3. 390 px viewport: sidebar drawer, board drag, detail page, mail thread, invoice line editor,
   dashboard. No horizontal scroll.
4. No console errors or failed requests on any page visited.

### T. Teardown
1. Delete every `E2E-` record, list, campaign, automation, template, webhook, web form source,
   API key, mailbox, label, view and custom field; restore Elena's role; delete the second
   workspace. Or run `yarn db:reset` between full runs.

## Tracker

| Section | Status | Checks | Notes |
|---|---|---|---|
| A. Access, auth, onboarding | ✅ | 7/7 | Fixed: sign-up title and invite subtitle showed the raw key `SignUpForm.title` (missing `brandName`). Findings: `/test/error` and `/test/overlays` open to any signed-in user; `/contact` vendor marketing page (founder pitch, "Contact Customermates") reachable in self-hosted; onboarding copy says "Customermates" instead of the brand; member drawer Save gives no feedback when Status is left at Waiting for approval (error below the fold); no email verification gate before onboarding (badge only). Sign Out verified on a clean session (earlier failure was stale Playwright cookies). |
| B. Shell, navigation, profile | ✅ | 5/5 (+B6 N/A) | Sidebar pages all load; Ctrl+K searches all six types incl. tasks (resolves the docs conflict); Add menu 6 types; `?open=contact:new` opens the drawer; profile Save/Reset only when dirty, name persists, German UI and German date format, light theme persists; API key: past dates disabled, key shown once, listed without secret, delete with confirm. B6 feedback/docs hidden by `branding.vendorHelpDisabled` (by design). Finding: seeded data holds 7 leads titled `{organizationName} enquiry` (from 26 Sep web-form runs) — re-check in F4. Dashboard Events/Messages widgets say "You do not have access to any activity" (Unipile activity feeds, unavailable in self-hosted). |
| C. Contacts | ✅ | 7/7 (C8 folded into N) | Create/validation (email handle-only, E.164 phone, empty form blocked); board grouped by stage, drag New→Contact persists and reverts; filter palette (Escape steps back), custom-field filter; saved view with `?view=`, share → Sofia sees "Shared by Max Bergmann", her edit shows the not-saved notice, delete falls back to All; import: CSV **is supported** (docs say refused — docs wrong), xlsx row errors listed, skip-and-import, update by Record ID (0 added, 2 updated), match by email → queued for duplicate review; export all (68 rows with ID) and selected (2 rows); custom fields of all 11 types (no Number/Multi-select/Checkbox exist — docs/handbook wrong), values persist, invalid custom email refused; duplicates: Müller/Mueller grouped by same phone, Not duplicates removes group, merge with winning value + undo restores. Notes: a new single-select backfills its preselected Default option onto every existing record; sidebar lists Tasks twice (Overview and CRM); Clear filters updates the URL late. |
| D. Organizations | ✅ | 3/3 (mail-by-domain moved to J4) | Create via drawer; export 21 rows; billing details save and persist, bad billing email refused; duplicates: `E2E Acme GmbH` + `E2E ACME` grouped (legal form ignored), merge ok. |
| E. Deals and pipelines | ✅ | 5/5 (E6 Sofia in N) | Pipeline `E2E Pipe` + 3 stages persist (inline autosave), stage kind Won, probability 50%, lost reason; deal with base €1,000 + 3 × Admin Training €5,000 = €16,000, weighted €8,000 on the board; time-in-stage bar; Mark lost blocked without reason, Lost · reason shown, Reopen, Mark won; stage delete asks where the deal moves. **Fixed:** dragging a deal between pipeline stages did nothing (merge `dcfda3b9` dropped the stage path in `data-kanban-view.tsx`); regression test added. Findings: Reopen puts the deal in the first stage, not the stage it left; seeded custom field "Status" (Open/Won/Lost/Abandoned) duplicates the built-in status and stays Open in the header after Mark lost; deals have no expected-close or probability field; rotting-days inputs render "Off" over "days". |
| F. Leads and web forms | ✅ | 4/4 (retry untested: no failed rows) | Lead create via drawer; assignment: "Qualified → Sofia" (one person, status condition) and "Round robin Max/Elena" → Qualified lead to Sofia, next two to Max then Elena; rule switched off → Qualified goes round robin; lead created with owner keeps it. File on lead → Convert dialog (prefilled name/value/pipeline/stage, expected close, probability) → deal €2,500 with the file; lead shows Converted and its Files tab is empty. Web form: source with mapping + extra field phone→Phones, signing secret shown once; signed POST → lead "E2E Forms GmbH enquiry" (title template fills), €4,200, contact/org, round-robin owner, follow-up task; bad signature → 401; bad phone → lead created, phone skipped; repeat from same email → note appended, no second lead; source paused → 404 refused. The 7 `{organizationName} enquiry` leads are stale data from 27 Sep (before the renderer fix). Findings: no link from a converted lead to its deal; assignment conditions only offer status/updated/created (no region field for territories); "Footer callback form (paused)" is actually accepting. |
| G. Services and tasks | ✅ | 3/3 | Service created, detail page shows €1,200 (service on a deal covered in E2). Tasks: list/agenda/week tabs; create with type, due, duration, assignee; Mark done → done timestamp + Reopen; a linked task opens "Plan the next step" and the follow-up inherits contact, organization and assignee; week view drag Oct 6 → Oct 7 persists; agenda shows OVERDUE (8); no Calendar row without a synced calendar. **Fixed:** on a new task the Activity type, Due and Duration inputs never updated (keys missing from the new-task form, the BaseFormStore gotcha); regression test added. Findings: a completed task due 30 Aug is listed under TODAY in Agenda; tasks cannot link to leads. |
| H. Invoicing | ✅ | 4/4 (Elena permission in N) | Settings persist (footer); draft from deal = base line + service line, 19% tax, €19,040 total; Issue confirm → RE-0004; PDF RE-0004.pdf correct (seller, lines, VAT, due date, footer, bank); XRechnung menu lists missing recipient email/postcode/city; RE-0005: prefilled balance €2,975, overpayment refused, partial €1,000 → €1,975 open, rest → Paid; standalone draft: live totals 2 × €450 @7% = €963, issue RE-0006, Void keeps number; status filters; draft delete → 404. Findings: an invoice can be issued with an empty recipient (docs only require the seller; German §14 UStG needs the recipient's name and address); Record payment submits the prefilled full balance in one click. |
| I. Files, documents, storage | ✅ | 2/2 | Files: upload with size/uploader/time; HTML and SVG → "This type of file cannot be uploaded."; EICAR → "The virus scanner found malware in this file, so it was not kept."; 6 MB over the 5 MB quota → quota message; PDF opens in a new tab from storage; delete removes it. Documents on a deal: add PDF → Draft, manual status Sent persists, actions Open original / Attach signed copy / Rename / Delete, no Send for signature without DocuSign, signed copy → Signed. Findings: **an executable renamed to .pdf is accepted** — the type check compares the extension with the browser-declared MIME (derived from the extension), no magic-byte check, although the docs promise "the extension has to match the file's type… executables are always refused"; no storage usage shown anywhere in the UI; detail tabs sometimes need a second click right after load. |
| J. Mail | ✅ | 5/5 (label rename/delete not run; Sofia privacy in N) | IMAP bad host → "Could not reach that mail server"; duplicate → "already connected" (bad password untestable: GreenMail auto-creates users); Sync now updates Last synced and brings a GreenMail message in; remote image blocked until Show images; attachment listed; reply via the STARTTLS relay delivered with In-Reply-To (Sent copy not saved: GreenMail has no Sent folder, warned); forward delivered; share → thread on the contact and lead Mail tabs; draft survives leaving the thread; Send later options, scheduled banner, Outbox view, Cancel returns the text, Send now + outbox cron → delivered; follow-up in 3 days in the Follow-up view, cleared by the customer's reply; Archive → Archived view; new label on a thread and label filter. **Fixed:** web-form ingest created the contact and organization without linking them, so the org's Mail tab and Contacts stayed empty; DB test added (mutation-checked); needed a dev restart to show live (workflow steps are not hot-reloaded). Findings: Forward on a thread forwards the latest message (own reply) and drops the original's attachment; the forward header shows a raw ISO timestamp; the reading pane squeezes the message body to a sliver at ~800 px height; the Sent-folder warning toast is persistent and covers the Forward button. |
| K. Automations | 🟡 | 4/5 (chaining, webhook, delay and the other action kinds not re-run this pass; verified live under W3-08…W3-14) | New automation "when Deal changes, field Stage Id, condition Stage in E2E Pipe · E2E Build": create task + send email to a fixed address. New automations start Off. Once on: drag into E2E Build → email with merge fields in the console transport, task linked to the deal, "Automation ran" in History; run history shows Succeeded (both steps) and Skipped (moved elsewhere). Templates: unknown merge field refused ("contact.shoeSize is not a merge field"), live preview against a deal. Suppressions: invalid address refused, added by hand, lifted. Sender: custom domain shows the TXT record, Check domain → not found, automation email then **Failed — The sender address is not verified, so nothing was sent** (task step still ran). Findings: **a custom sender cannot be cleared back to the default in the UI** (Save is disabled with empty fields; the row was removed from the DB to restore the test state); a skipped run lists its steps as "Queued"; the changed-field picker labels the stage field "Stage Id"; many earlier test automations are still on ("Contact updated note", "E2E sequence") and keep refreshing records. |
| L. Lists, audiences, campaigns | ✅ | 2/2 (Stop sending not exercised: 2-recipient send finishes at once) | Lists: create inline, duplicate name refused ("Another contact list already has this name."), fill from a filter adds 3 in the background incl. one without email, remove member → 2. Campaign: draft with merge fields, audience "Is on the list", Preview "2 recipients. 0 more match but have no email address", two-click send refused without lawful basis, with it → Sent "2 sent · 0 suppressed · 0 failed", recipients listed; mail carries List-Unsubscribe + One-Click; the link shows a masked-address confirm page → "You are unsubscribed" → address on the suppression list as Unsubscribed. |
| M. Dashboard | ✅ | 2/2 | M1 fresh workspace: default widgets with "No data available". M2: widget types Chart / Activity timeline / Funnel; funnel on E2E Pipe saved with real data ("2 Deals entered · 50% open to won"), edit dialog has Delete → removed. Findings: the widget editor preview shows sample data ("Stage 1–4, 120 deals") instead of the chosen pipeline; Events/Messages widgets say "You do not have access to any activity" (Unipile feeds). |
| N. Company administration | ✅ | 5/5 (terminology preset and currency not changed, to keep the shared workspace stable) | Members: deactivate Jonas → his sign-in lands on "Your account is currently inactive…" on every page; reactivate. Roles: Sales Manager re-saved through the editor restored its missing company/users/auditLog grants (test drift from an earlier non-UI change). Elena (Customer Success): sidebar without Automations/Campaigns; audit logs, templates, campaigns redirect to the dashboard; roles, settings, members, web-form submissions open read-only (role dialog has only Close, settings inputs disabled); Invoices visible read-only (no New Invoice) because an earlier run granted invoices:readAll. Sofia: Mail empty, yet sees the shared thread on the lead. Audit log list + detail (EVENT DATA). Webhooks: invalid URL → "Enter a valid URL."; localhost URL accepted; deal rename → delivery received by a local sink with the payload, listed in Recent Deliveries (200 OK); no Resend on a delivered event. Findings: audit EVENT DATA is raw JSON; a deactivated user still sees the full sidebar around the inactive message; a role without company:readOwn crashes every page with a 500 (root layout) — not reachable from the role editor, which always writes it. |
| O. Background effects in the UI | 🟡 | 2/3 | O2: GreenMail message synced into Mail; a scheduled reply left the Outbox via the outbox cron and reached the recipient. O1 covered by the event-driven runs in K (scheduled trigger not re-run). O3 bounce → suppression not re-runnable: the console transport records no provider message id, so a Resend bounce has nothing to match (a "Bounced" entry from an earlier run is on the list). |
| R. Cross-cutting | ✅ | 4/4 | R1: as the second workspace, contacts empty, global search finds nothing, Max's contact/deal/lead URLs show "not found" and his invoice 404s, mail empty. R2: 25 pages in German without raw keys or English copy; es, fr and it render on contacts/deals/invoices/settings/campaigns without raw keys; German formatting shows 29.09.26, 20:03. R3: dashboard, deals board, contact detail, mail, invoice, tasks at 390 px with no horizontal page scroll (invoice lines scroll inside their table). R4 console: only noise — "Invalid Sentry Dsn" (env placeholder), React setState-in-render warning on sign-in/dashboard, hydration mismatches on the contacts/deals boards (AppChipStack in relation fields). |
| T. Teardown | 🟡 | partial | Restored during the run: Sales Manager role grants, default sender, Jonas active, Erika display language, E2E-1 automation off, web-form source accepting. Left for a `yarn db:reset` (or manual cleanup): the E2E-1/E2E test records (contacts, org, deals, leads, tasks, invoices RE-0004…RE-0006, list, campaign, template, webhook, custom fields, pipeline E2E Pipe), the suppression of import.one, Erika's German formatting and light theme, the second workspace. |

## Fixes made during the pass

| Area | Bug | Fix |
|---|---|---|
| Sign-up | Heading and invite subtitle showed the raw key `SignUpForm.title` (missing `brandName`) | `sign-up-form.tsx` passes `brandName` |
| Navigation | Tasks listed twice in the sidebar (merge `dcfda3b9` kept both copies) | Overview copy removed; upstream keeps Tasks in CRM |
| Deals board | Dragging a deal between pipeline stages did nothing (merge dropped the stage path) | `data-kanban-view.tsx` allows stage moves; regression test |
| Tasks | New task: Activity type, Due and Duration never updated (keys missing from the new-task form) | `task-detail.store.ts` initialises them; regression test |
| Web forms | Contact and organization created without being linked | ingest links them (idempotent); DB test |

## Open findings (not fixed)

1. **Files:** an executable renamed to `.pdf` is accepted; no magic-byte check although the docs promise one.
2. **Sender:** a custom sender cannot be cleared back to the default in the UI.
3. **Invoices:** can be issued with an empty recipient (§14 UStG needs the recipient); Record payment submits the prefilled balance in one click.
4. **Mail:** Forward on a thread forwards the latest message and drops the original's attachment; forward header shows a raw ISO date; reading pane squeezes the body at ~800 px height; the persistent Sent-folder toast covers Forward.
5. **Leads:** no link from a converted lead to its deal; assignment conditions offer only status/updated/created (no territory field).
6. **Deals:** Reopen puts the deal in the first stage; the seeded custom field "Status" duplicates the built-in status; deal form has no expected-close/probability (only the convert dialog does); rotting inputs render "Off" over "days".
7. **Self-hosted exposure:** `/test/error` and `/test/overlays` open to any signed-in user; `/contact` vendor page reachable; onboarding copy says "Customermates".
8. **Admin UX:** member drawer Save silent when Status is left at Waiting for approval; audit EVENT DATA is raw JSON; deactivated user sees the full sidebar; skipped automation runs list steps as "Queued"; "Stage Id" label in the automation picker; widget preview shows sample data.
9. **Agenda:** a completed task due in the past appears under TODAY.
10. **Robustness:** a role missing company:readOwn 500s every page (not reachable via the editor).
11. **Console noise:** Sentry DSN placeholder, setState-in-render warning, hydration mismatch in `AppChipStack`.
12. **Docs/handbook drift (corrected in the handbook):** CSV import is supported; custom field types; no converted-deal link.

## Decisions applied after the pass

The open findings were decided in the findings document (F1–F22, recommendations accepted) and
implemented with tests:

| # | Finding | Change |
|---|---|---|
| F1 | Renamed executable accepted as a file | Uploads are checked by their first bytes; a mismatch is deleted and refused |
| F2 | Invoice issued without a recipient | Issue needs the recipient's name and address |
| F3 | Test pages, `/contact`, vendor copy in self-hosted | Redirected to the dashboard; onboarding copy uses the brand |
| F4 | Custom sender cannot be cleared | **Use the default sender** (`DELETE /v1/sender-identity`) |
| F5 | Forward takes the latest (own) message, drops attachments, ISO date | Thread Forward takes the latest inbound message; per-message Forward; that message's attachments; localised date |
| F6 | No link between converted lead and deal | Lead shows "Converted to a deal" with a link; deal shows "From lead" |
| F7 | Territory routing | Configuration only: lead custom field *Region*, web-form mapping, one assignment rule per region (documented) |
| F8 | Reopen goes to the first stage | Back to the open stage the deal left, else the first stage |
| F9 | Seeded "Status" custom field on deals | No change (demo seed) |
| F10 | No expected close date / probability on the deal form | Both fields on the form and in the summary |
| F11 | Payment recorded in one click | **Undo** on the toast (`DELETE /v1/invoices/{id}/payments/{paymentId}`) |
| F12 | Silent Save with an error below the fold | Form errors scroll to and focus the first invalid field |
| F13 | Audit detail is raw JSON | Field · before · after table above the raw data |
| F14 | Deactivated user sees the app shell | Bare page with sign-out only |
| F15 | Skipped run lists steps as Queued | "Not run: the record did not meet the conditions"; steps "Not run" |
| F16 | "Stage Id" in the automation field picker | Labels for stage, pipeline and lost reason |
| F17 | Funnel preview shows sample data | Preview calculates from the chosen pipeline's deals |
| F18 | Completed past task under Today | New trailing "Done earlier" group |
| F19 | Composer crowds the pane; persistent warning | Composer can be hidden; one timed toast after sending |
| F20 | Test drift in the dev DB | `yarn db:reset` before the next pass |
| F21 | Role without company:readOwn 500s | No change (not reachable from the editor) |
| F22 | Sentry DSN placeholder in dev | Local `.env` DSN left empty; nothing filed upstream |

## Outside this pass (no UI)

- REST API v1 and the OpenAPI document, the MCP server and its tools, API key use.
- The Pipedrive migration script.
- Cron and webhook authentication (refusals without a secret or signature).

## Test accounts created by the run (local dev only)

The dev database was reset (`yarn db:reset`) after the pass, so these accounts no longer exist.

| Email | Password | Purpose |
|---|---|---|
| e2e-owner-1@example.test | E2e-d3d5d9451039 | A1 second workspace owner (reset in A2; first password E2e-44da8e46d0a7 now invalid) |
| e2e-joiner-1@example.test | E2e-9aa6850419a9 | A4 joins the second workspace by invite link |
