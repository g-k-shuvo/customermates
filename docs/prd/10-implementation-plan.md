# PRD 10 — Implementation plan

Supersedes the estimate in `09-observed-client-usage.md`. That document was committed by
`ac878e31 feat(mailbox): make email reachable from the app` — the same commit that shipped
the email feature it calls a blocker — and was never reconciled against `07-m7-email-integration.md`.
Its milestone references are also off by one: it calls web lead capture "M7"; the plan has
that as M8, and M7 is the email milestone.

Written against `merge/upstream-2026-09` at `0b8edf7c`. Every file:line below was verified
against the working tree. Six analysis passes, one adversarial verification pass and one
programme review fed this document; where they disagreed, the disagreement is recorded rather
than averaged.

---

## Programme status

Tracks every backlog item derived from this plan and from its verification pass (5 audits and 4
adversarial reviews of the plan against the code, 26 Sep 2026). An item is marked **done** only after
all of the following:

- its reviews are addressed;
- the standing gates pass: Linux convention suite, `tsc`, lint on changed files, unit and DB tests,
  and the i18n audit;
- it has been exercised live against the local app.

All of this work is uncommitted in the working tree.

Legend: ✅ done · 🟡 in progress · ⬜ pending

**Gate 0 (before feature work)**

| ID | Item | Plan ref | Status | Verification |
|---|---|---|---|---|
| W0-01 | Linux convention suite green (8 red tests); automation steps run under the owner's tenant with settle-on-throw; web-form `lead.created` actually published | §4 0.1, §10 Gate 0 | ✅ | Linux convention suite green, from 5 files / 8 tests red. Web-form `lead.created` is published (it was silently lost since `ea00d73b`). Review found web-form leads could be published into another company through an unvalidated default owner; fixed with an active same-company owner, a fallback and a create precheck. Also: at-most-once fan-out; step claim by compare-and-set; `interrupted` settle; named step errors in 5 locales. Code review passed after two fix rounds; each guard has a DB test that fails when the guard is removed. Live E2E 27/27: automations run as the owner, delay then note, web-form lead plus audit, listener and automation, default owner and inactive fallback, a throwing action settles failed with a translated reason, EN/DE dashboard. Behaviour change: a thrown action is no longer retried |
| W0-02 | Pre-push hook running the convention suite in a Linux container | §3 S3 | ✅ | `.husky/pre-push` + `scripts/conventions-in-docker.sh`. A push of HEAD `573ec636` is blocked (rc=1) with exactly the 8 known failures. A planted violation was caught by each of the 7 Windows-vacuous suites and by the generated-files check. Skip, deletion and no-Docker paths are handled; shellcheck is clean. Runs ~130–290 s per commit. It keeps `--testTimeout=120000`, because CI's 5 s default times out 14 tests in the container |
| W0-03 | Lead write security: prechecks on create/update/delete, partial-update data loss, convert placement, web-form default owner | new (review) | ✅ | **Security:** single create, update and delete go through `LeadWritePrecheck`. Contact, org, owner and source ids are validated, and the assignee guard applies. Updating or deleting an out-of-scope lead returns `not_found` with no phantom event, with repo-level P2025 backstops. **Partial updates:** a dedicated update schema has no Zod defaults, so partial PUTs no longer reset status, labels or origin, and `null` clears a field. **Convert:** pipeline and stage are validated, and the deal assignee guard and `validateNotes` apply. **Threads:** record threads check contact access. **Decisions:** on update, only relation ids that change are validated. The create form pre-fills the owner for users without readAll. **Checks:** 14/14 mutations caught; 899 DB tests. Live E2E 20/20: title-only edit keeps status and labels; a Customer Success user saves a colleague's lead; partial PUT keeps fields; `null` clears. Foreign ids are refused on PUT and POST; stage from another pipeline, unknown pipeline and archived pipeline are refused on convert; a valid convert succeeds; no cross-tenant references remain. The security re-review was cut off by the usage cap and replaced by an owner-side review of the decisions |
| W0-04 | Stage 0 residuals: appendNote hardening, updateField writes, missing regression tests, clean-room `changed-fields.ts` | §4 0.2–0.8 | ✅ | **appendNote:** appends at JSON level, keeping underline and link `target`. Bare strings fold as markdown, web-form `{message}` as literal text. Unreadable notes are refused and left unchanged; the size cap applies; runs under the per-company lock, as do labels and assignOwner. **updateField:** deal fields go through `UpdateDealInteractor` (0..100 bound, weighted recalculation, `deal.updated` audit). Phantom scalars removed; blank values refused. **assignOwner:** the user must be active and in the company. **Also:** `changed-fields.ts` rewritten clean-room with a fail-closed test and an AST-based ee-import guard; web-form messages stored as literal text; role-modal regression test; 7 translated step codes. **Checks:** 24/24 mutations caught. Live E2E 29/29 (rich-text preserved, `notesUnreadable`, literal `{message}`, probability 150 → `fieldValueInvalid` while /deals still loads, 60 recalculated and audited, blank → `fieldValueMissing`, unknown owner refused, Sofia added, literal web-form markdown, role dialog). The code re-review was cut off by the usage cap |
| W0-05 | Notes repair script (census + idempotent apply) | §4 0.2, D8 | ✅ | `yarn db:repair-notes`, run by an operator, idempotent: `--census` (read-only, repeatable-read), `--apply`, `--restore-from-audit` / `--discard-history`. Writes use a per-row compare-and-set with savepoints and leave `updatedAt` untouched. The target DB is guarded against the `DIRECT_URL`/`DATABASE_URL` trap and PG routing env. Web-form `{message}` notes convert as literal text. Review fixes (M1–M4) are in. 114/114 tests on PG17 and PG16. Live E2E 20/20 on dev: the 4 corrupted dev rows repaired, the audit snapshot restored in front of the automation text, the UI renders correctly, a second apply writes 0 rows |
| W0-06 | Automation run integrity: reconciler, idempotent claim, kill switch, `nextRunAt` re-stamp, workflow-world guard | §4 cron constraint | ⬜ | **Deferred 27 Sep** (owner put feature work first). Design is settled, no code yet:<br>• `AutomationRun.claimToken` = workflow run id<br>• the reconciler only settles, never re-dispatches<br>• run steps store a snapshot of kind and config<br>• `AUTOMATION_SCHEDULE_ENABLED` kill switch, off by default<br>• re-stamp script<br>• world guard recorded before `withWorkflow`<br>Must land before W3-10 and W3-11 |
| W0-07 | Spikes: durable sleep across restart (local), advisory-lock baseline | §3 S1, S2 | ⬜ | **Deferred 27 Sep** with W0-06. Run S1 before W3-10 (sequence semantics) |
| W0-08 | CLAUDE.md corrections | §9 F10 | ✅ | All 8 F10 errors fixed and 5 more found, each count re-measured against the tree (93 convention files; `di.ts` 2,302 lines / 453 factories; ee 502 files; 69/78 models carry `companyId`; 5 self-hosted redirects). Diff reviewed. The `next dev` block is byte-identical. Also found that Windows breaks 23 of 93 convention files, not the 5 in §8 R9 |
| W0-09 | Red `agent-tools` catalog-size test (trim fork-added tool descriptions) | new (review) | ✅ | Headroom 18,797 → 20,929 B (floor 20,000); the ee test passes 95/95 on Linux with no ee edit. Only 6 description strings changed, in `widget.mcp-tools.ts` and `admin.mcp-tools.ts`: the fork's own text, plus verbatim duplicates of enum lists and filter syntax. Live check over MCP with an API key created in the UI, 13/13: country/currency enums intact (194/155); `country: "xx"` rejected and `"de"` accepted; funnel widget create/get works |

**Increment A — parity**

| ID | Item | Plan ref | Status | Verification |
|---|---|---|---|---|
| W1-01 | `Deal.baseValue` (D-5) | §4 0.7 | ✅ | **Model:** `Deal.baseValue` (default 0, migration `20260927090000_deal_base_value`, additive, applied on PG17 and PG16). `recalculateTotals` starts from it, so `totalValue = baseValue + Σ(service × quantity)` everywhere: deal create/update/bulk, service changes, pipelines. **API:** create/update take `baseValue ≥ 0` (a negative value → 400); the DTO, webhooks and MCP tools carry it; OpenAPI and docs regenerated. **Conversion:** writes `lead.value` into `baseValue`, so a €50,000 lead becomes a €50,000 deal. **UI:** editable "Base value" on the page and in the drawer; the total updates live. The services Σ now sums only service lines; the drawer shows a Deal Value row when a base exists. Audit renders the change as currency; help text in 5 locales. **Migration:** `migrate:pipedrive` writes `baseValue` instead of the synthetic €1 "Pipedrive deal value" service, and refuses to migrate deals while that service still exists. `yarn migrate:pipedrive:base-value` converts deals migrated the old way: dry run by default, idempotent, totals unchanged, `totalQuantity` = real lines, service retired. **Fixed along the way:** `FormNumberInput` dropped the select-all on focus, so Tab-then-type appended (2,500 + "3000" → €25,003,000) in every number field; also a flaky unhandled rejection in `lead-write-security`. **Checks:** DB tests (base only, base + services, services removed, negative refused, €50,000 conversion with 40% → €20,000 weighted); migration, planner and guard unit tests; component tests (Σ, drawer row, focus selection, mutation-checked); 982 related tests; conventions green. Live E2E 27/27 on the page (UI edit, reload, audit, keyboard entry, UI conversion, phone width, operator script dry run / apply / re-run) plus 9/9 in the drawer (base only, base + service, live edit, create). The invoice line from D-5 lands with W2-11 |
| W1-02 | Lead conversion dialog | §5.F 5e | ✅ | **UI:** "Convert to deal" opens a dialog instead of converting at once. It is mounted once in the protected layout, like the mark-lost dialog, and works from both the lead page and the lead drawer. Fields: deal name (lead title), base value (lead value), pipeline and first open stage (default pipeline; archived pipelines hidden), expected close date, and probability (hint: the stage's default). Cancel, Escape and a blank name convert nothing; submit waits until pipelines load ("Loading..." shown in the selects). On success the new deal opens; on refusal the dialog stays open with the server's reason. **API:** `ConvertLeadToDealSchema` takes an optional `baseValue` (≥ 0, defaults to the lead's value); OpenAPI regenerated. **Fixed while testing:** Radix Select's hidden native select reports `""` while its options are swapped, which silently cleared the preselected stage and sent `stageId: ""` ("Invalid UUID"). The dialog's handlers ignore empty values. **i18n:** 2 new keys in 5 locales; otherwise existing labels. **Checks:** 7 store tests (defaults, pipeline switch, empty-value guard, submit gated on loading, payload + Date, refusal keeps the dialog, cancel/reset), schema tests, and a DB test for the name, value, close-date and probability overrides (75% of €42,000 → €31,500 weighted). 400 related tests; conventions green. Live E2E 25/25 + 4/4 from the drawer: defaults; Escape/Cancel/blank name; pipeline switch moves the stage; every edited field lands on the deal; the new deal opens; Convert disappears once converted; archived-pipeline refusal explained; phone width; German. Pre-existing and out of scope: opening a contact or lead drawer from its list URL logs a React setState-in-render warning plus a hydration mismatch **Corrected 27 Sep (found by the full suite during W2-04):** the protected-layout test rendered the real `LeadConvertModal` this item mounts, so it failed to load. The test now mocks it and asserts it mounts only with tenant enhancements, as the neighbouring modals do. |
| W1-03 | `lead.*` outbound webhooks | §5.F 5g | ✅ | **Vocabulary split, no ee edit:** `SUBSCRIBABLE_WEBHOOK_EVENTS` (record + `lead.*` + messaging) drives the webhook DTO, the modal, the upsert interactor, the MCP tools and the delivery gate. `WEBHOOK_EVENTS` stays the routine vocabulary, so leads do not become routine triggers (test-pinned). **Docs:** 3 webhook specs in OpenAPI with `userId` nullable for system publishes; en/de webhooks + routines docs updated; OpenAPI, raw-docs and MCP catalog regenerated. **Checks:** the ee catalog-size and MCP census tests still pass. The DB test goes through the real interactors and fails under mutation. Live E2E 7/7 against a local receiver: webhook created in the UI with the lead events; UI create → `lead.created`; UI edit → `lead.updated` with the title diff; REST delete → `lead.deleted`; web-form lead → `lead.created`; deliveries successful and listed |
| W1-04 | Organization email history, plus a lead Mail tab | §5.F 4b | ✅ | **Organization:** its Mail tab shows shared threads with the organization's contacts, threads linked to its deals, and threads with anyone at the organization's own email domains. Domains come from its contacts' addresses; free-mail providers (`free-mail-domains.ts`) and the caller's own mailbox participant never widen it. Matching is case-insensitive, and only threads shared with the team count. **Lead:** a Mail tab with its contact's threads. **Access:** the record ids are validated (organization, lead, and now deal too); contacts and deals are scoped by `accessWhere`. The tab is shown only to users with mailbox access. **Fixed on the way:** the Mail page ignored `?thread=`, so "open" from any record's Mail tab landed on "Select a conversation". It now opens the thread, even when the viewer's own mailbox is empty. **Checks:** interactor tests (org union, free-mail exclusion, lead, not_found per id type), a domain-helper test, a PG DB test (identifier, domain, own-mailbox, free-mail, unshared and other-tenant cases), and a Mail deep-link test; 623 related tests; conventions green. Live E2E 16/16 through the real chain: mail seeded into the local IMAP server; mailbox connected and synced in the UI; 5 of 6 threads shared from Mail; org Mail at wide and narrow widths; lead, contact and deal Mail tabs; open-in-Mail |
| W1-05 | Days-in-stage bar and history backfill | §5.F 3 | ✅ | **Read path:** `GetDealStageDurationsInteractor` + repo, scoped via the deal's `accessWhere`, with not_found for an unknown deal. It sums closed visits plus the open one and lists every pipeline stage. Exposed as REST `GET /v1/deals/{id}/stage-history` (in the OpenAPI spec) and a server action. **UI:** a "Time in stage" bar in the drawer and on the page (inside `DealPipelineFields`), current stage highlighted, "N days / hours / minutes" via ICU plurals in 5 locales, two columns at phone width. **Backfill:** `yarn migrate:pipedrive:stage-history`, dry run by default. It rebuilds history from Pipedrive flow timestamps and skips open deals moved in the CRM since migration. A re-run is a no-op. **Fixed:** a DB test that seeded local time through raw `pg`. **Checks:** 270 deals and migration tests; conventions green. Live E2E 15/15: bar before and after a UI stage change, REST parity, 404, phone width, backfill dry run / apply / idempotent re-run. Dev note: a cold compile inside the 5 s Prisma transaction can time out the first save |
| W1-06 | Delivery pipeline configuration | §5.F 7 | ✅ | No code needed: multi-pipeline support already exists. Configured in the dev workspace through Settings → Pipelines: "Delivery" with Kickoff and In progress (open), Delivered (won), Cancelled (lost). Live E2E: the stages were built in the UI and verified in the DB; the board's pipeline switcher offers Delivery and shows its deals. A deal created in Delivery starts at Kickoff, moves to In progress, and "won" lands in Delivered. **Client runbook:** repeat those four stages in Settings, or use the client's own list once given. Keep the pipeline name "Delivery" and do not use the Projects terminology preset, which renames every deal. The automated won → delivery hand-off is part of W3-12 |
| W1-07 | Web form submissions inbox | §5.F 5c | ✅ | **Problem:** `markSubmissionFailedUnscoped` wrote failures nowhere anyone could see. **Now:** My Company → **Form submissions** (`/company/web-form-submissions`, `#nav-company-web-form-submissions`), a DataView surface (`SURFACE.webFormSubmissions`) with the standard toolbar, sorting and pagination. Each row shows when it was received, the form, the submitter (read through the source's field mapping; this is the accessible row-open cell), the status (Queued / Lead created / Failed), the lead, and the error. A new `submissionStatus` filter key lets you filter by status. The detail modal shows the reason, the submitted data (raw JSON) and a link to the lead. **Retry**, for a failed submission with no lead, requeues it: an atomic compare-and-set `failed → received` clears the error and re-dispatches `process-web-form-submission`. Anything else is refused with `webFormSubmissionNotRetryable` (conflict), and another company's id is `not_found`. **Access:** reading needs leads readAll; retrying needs readAll + create. **Docs:** app-company en/de. **i18n:** 5 locales; key and page-state censuses updated. **Checks:** a PG DB test (tenant scope, newest first, mapped submitter, status filter, retry CAS + dispatch, refusal cases, foreign id); modal store tests; conventions green. Live E2E 17/17: a signed submission is processed; a failed one shows its reason; filter by status; open via the name cell; Retry → the real workflow creates the lead, and the row turns "Lead created" with an Open-lead link; phone width; German. **Found for W1-08:** the title template help text says `{organizationName}`, but only `{{…}}` is substituted **Corrected 27 Sep (found by the full suite during W2-04):** the inbox's own Company nav entry pushed the agent's `nav-company` target page past its 512-character budget, which the proprietary `ee/agent-chat/__tests__/agent-tools.test.ts` enforces (nine entries fit, ten do not, whatever the slug). The inbox moved to `/company/web-forms/submissions`, which the Web forms page opens with a **Form submissions** button, and the Company nav is back to upstream's list. The protected-layout test now mocks `WebFormSubmissionModal`. Docs en/de were updated, and the E2E was rerun at the new route: 18/18, including the link and the missing nav entry. |
| W1-08 | Web form mapping: custom fields, value, UTM, consent, phone | §5.F 5a, §4 0.6 | ✅ | **Mapping:** `value` (a payload path → `Lead.value`; parses `50000`, `€ 50,000`, `50.000,75 €`, `1,5`; negatives and words are refused) and `customFields[]` (payload path → any **lead or contact** custom column, max 50). That one mechanism covers UTM parameters, consent, magnet-specific answers and, per **D11**, the phone: a phone-type field such as the contact's "Phones". **Processing:** values are coerced per column type: a select matches by option label; currency and dates are normalised (`30.11.2026` → ISO); phones go to E.164 (`00` → `+`; a number without a country code is skipped). Each value is then checked by the app's own `validateCustomFieldValues`, and a bad value is skipped rather than failing the lead. Lead fields are always written; a contact field only fills when empty (curated CRM data wins). **Validation:** the source precheck refuses a column that is not this company's lead or contact column (`customColumnIdNotFound` at `fieldMapping.customFields[i].columnId`). **UI:** "Lead value", plus a **More fields** row editor (form path, then a CRM field picker labelled "Lead · UTM source" / "Contact · Phones"). The standalone Phone input is gone: a legacy `phone` path becomes a row, preselected when there is exactly one phone field. A half-filled row blocks the save with an explanation. **Fixed on the way:** (1) the title-template help text says `{organizationName}`, but only `{{…}}` rendered; both forms now work, and unknown braces are left alone. (2) Inputs in this modal ignored typing whenever their key was absent when it opened (every mapping input on a brand-new source, and "value" on saved ones): `BaseFormStore.getValue` goes through JSONPath, which MobX does not track for missing keys. Every key is now present at open. **Docs:** app-company en/de. **Checks:** mapping/amount/title tests, a coercion test, a PG DB test through the real processing interactor (value, lead fields, contact phone, fill-only-when-empty, invalid values skipped, foreign column refused), and store tests (legacy phone, incomplete row, reactivity regression); 293 related tests; conventions green. Live E2E 11/11: legacy phone adopted in the modal; value path and three extra fields configured in the UI; a signed submission yields value 42,000, the title "Ada — Market assessment", UTM + consent on the lead and `+49301234567` on the contact; the lead page shows them **Corrected 27 Sep (found by the full suite during W2-04):** this item's new imports in `web-form-source-modal.tsx` made the protected-layout test load next-intl navigation and fail. The test now mocks that modal too. |
| W1-09 | Sent-sync plumbing | §5.F 4c | ✅ | **Found:** `ConnectedAccount.sentFolderIds` existed but was never written or read, so a Sent copy with no readable sender was always stored as inbound. **Sync now** on `/profile/mailboxes` synced only INBOX (the background workflow drained every folder; the button did not). A reply from Mail was appended to Sent unread, a failed append was swallowed without a word, and Gmail and Microsoft 365, which file SMTP-sent mail themselves, would have got a second copy. **Changed:** listing the sync folders now records the selection and the `\Sent` folders on the account, and the sync passes them to direction resolution. The button walks every selected folder (inbox, Sent, Archive, subscribed folders) and totals what it stored. The Sent copy is appended `\Seen`, skipped when a message with that Message-ID is already there (a retry files one copy, not two), and skipped for Gmail/Microsoft 365 hosts. The reply result carries `sentCopySaved`: when no copy could be filed, the reply still counts as sent and Mail warns "Sent. A copy could not be saved to your Sent folder." (5 locales). **Kept as upstream:** the sender wins over the folder. Mail from an address that is neither the mailbox nor an alias stays inbound even in Sent (upstream test "an inbound mail filed into the sent folder"). `mailboxAliases` exists in the normaliser but nothing stores aliases, so **mail sent from an alias shows as inbound**. Fixing that means an alias setting, which is a feature and not plumbing. Sent folders are recognised by SPECIAL-USE and, on servers without it, by imapflow's own table of 191 localised names. A name list of our own was written, found redundant in live testing, and removed. **Observed, not changed (upstream):** a sync page holding only a reply renames the thread to that reply's subject ("Re: …"), because `upsertThread` takes the first subject on the page. Incoming replies do the same. **Docs:** app-profile en/de. **Checks:** transport tests (`\Seen`, Message-ID skip, append when absent, missing folder), service tests (copy saved, failed append → `false`, self-filing hosts skip the append, folder selection recorded), 550 mailbox/mail/profile tests, GreenMail DB test 12/12, conventions green. **Live E2E 21/21** against GreenMail, with SMTP through a local STARTTLS relay (the app requires STARTTLS without implicit TLS, which GreenMail lacks; the dev server trusted a test CA): connected in the UI, then Sync now pulled INBOX and a Sent folder with no server flag. `sentFolderIds = {Sent}`. The mailbox's own mail and a sender-less copy in Sent were stored outbound, and the alias copy inbound as specified. Mail rendered the sender-less copy as your own, and the folder picker's Sent view listed only Sent conversations. A reply went out over STARTTLS with AUTH, reached the customer, and left exactly one `\Seen` copy in Sent with no warning. A re-sync merged that copy into the stored reply (one row, `outbound`, folder `Sent`). On a second mailbox with no Sent folder the reply still went out, the warning showed, and no folder was created on the server. No console errors. |
| W1-10 | Editable lead owner, contact and organization | §5.F 5d | ✅ | **UI:** on the lead page and in the drawer, the three read-only fields are now search pickers (new file `lead-relation-fields.tsx`). Contact is an avatar picker that can create a contact from the typed name; organization is a chip picker that can create an organization; owner is a user picker. A chip links to its record, and the owner chip opens the user. Each picker keeps the field's pin and visibility controls. Without read access to contacts, organizations or users, the old read-only text stays. **Owner rule:** a user without `readAll` on leads sees the owner read-only, because the assignee guard (W0-03) refuses any update that hands the lead to someone else. **Clearing:** the partial update schema treats an absent key as "unchanged", so `LeadDetailStore.afterChange` turns a cleared relation into `null` on a saved lead. On a new lead it stays absent, because the create schema takes no `null`. The create form now opens with every relation key present, so the pickers react to the first choice (the missing-key pitfall from W1-08). **Shared component, one line:** `FormAutocomplete` showed a remove control only in multi-select, so a single selection could never be cleared; its single-mode `handleRemove` was dead code. It now also shows the control on a single selection that is not `required`. Every existing single-mode use (countries, currencies, a deal's service row) is `required`, so nothing upstream changes. **Checks:** 5 new store tests (keys present, `null` on clear for saved leads only, no `null` on untouched saves) and 2 DOM tests (optional single selection clears; required one offers no control). 212 related tests, conventions green, tsc and lint clean. **Live E2E 21/21:** pickers replace text; contact, organization and owner saved; names survive a reload; the chip links to the contact; clearing the contact writes `null` and keeps the rest; a contact is created from a typed name and linked; in the drawer a second organization replaces the first; a new lead created with a contact and an organization stores both. A test rep role (leads create, readOwn, update, delete) sees the owner read-only yet can set the contact on their own lead, with no error. Console clean on the lead page. Opening a drawer through `?open=` on the list still logs the known pre-existing `LeadsPageView` setState-in-render warning and hydration mismatch; neither mentions a lead picker. |
| W1-11 | Leads in global search | §5.F 5f | ✅ | **Search:** `global-search.interactor.ts` no longer excludes `lead`. Leads are searched by title through `GetLeadsApiInteractor`, the same query as the leads list search, and they follow the same permission rules: system roles search everything, and a custom role searches leads only with `leads` readOwn or readAll, with readOwn limited to its own leads by the repository's access scope. `lead` joined the shared `entityListExecutors` map. The MCP tools that also use that map validate against enums of their own, so the agent gains no lead tools (PRD 10 prices those separately). **Modal:** a **Leads** group, placed between organizations and deals. A result shows as "Lead" and opens `/leads/{id}`. The empty state now reads "Search Contacts, Organizations, Leads, Deals, Services, and Tasks…" (5 locales). **Recent items:** leads are accepted in stored recents, and a lead opened in the drawer is recorded, like deals, organizations and services. Opening a stale recent lead goes through the existence check (a new `lead` case in `checkSearchResultExistsAction`). No entity records a recent item when its page is opened directly, because server hydration skips it. That is upstream behaviour and was kept. **Docs:** app-search en/de. **Checks:** 3 interactor tests (a lead found and typed as a lead, a readOwn-only role searches leads and nothing else, a role without lead access never queries leads), a recents parse test, and a store test for recording an opened lead; 267 related tests, conventions green, tsc and lint clean. **Live E2E 14/14:** a Leads group sits beside Contacts and Tasks, both leads are found by title, a row reads as a lead, choosing one opens its page, and it then heads Recently opened. A lead opened in the drawer is recorded too. A deleted lead in recents is reported and removed without navigating. The empty state names Leads. A readOwn rep finds their own lead but not a colleague's with the same words, and a role without lead access gets no lead group. No console errors. **Observed, not changed (upstream):** app-search documents the input id `#global-search-input`, but cmdk overrides the id, so it never reaches the DOM. |
| W1-12 | Shared saved views | §5.F 6 | ✅ | **Model:** `DataView.shared` (boolean, default false) with an index on `(companyId, surfaceKey, shared)`. Migration `20260927160000_data_view_shared` is additive and idempotent, and was applied on PG17 (dev and test) and on a throwaway PG16. After `migrate deploy`, `prisma migrate diff` reports no drift on either version. **Reads:** the rail, the server-side view resolution in `BaseGetInteractor` and the assistant's list all read the caller's own views plus the views colleagues shared on that surface, always within `companyId`. Own views come first. A chip carries `shared`, and a colleague's view also carries `sharedBy` (the owner's name). Selecting goes through `findReadableOrNull`, so a colleague can open a shared view. **Writes stay owner-only:** update, save-state, share and delete are still keyed on `userId`, so a colleague's attempt changes nothing (a DB test proves it for each path). The upsert schemas take an optional `shared`, and an update may now consist of `shared` alone. **Client:** autosave never writes to a colleague's view. Changes stay on screen and one notice says they are not saved; **Duplicate as new view** copies what is on screen, so those changes survive. Shared chips carry a team icon plus screen-reader text ("Shared by …" or "Shared with your team"). The owner's menu gains **Share with team** / **Stop sharing**. A colleague's menu offers only duplicate and copy link, under a note naming who shared the view. Moves only reorder your own views. When a shared view disappears (unshared or deleted), its users fall back to All; this already happened through `selectActiveViewKey`. **Upstream tests changed on purpose:** the repository tests asserted "only the caller's own views" and "no owner join", which this item reverses. The select tests follow the rename to `findReadableOrNull`, and the menu-order tests include Share. **Not changed:** the assistant's `manage_data_views` can list and select a colleague's shared view, but a change to it is refused as not found, and it has no sharing action. **Docs:** app-records en/de, with the saved-views section rewritten. **Checks:** 5 repository tests, a 6-case PG DB test (a colleague sees only the shared view, named after its owner; the owner's own list; no other company and no other surface; a colleague may select it but not a private one; every write by a colleague refused and the row unchanged; unsharing removes it), store tests (no write and one notice on a colleague's view, the owner still autosaves), and rail-model and action tests (ordering, menus, share payload, moves, duplicate keeps on-screen state). The isolation and tenant-guard DB suites are still green. 1,104 related tests, conventions green, tsc and lint clean, i18n parity. **Live E2E 22/22** (owner Max, colleague Elena): the owner saves a view from a search, shares it (team icon, Stop sharing offered), and keeps another private. The colleague sees only the shared one, labelled "Shared by Max Bergmann", and opens it on the owner's filtered list; the menu explains and offers only duplicate and copy link. Narrowing the search shows one notice and leaves the owner's row untouched, and Duplicate saves the narrowed search privately. The colleague's own view comes before the shared one. After Stop sharing, the view leaves the colleague's rail, and both the remembered selection and an old `?view=` link land on All. No console errors. **Environment note:** in the dev DB, the seeded "Sales Manager" role lacks the `company`, `users`, `auditLog` and `routines` grants that `prisma/seeds/roles.ts` defines, so Sofia gets a 500 from the navigation loader on every page. That is data drift, not code; a reseed would restore it. **Corrected 27 Sep (found by the full suite during W2-04):** `prisma/__tests__/saved-data-views-migration.database.test.ts` pins the DataView columns after every migration, and it did not know `shared`. The expected list now includes it, and the test passes on the test database. |
| W1-13 | Week calendar over `Task.dueAt`, with drag-to-reschedule | §5.F 2 | ✅ | **UI:** a "Week" tab on /tasks: Monday-start week (date-fns), 30-min slot grid with overlapping lanes, all-day row, unscheduled tray, prev/next/Today, "Only mine". Drag-to-reschedule (dnd-kit, pointer-accurate drops, optimistic update with rollback); Alt+Arrow moves a task by keyboard; system tasks can't be dragged. At phone width it becomes a day picker plus a list. Timezone-aware formatters are wired into the hydration boundary. **Data:** `GetActivityWindowInteractor` (≤14 days, 500 dated, 50 undated) + a window query honouring `accessWhere`, onlyMine and the list's filters. **i18n:** 5 locales. **Checks:** 7 unit + 4 DB tests (bounds, onlyMine, readOwn, tray). Live E2E 12/12: Wednesday 10:00 placement; drag to Thursday 14:00; Alt+↓ adds 30 min; tray to Friday all-day; week navigation; open task; phone layout. Found and fixed a wrong-day drop, caused by dnd-kit's default rect-collision picking the widest overlap |
| W1-14 | Pipedrive lead import | §5.F 5h | ✅ | **Source:** `leads.json` and `leadLabels.json` in an export, or `GET /leads?archived_status=all` and `GET /leadLabels` from the API. The API reader also accepts the flat pagination the leads endpoints return. Notes and activities can now carry `lead_id`. **Mapping (`mapLead`):** title; status `new`, or `archived` for an archived lead (Pipedrive leads have no workflow status); owner by email, else the fallback owner; the contact and organization when an earlier arm imported them; labels by name; `value.amount` as is; `sourceOrigin` `pipedrive`; the Pipedrive UUID in `pipedrive_id`; the expected close date in a new date column, `pipedrive_expected_close_date`. Anything it cannot carry over is reported rather than guessed: a missing person or organization, an unknown label, a foreign currency (not converted), an unmatched owner. **Run:** leads are imported after deals. A string-keyed index is needed because Pipedrive lead ids are UUIDs and the existing index parses numbers, and it keeps re-runs idempotent. With `--update-existing` the mapping is re-applied but a lead's status is never reset; only an archive made in Pipedrive is carried over. Notes with `lead_id` are appended to the lead once (deal, then lead, then person, then organization). A task cannot link to a lead, so an activity attached to one is reported as `activity.lead_id`. Lead columns are provisioned only when the run includes leads or notes. **Product fix found live:** every created lead got a follow-up task, including leads imported as archived. `LeadCreatedFollowUpTaskListener` now schedules one only for new, working or qualified leads. **README:** leads section, export layout, `--only`, order, the mapping table, and a warning that imports fire record-created automations, routines, webhooks and follow-ups, so pause them for the real run. **Checks:** 8 mapping tests, 7 run tests (links from the same run, UUID idempotency, the `--update-existing` status rule, notes appended once, an orphan note skipped, `--only` leaves lead columns alone, the activity's lead link reported), and 6 listener tests. 373 related tests including the lead and web-form DB suites, conventions green, tsc clean. **Live E2E 22/22** with the real CLI (`yarn migrate:pipedrive`) against the dev server, automations paused as the README advises: the dry run writes nothing. The real run reconciles leads as 3 read, 2 imported, 1 skipped (untitled) and lists every unmapped value. Lead A is open, owned by Sofia, linked to Pia and her organization, labelled Hot and worth 12,000, with its UUID, close date and note. Lead B is archived, falls back to Max, and keeps 500 unconverted. The activity became a task linked to Pia. Only the open lead got a follow-up. The lead page shows contact, organization, owner, label, value, "December 15, 2026" and the note. A second run creates nothing and does not repeat the note. |

**Increment B — storage, records, dedupe, invoices**

| ID | Item | Plan ref | Status | Verification |
|---|---|---|---|---|
| W2-01 | Detail-panel `extraPanels`; fixes the Emails tab being unreachable on wide screens | §5.C | ✅ | Done ahead of Increment B, because W1-04 is invisible on desktop without it. `EntityDetailLayout` takes `extraPanels: { id, label, content }[]` instead of `emailsPanel`. Narrow: each one is a tab between Notes and Activities. Wide (≥72rem container): the middle column becomes a tabbed workspace (Notes \| Mail \| … later Files, Documents, Invoices) between the details and the history. The strip appears only when there are 2+ panels, and the last tab chosen is kept across width changes. Details and history stay visible, and the 3-column grid is unchanged. That fixes the reported glitches: the tab was unreachable on wide screens, it wrapped when widened, and the switcher needed notes/history to render. One notes tree is kept. The strip gets a new aria label in 5 locales. **Checks:** existing layout tests unchanged and green, plus 2 new ones (extra-panel tabs, single-panel middle column); live at 1680 and 1024 px within the W1-04 E2E |
| W2-02 | `core/storage/` foundation | §5.A | ✅ | **Built:** `core/storage/` holds `storage-provider.ts` (the interface, `StorageFailure` consts and `StorageError`, mirroring the mailbox transport), `storage-config.ts`, `s3-storage.provider.ts`, `null-storage.provider.ts`, `storage-key.ts` and `upload-policy.ts`, with DI `getStorageProvider()` (one instance per process). The interface includes `getObject()` as a streaming read, per §7.B3. **Config:** `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` are required together; `STORAGE_PUBLIC_ENDPOINT`, `STORAGE_REGION` and `STORAGE_MAX_UPLOAD_MB` are optional. A partial configuration throws at module load and names what is missing (the `OAUTH_PROXY_URL` precedent). Unconfigured is legal and yields the null provider. **S3:** path-style requests; the internal endpoint serves stat/get/put/delete and the public one is used only to presign (SigV4 signs `Host`); presigned links last 15 minutes. The upload presign signs `content-type` and `content-length`, so a different size or type is refused by the bucket; that is the second of the three size checks, with the policy check first and the `statObject` check at completion still to come in W2-03. Downloads force the caller's content type and a `Content-Disposition` with an ASCII fallback plus `filename*` UTF-8. **Keys** are `{companyId}/{scope}/{recordId or unlinked}/{uuid}{ext}`, minted server-side and never taken from the user's file name. **Policy:** an allowlist keyed by extension, with type agreement and known aliases stored in canonical form (Windows' `application/x-zip-compressed` becomes `application/zip`). It hard-refuses `text/html`, SVG, `*+xml`, `application/x-*` and scripts. Downloads are forced to `attachment` except PDFs and common images. The mail-attachment policy keeps what real mail carries, but active content is only ever served as an attachment of type `application/octet-stream` (§7.B3 carve-out). **Setup:** `yarn storage:setup` creates the bucket, applies CORS for `BASE_URL` (or each `--origin`), and verifies the browser preflight. **Deploy:** the Coolify compose passes `STORAGE_*` through with empty defaults (empty means unset), plus the self-host env template and self-hosting docs en/de (a File storage section and a backup note). **Deviation from the plan, for a measured reason:** `@aws-sdk/client-s3` pushed `tsc --noEmit` past Node's default ~4 GB heap (it had passed at default memory all session, and CI and the pre-commit hook set no heap). The provider signs with `aws4fetch` instead (MIT, one small file). Calls go through a narrow local signer type, because checking against `RequestInit & {aws}` alone also tipped it over. **Owner decisions raised:** (1) D-3 chose "MinIO in the CRM's own compose stack", but MinIO no longer publishes free images (Docker Hub reports the repository gone; quay.io returns 401). Nothing is bundled; the docs point to managed S3 or SeaweedFS/Garage, and the choice is yours. (2) `tsc --noEmit` sits just under the 4 GB default heap before this change, so any growth will tip it. Consider `NODE_OPTIONS=--max-old-space-size=8192` in the typecheck script, the hook and CI. **Checks:** 43 unit tests (config, keys, policy, provider with a fake fetch, null provider); env wiring at module load (unset → `null`, complete → config, partial → the named error); Linux conventions and storage 776/776; tsc at default heap and lint clean. **Live, against two real S3 servers (RustFS and SeaweedFS), 17/17 each:** a presigned PUT stores the object, and a wrong size, a wrong type or a tampered parameter is refused. Stat, the byte-exact stream and the presigned download (forced disposition and UTF-8 name) all work. Server-side put and idempotent delete work, a missing object reports notFound, and a wrong secret is refused rather than treated as missing. In Chrome from `http://localhost:4000`, an upload is blocked by CORS until `storage:setup` runs and then succeeds with its download. The app boots and renders with storage configured. |
| W2-03 | Record files | §5.C | ✅ | **Model:** `RecordFile` (migration `20260927180000_record_files`) is the catalogue entry for an object in the bucket: `companyId`, `entityType` and one of `contactId`/`organizationId`/`dealId`, the server-minted `storageKey` (unique), name, type, size, uploader, and `status` `pending` → `ready`. The parent links are `SET NULL`, not cascade, so deleting a record leaves an orphan row that the sweep can use to remove the object before the row. **Upload in two steps:** `POST /v1/files/uploads` checks the policy, registers a pending file and returns a presigned PUT (size and type signed). The browser or client PUTs the bytes straight to storage, then calls `POST /v1/files/{id}/complete`. That runs the third size check: `statObject` must match the registered size and type. A missing object keeps the file pending (409, retryable). A mismatched one deletes the object and the entry. **Other endpoints:** `GET /v1/files?entityType&recordId` lists ready files plus `storageConfigured` and `maxUploadBytes`. `GET /v1/files/{id}/download` presigns a download: inline for PDFs and images, otherwise an attachment. `DELETE /v1/files/{id}` removes the object first and the entry only if that worked, so nothing is orphaned. All five are in OpenAPI and the generated docs. **Permissions:** reading follows the record's own scope (`accessWhere` of the parent: readAll, readOwn, or nothing). Adding or removing a file needs `update` on that record's type, not just any type. A record the caller cannot see is `not_found`. A missing or unreachable storage backend is a 422 with its own message, never a pretend success. **Sweep:** `GET /api/cron/sweep-record-files` (cron secret; hourly in `vercel.json` and the Docker cron). It removes pending uploads older than 24 hours and orphans in batches of 200. A row is kept if its object could not be deleted, and rows are still cleared when storage is gone. **UI:** a Files tab (the W2-01 `extraPanels`) on contact, organization and deal. It has a multi-file picker with the size limit, a size/uploader/time line, download (a PDF opens in a new tab), and delete behind the standard confirmation. Refusals show a toast with the reason, and the controls are disabled when storage is not configured. Copy is in five locales. `RecordFiles.meta` and `metaWithoutUploader` are on the parity allowlist because they contain only placeholders and separators. Docs: a Files section in app-records en/de. **Heap:** the extra Prisma model pushed `tsc --noEmit` past the default heap as predicted in W2-02. `yarn typecheck` and the pre-commit hook now run tsc with `--max-old-space-size=8192`. CI (`.github/workflows/test.yml`) still runs `yarn typecheck`, so it picks this up. **Checks:** 16 interactor tests (policy refusals naming the field, not configured, not found, per-type update permission, complete ok/retryable/mismatch/unavailable, inline vs attachment, delete order, sweep keeps undeletable objects). 5 DB tests (pending stays hidden, cross-company isolation, the record's own access, a deal's file stays on the deal, and the sweep selects only stale pending and orphans). Linux conventions with the storage and record-file suites 792/792, typecheck, and lint clean. **Live E2E 22/22** in Chrome against SeaweedFS, rerun 23/23 after the fixes recorded under W2-04. On a contact, two files upload from the picker, keeping name, exact size and canonical type (a PDF with a UTF-8 name and a CSV). The list shows size, uploader and time. HTML and extensionless files are refused with the reason and nothing is stored. The PDF opens inline, byte for byte, under its UTF-8 name, and the CSV downloads under its name. Delete removes the row and the object. An organization and a deal take files. Over REST: list, start/PUT/complete, a complete before the PUT refused with 409 and the file left pending for a retry, and an executable refused with 400. The sweep removes a stale upload and a deleted organization's file with its object, and refuses a call without the secret. No console errors. |
| W2-04 | Documents as stored PDFs | §5.D | ✅ | **Model** (migration `20260927200000_record_documents`, applied on PG17 and PG16): `RecordDocument` holds a title, a status (`draft`, `sent`, `completed`, `declined`, `voided`), `statusChangedAt`, the creator, and SET NULL links to contact, organization or deal, as record files do. `RecordDocumentFile` is a PDF of kind `original` or `signed`: pending until verified, then ready, and cascaded from its document. The model is named `RecordDocument` so it cannot be confused with the DOM `Document` type or with legal documents. **Upload:** `POST /v1/documents` applies a PDF-only policy (`UploadPolicyName.document`: the `.pdf` extension and `application/pdf`), creates the document with a pending original, and returns a presigned PUT. Then `POST /v1/documents/{id}/files/{fileId}/complete` verifies the size and type and lists the document. The title defaults to the file name and the status to `draft`. A mismatched first upload removes its document as well. **Signed copy:** `POST /v1/documents/{id}/signed-copy`, then the same complete call, attaches the executed PDF. The document moves to `completed` and keeps its original. An earlier signed copy is replaced: its row goes in the same transaction and its object best effort afterwards, so a failure leaks an object instead of breaking a listed file. **Other endpoints:** `PUT /v1/documents/{id}` renames the document or sets its status; `statusChangedAt` moves only when the status really changes. `GET /v1/documents/{id}/download` presigns the signed copy by default, or the version named with `?version=original|signed`. `DELETE` removes every object first, then the rows. **Permissions:** the same as record files: read follows the parent record's scope, and any change needs `update` on that record type. **Sweep:** `/api/cron/sweep-record-documents` runs hourly at :25 (in `vercel.json` and the Docker cron). It removes stale pending PDFs and orphaned PDFs, then any document left without a PDF. **UI:** a Documents tab after Files on contact, organization and deal. Add document opens a PDF picker that takes several files at once. Each row shows a status select, who added the document and when, and a marker when a signed copy exists; clicking the title opens the signed copy first. The row menu has Open original PDF, Open signed copy, Attach signed copy, Rename and Delete. Rename edits inline: Enter saves, Escape cancels, and focus moves to the input when the menu closes. Delete uses the standard confirmation. Read-only users get a status badge and a menu that can only open the PDF. Copy is in five locales, and docs en/de have a Documents section in app-records. The signing provider interface comes with W2-05. **Found and fixed in W2-03 while building this:** (1) Its complete and delete interactors made storage calls inside `@Write`'s transaction. That held the company's advisory lock for the whole call, and returning the failure rolled back the cleanup of a mismatched upload. Both now run with `tx: false`, as do the new document interactors, and the S3 provider aborts a request after 30 s instead of waiting indefinitely. A new DB test proves the cleanup persists and fails on the old code. (2) Its E2E probed deleted objects with an anonymous GET, which this bucket answers with 403 whether or not the object exists. It now uses a signed HEAD (200 before, 404 after) and passes 23/23. **Checks:** 19 interactor tests. 8 DB tests: hidden until ready; a signed copy completes the document and supersedes the earlier one; isolation across companies and by record scope; the `statusChangedAt` rule; a real discard through the interactor on a mismatch; sweep selection; cascade delete. Also 3 record-file DB tests, a policy test and a provider timeout test. Linux conventions 733/733, typecheck, full lint, the i18n audit, and the full vitest suite on Windows: 9,171 pass. The failures are Windows or tooling artefacts (the Linux-authoritative convention suites; jq missing and symlink or fsync EPERM in scripts/; 5 s timeouts under load that pass alone), one DB test stale since 58975a43 moved deal weighting onto stage probabilities, and three regressions from earlier items, now fixed (see W1-02, W1-07, W1-08 and W1-12). **Live E2E 39/39** in Chrome against SeaweedFS: (a) Two PDFs become two draft documents titled after their files, keeping the UTF-8 name and exact size and stored byte for byte under a document key. A Word file is refused with the reason. (b) The status select saves Sent and shows a toast. Rename takes focus, Escape cancels it, and Enter saves. (c) Attaching the signed copy marks the document Signed and shows the marker. The title opens the signed copy inline, and the menu opens the original under its UTF-8 name. A second signed copy replaces the first, whose object is gone (signed HEAD 404). Delete removes the row and the object. (d) An organization and a deal take documents. Elena can read deals but not edit them: she sees the deal's documents read-only with an open-only menu, and the API refuses her with 403 on the deal but accepts her on a contact she can edit (201). (e) Over REST: list; create, PUT and complete with an explicit title and status; the signed copy completes the document; download returns the signed copy by default and the original on request; PUT renames and sets the status; a non-PDF gets 400; a complete before the PUT gets 409 and stays pending; DELETE works. (f) The sweep returns 401 without the secret. With it, it removes the stale upload and the deleted organization's document together with its object, and leaves listed documents and a fresh upload alone. (g) No console errors. |
| W2-05 | DocuSign signing | §5.D | ✅ | **Provider** (`core/signing/`): a `SigningProvider` interface (send, void, fetch an envelope, download the completed PDF, verify and parse callbacks). A null provider is used when signing is unconfigured. The DocuSign provider: (1) authenticates with the JWT grant (an RS256 assertion for the API user) and reuses the token until 5 minutes before it expires; (2) takes the account and base URI from `userinfo` (the default account, or `DOCUSIGN_ACCOUNT_ID`); (3) uses REST v2.1 envelopes with a 30 s request timeout; (4) verifies Connect callbacks by HMAC-SHA256 over the raw body against every `X-DocuSign-Signature-N` header, which covers key rotation. **Config:** `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_PRIVATE_KEY` (PEM; `\n` escapes accepted) and `DOCUSIGN_CONNECT_HMAC_SECRET` are required together, and a partial configuration stops boot naming what is missing. `DOCUSIGN_AUTH_SERVER` (production by default; the sandbox is documented) and `DOCUSIGN_ACCOUNT_ID` are optional. **Model** (migration `20260927220000_record_document_signing`, PG17 and PG16): `RecordDocument` gains nullable `signingProvider`, `envelopeId` (unique), `envelopeStatus` (sent, delivered, completed, declined, voided), `envelopeSentAt` and `envelopeRecipients`. The document DTO gains `signature` and the list gains `signingConfigured`. **Send:** `POST /v1/documents/{id}/signature` sends a draft, declined or voided document's original PDF, read from storage, to up to 10 signers with a subject (the title by default) and a message. Each envelope carries its own HMAC-signed callback to `/api/webhooks/docusign`, so DocuSign needs no Connect configuration beyond the HMAC key. **Callback** (outside `/v1`, so not OpenAPI-scanned): 401 without a valid signature, 404 when signing is off. It maps sent and delivered to Sent, declined to Declined and voided to Voided. On completion it downloads the combined executed PDF, stores it as the signed copy (replacing any earlier one) and only then records the status, so a failure makes DocuSign retry. A replayed completion stores nothing twice. **While a request is out**, manual status changes and signed-copy uploads get 409. `.../signature/void` cancels with a reason shown to the signers. `.../signature/refresh` reads the envelope from DocuSign, for installations DocuSign cannot reach. `GET /v1/documents/signature-suggestions` lists the record's people with an email that the caller can see: the contact itself, a deal's contacts or an organization's contacts. Errors map to consent missing, not configured or unreachable (422), or refused (400). **D9:** when a document completes, whoever added it gets a localized "Signed: {title}" email naming the signers and linking to the record. It goes out once, because the completion flips inside a company-locked transaction. A mail failure is reported to Sentry and does not fail the callback. The template is in the email preview census (render count 69 → 74). **UI:** Send for signature in the menu of a draft, declined or voided document opens a dialog prefilled with the suggestions; signers can be added or removed, and the subject and message edited. While a request is out, the row shows "Out for signature · n of m signed", the status select and the signed-copy upload are locked, and the menu offers Refresh and Cancel (with a confirmation). Read-only users see the progress only. Copy is in five locales; docs en/de cover self-hosting setup (consent URL, HMAC key, callback URL) and the app-records flow; `.env.selfhost.template` and the Coolify compose carry the new variables. **Checks:** 17 provider and config tests (assertion claims verified with the public key, token reuse, consent versus refusal, account selection, envelope body, void, recipients, refusal of a non-PDF result, timeout, HMAC including rotation, callback parsing). 18 service and interactor tests. 4 DB tests: a sent envelope on the DTO, finding a document by envelope without a tenant and completing it once, the DocuSign copy superseding a manual one, and suggestions respecting contact access. The W2-04 suites still pass. Linux conventions 733/733, typecheck, lint, the i18n audit, and the email census 21/21 on Linux. **Live E2E 29/29** against a local DocuSign fake (it verifies the JWT with the key's public half, serves envelopes and the combined PDF, and sends HMAC-signed Connect callbacks): (a) Sending with the suggested contact plus an added signer, a subject and a message. DocuSign receives the PDF byte for byte and the HMAC callback URL. The row locks and offers Refresh and Cancel. (b) A manual status change or signed copy gets 409, and forged or unsigned callbacks get 401. A signer's callback updates the progress. (c) Completion stores the executed PDF and emails the creator once; a replay changes nothing. (d) Cancel voids the envelope with the reason, and the document can be sent again. Refresh picks up a completion that was never delivered. Decline sets Declined. (e) Elena sees the signed document read-only and gets 403 when she tries. (f) Over REST: suggestions, a send with a custom subject, a void, and a refused second void. (g) No console errors. **Not tested against real DocuSign** (no account, by decision). The provider follows DocuSign's documented JWT grant, envelopes v2.1 and Connect HMAC; the first real run needs consent granted and the HMAC key set. **Dev note:** after one restart, the Windows dev server failed to route `/v1/documents/{id}/files/{fileId}/complete` (an HTML 404 until the file was touched). That is a watcher glitch, not app code. `yarn build` has not been run in this programme yet. |
| W2-06 | Relation custom fields | §5.F 1 | ⬜ | |
| W2-07 | Relation-field grouping and CSV import | §5.F optional | ⬜ | |
| W2-08 | Dedupe scan | §5.B | ⬜ | |
| W2-09 | Dedupe merge, undo and workbench | §5.B | ⬜ | |
| W2-10 | Dedupe: organizations, import review, web-form capture ladder | §5.B | ⬜ | |
| W2-11 | Invoices core | §5.E | ⬜ | |
| W2-12 | Invoice PDF and XRechnung | §5.E | ⬜ | |
| W2-13 | Mailbox attachments | §5.F 4a | ⬜ | |

**Increment C — messaging, automations, campaigns**

| ID | Item | Plan ref | Status | Verification |
|---|---|---|---|---|
| W3-01 | Automation run hygiene (step-config snapshot at admission) | §5.M | ⬜ | |
| W3-02 | `messaging-send` contract and honest `EmailService` | §5.G | ⬜ | |
| W3-03 | Delivery row written before the transport | §5.I | ⬜ | |
| W3-04 | Markdown renderer and merge fields | §5.G | ⬜ | |
| W3-05 | Message templates | §5.G | ⬜ | |
| W3-06 | Suppression and unsubscribe | §5.H | ⬜ | |
| W3-07 | Sender identity | §5.J | ⬜ | |
| W3-08 | Automation conditions UI and REST API | §5.L | ⬜ | |
| W3-09 | Automation `sendEmail` to record recipients | §5.K | ⬜ | |
| W3-10 | Sequence semantics | §5.M | ⬜ | |
| W3-11 | Register `/api/cron/automations` behind a kill switch | §4 0.9 | ⬜ | |
| W3-12 | Automation authoring UI | §5.N | ⬜ | |
| W3-13 | Resend delivery webhook | §5.I | ⬜ | |
| W3-14 | Automation chaining and timeline | §5.O | ⬜ | |
| W3-15 | `bulk-job` primitive | §5.P | ⬜ | |
| W3-16 | Contact lists | §5.P | ⬜ | |
| W3-17 | Audience resolver and selection | §5.P | ⬜ | |
| W3-18 | Campaigns and send workflow | §5.P | ⬜ | |
| W3-19 | Campaign UI, GDPR retention, compliance gate | §5.P | ⬜ | |

**Optional extras (in scope by decision)**

| ID | Item | Plan ref | Status | Verification |
|---|---|---|---|---|
| W4-01 | OAuth Gmail / Microsoft Graph mailboxes | §5.F optional | ⬜ | |
| W4-02 | Mail drafts, outbox, folders, labels, follow-up | §5.F optional | ⬜ | |
| W4-03 | Lead assignment rules and territory | §5.F optional | ⬜ | |
| W4-04 | Lead MCP tools | §5.F optional | ⬜ | |
| W4-05 | ClamAV scanning | §5.F optional, §9 F7 | ⬜ | |
| W4-06 | Storage quota | §9 F7 | ⬜ | |
| W4-07 | Pipedrive migration arms: lists, files, notes, activities | §9 F2 | ⬜ | |

**Decisions recorded 26 Sep 2026:**
- **D11:** the web-form phone goes into a phone-type custom field.
- **D-5:** confirmed. `baseValue` becomes its own invoice line.
- **D7:** hard delete plus JSON-snapshot undo.
- **Scope:** everything above, including O, DocuSign, OAuth and the optional extras.
- **D9:** the NDA notification is sent by email.

**Awaiting the owner:**
- whether to restore `LICENSE` and `ee/LICENSE.md` (deleted in `4c659ce0`);
- whether to enable the Tests workflow on the fork, because `selfhost-image.yml` publishes an image on every push with no tests.

---

## 0. What has already shipped

PRD 09 priced these as work still to do. They are delivered.

| PRD 09 item | Reality |
|---|---|
| Email sync — "BLOCKER", +30–50d, "revisit the base choice" | **Delivered.** `features/mailbox/` is 87 files, zero `@/ee/` imports, live at `/mail`, not self-hosted gated. M7 records 9 tasks, 8 commits, 308 tests against a real Greenmail IMAP/SMTP container. |
| Leads + web lead capture, 9–14d | **Delivered** as M8. `features/leads/` 34 files, `features/webform/` 35 files, HMAC-signed public ingest, WordPress/Fluent Forms bridge. |
| Automation port to n8n, 10–15d | **Engine delivered natively.** 4 trigger kinds, 11 action kinds, durable delays, run history. But 0 of the client's 6 named automations work — see §5.B. |
| "Only INBOX is synced" (M7 known gaps) | **Stale.** `features/mailbox/sync/select-sync-folders.ts:6` selects `\Sent` and `\Archive`; `workflows/sync-mailboxes.ts:118` drains every folder. |

`ConnectedAccount` is **not** unavailable: `features/mailbox/persistence/prisma-mailbox.repository.ts:325`
creates rows with a synthetic `imap:<uuid>` key by design. What remains ee-bound is `Calendar`,
`CalendarEvent` and `AccountActivity`.

---

## 1. Locked decisions

| # | Decision | Consequence |
|---|---|---|
| D-1 | **Narrow audience resolver.** New `features/audience/` with its own query path. `core/base/base-query-builder.ts` stays untouched. | Avoids churning a file 8 data-view surfaces, the widget calculator and grouping all read. Cost: a second query path maintained forever. ⚠️ Two parity tasks violate this — see §7.A4. |
| D-2 | **One shared `features/messaging-send/`** owning templates, merge fields, suppression/unsubscribe and delivery tracking. Consumed by automations *and* campaigns. | Suppression and unsubscribe are compliance-critical and must not diverge. |
| D-3 | **S3-compatible storage behind `core/storage/`**, MinIO in the CRM's own compose stack, presigned upload/download. | Not merely preferred — `rest-openapi-coverage.test.ts` permits exactly one body read on a `/v1` route (`request.json()`); `formData`/`text`/`blob`/`arrayBuffer` are rejected. Presign is the only design the harness allows. |
| D-4 | **`relation` member on `CustomColumnType`** + target FKs on `CustomFieldValue`. | Generalises "Opportunity Company" / "Referral Contact" to any entity. Forces a relation branch through filtering, grouping, import/export and the detail UI. |
| D-5 | **`Deal.baseValue`**, editable; `totalValue = baseValue + Σ(service × quantity)`; conversion writes `lead.value`. | Fixes the €50,000 lead → €0 deal. Touches `recalculateTotals` (13 references). ⚠️ Couples into invoicing — see §8 R-7. |
| D-6 | **Invoices built to full Tier 2.** | 12–18d, +3–5 if tax is anything beyond a flat per-line rate. Needs an accountant and a named sign-off on PDF layout. |
| D-7 | **`appendNote` repair: census first.** | Query in §4. Dev-database census returned 4 type-corrupted rows, 0 with destroyed content. |
| D-8 | **Full programme, one number.** | Recorded objection in §2. |

---

## 2. The number, and the objection to presenting it as one

```
Raw sum with locked decisions applied          255.0 d
  − identified cross-plan overlap              − 12.25
  + unbudgeted cross-plan glue                 +  5.0
                                               ────────
Reconciled engineering total                   ~247.75  →  245–250 d
```

Overlap is only 5% because the six plans were written against disjoint feature areas. The
money is not in double-counting — it is in the *interfaces between* them, which cost more to
reconcile than the duplication saves.

**The missing rebase buffer.** Only the messaging cluster carries a CI/locale/rebase buffer
(+20%). The other four carry none. Upstream pushes ~87 commits/month; across ~12 months that
is ~870 commits to rebase through while adding ~25 Prisma models, ~8 page families, ~60 DI
factories and ~15 locale namespaces. Applying 20% uniformly to the unbuffered 178 days adds
**~35 days**. Not included above. With it, the honest figure is **~280 days**.

### Calendar

| | Engineer-days | Elapsed |
|---|---|---|
| One developer | 235–270 (incl. rebase + CI round-trips) | **15–17 months p50, 18–20 p80** |
| Two developers | ~1.6× speedup, not 2× | **9–10.5 months** |

Parallelism is capped by `core/di.ts`, `prisma/schema.prisma`, the five locale catalogues,
`base-repository.ts`, the shared convention counters and one CI pipeline. Even on the most
generous assumptions — 4.5 productive days/week, zero rebase tax, zero decision latency —
200–230 ÷ 4.5 = 44–51 weeks. **"9–11 months solo" is below the floor of its own optimistic
case; it is the two-developer number.**

A part-time release/infra engineer owning the Linux conventions harness, CI green, the
Coolify/MinIO stack, DNS and release verification returns more than a third developer would,
and removes the bus-factor-of-one on the infra half.

### Recorded objection

The programme review recommends **against** the single-number framing, for four reasons:
~30% of scope is gated on answers nobody has (DocuSign, invoice usage, the client's mail
provider, dedupe scope); the one number hides a 200→280 spread; CLAUDE.md's "prefer additive
files, every line we touch is a future merge conflict" and this scope are mutually
incompatible, and someone must choose which to break; and a 15-month solo engagement on a
client's production CRM has a bus factor of one.

Its alternative — same total, three funded increments, each ending shippable:

- **Increment A (~40d)** — week-0 decisions and spikes, all live defects, org email history,
  sent-sync plumbing, submissions inbox, lead webhooks, days-in-stage bar, and the dedupe
  *scan* half delivering the 229 duplicate groups for review.
- **Increment B (~50d)** — storage, record files, documents-as-stored-PDFs, dedupe merge,
  relation custom fields, web-form mapping.
- **Increment C (~60d)** — messaging-send, lists, audience, campaigns, suppression,
  unsubscribe, bounce handling, compliance gate.

This plan proceeds as one programme per D-8. The increment boundaries are marked in §5 so the
decision stays reversible.

---

## 3. Stage −1 — Week 0. Decisions, spikes, census. ~5 days, mostly not code.

Nothing here is feature work, and every item can invalidate or halve a downstream block.

### Decisions that gate scope

| # | Question | Gates |
|---|---|---|
| **D1** | Client's mail provider and tenant policy. Microsoft 365 with basic auth disabled? | If yes, the entire mailbox feature is already dead in their environment and OAuth (10–12d **+ 4–8 weeks provider verification**) jumps to the top. All of §5.F.4 hangs on this. **Answer before quoting any mailbox date.** |
| **D2** | Do they already pay for DocuSign? | Documents: 2–3d (stored PDFs) vs 7–11d + a certification wait. |
| **D3** | Are invoices used, or a leftover tab? | 0 / 5–7 / 12–18 days. D-6 locks Tier 2; this question can still unlock it. |
| **D4** | `Deal.baseValue` semantics — confirm D-5 and its invoice coupling. | §5.A + §5.F.1 + §8 R-7. |
| **D5** | ESP choice, **separate sending domain**, EU/US transfer position. | Any campaign work. SPF/DKIM/DMARC is calendar time, not engineering time. |
| **D6** | Counsel's §7 UWG / lawful-basis position for the 538 Higher-Ed recipients. | The first production send. No engineering discharges this. |
| **D7** | Dedupe scope, undo retention, is hard-delete accepted? | §5.E. |
| **D8** | Notes repair — PITR restore or accept loss, once the census reports. | The Stage 0 repair migration. |
| **D9** | "NDA Executed → notification" — email, or in-app? There is **no in-app notification system** in this codebase. | Acceptance automation #5. |
| **D10** | Markdown as the stored body format constrains authoring to bold/italic/strike/lists/blockquote/link/hr. **No headings, tables, images or inline HTML.** | If whitepaper emails need a branded header block, that is a template slot, not body markdown. |

### Spikes

| # | Spike | Days | Why now |
|---|---|---|---|
| **S1** | 30-day durable `sleep` survives a Coolify redeploy | 0.5 | Highest-leverage half-day in the programme. Invalidates the sequence-semantics design if it fails; automation #4 would need a cron-driven `nextStepAt` poller instead. The messaging plan scheduled this *after* designing around it — that is backwards. |
| **S2** | Advisory-lock hold-time baseline on realistic data | 0.5 | `core/decorators/transaction-runner.ts:32` takes `pg_advisory_xact_lock(hashtextextended(companyId,0))` on every tenant transaction. Sets the budget for campaigns, list fills and merges. Agree a hard ≤200ms per-transaction ceiling. |
| **S3** | Linux conventions harness in Docker as a **pre-push hook** | 1.0 | `page-state-contract`, `background-tenant-boundary`, `i18n-key-resolution`, `di-boundaries` and `rest-openapi-coverage` build POSIX paths and scan **zero files on Windows**. Every cluster trips at least three. Otherwise CI is the discovery mechanism at one round-trip per discovery. |

### Census (C1) — run before Stage 0 lands

```sql
-- corrupted notes columns
select 'Contact' t, count(*) filter (where jsonb_typeof(notes)='string') corrupted,
                    count(*) filter (where notes is not null) with_notes from "Contact"
union all select 'Deal',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Deal"
union all select 'Organization', count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Organization"
union all select 'Lead',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Lead"
union all select 'Task',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Task"
union all select 'Service',      count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Service";

-- what the first automation sweep would fire
select a.name, a.enabled, a.schedule, a."nextRunAt", a."nextRunAt" < now() as overdue,
       array_agg(distinct s.kind) as actions
  from "Automation" a join "AutomationStep" s on s."automationId" = a.id
 where a."triggerKind" = 'schedule'
 group by a.id;
```

Dev-database result: **4 type-corrupted rows** (1 Contact, 2 Deal, 1 Task), **0 with destroyed
content** — the other non-NULL notes hold JSON `null`, not documents. So on dev, repair-forward
suffices. The client's 10,000+ records with real notes must be censused separately before D8
is settled.

The second query already returns one enabled scheduled automation with `nextRunAt` in the past.

---

## 4. Stage 0 — live defects. ~6.5 days, strictly ordered.

### Status — 26 Sep 2026

Six of the nine landed, in the order below. Commits on `merge/upstream-2026-09`.

| # | Item | Status | Commit |
|---|---|---|---|
| 0.1 | Red CI — automation notice in the preview census | **done** | `aaa9bc2e` |
| 0.2 | `appendNote` overwriting rich-text notes | **done** | `fa26e568` |
| 0.3 | `assignOwner` wiping co-owners and revoking access | **done** | `fa26e568` |
| 0.4 | Self-hosted admins cannot grant mailbox access | **done** | `2c4d7a0a` |
| 0.5 | AGPL core value-importing from `ee/`, and the fail-open | **done** | `85b4b600` |
| 0.6 | Web form message stored as a bare object | **done** | `2c4d7a0a` |
| 0.6 | Web form phone discarded | **blocked** | needs D11 |
| 0.7 | Lead value lost on conversion (`Deal.baseValue`) | **held** | needs D4 |
| 0.8 | `updateField` numeric coercion — the live crash | **done** | `2c4d7a0a` |
| 0.9 | Register `/api/cron/automations` | **deferred** | by design, see below |

**What changed beyond the fixes themselves.** `appendNote` now folds a raw string left by the
old behaviour back into the document on the next write, so records repair themselves on touch
and the repair migration is only needed for records no automation will write again. The two
regression tests that covered these actions passed either way — one asserted the bare string
the bug produced, the other seeded a record with nobody assigned — and now seed real rich text
and a colleague. `assignOwner` with no user configured fails instead of clearing every
assignee; `Prisma.deleteMany` is gone from that path entirely.

**C1 census, partial.** Run against the development database only: 4 type-corrupted rows
(1 Contact, 2 Deal, 1 Task), **0 with destroyed content** — the other non-NULL notes hold JSON
`null`, not documents. The client's database has not been censused, and must be before D8 is
settled.

**New decision, not in the original list.**

| # | Question | Gates |
|---|---|---|
| **D11** | A phone number captured by a web form has no honest home. `MessagingProvider` has exactly one phone-class member, `whatsapp`, so storing a contact-form number marks the contact WhatsApp-reachable. Add a `phone` provider, or drop the mapping from the admin UI? | The second half of 0.6. The UI offers the mapping today and silently discards it either way. |


These are shipped bugs on `merge/upstream-2026-09`, not new work.

| # | Item | Days | Evidence | Ordering constraint |
|---|---|---|---|---|
| **0.1** | **CI is red.** Register `automation-notice` in the preview census. | 0.5 | `components/emails/__tests__/preview-inventory.test.ts` — 17 templates on disk, census asserts 16. Verified 3–4 failures depending on host. | **First.** CI's "generated files committed" gate runs before `yarn test`; behind red CI no later PR's signal is trustworthy. Raise the 15s render-loop budget here, once. |
| **0.2** | **`appendNote` overwrites — data loss.** | 1.75 | `features/automation/run/prisma-automation-record-writer.ts:142-144` — `updateMany({ data: { notes: args.body } })`. Whole-column overwrite, and a raw string into a JSONB TipTap column. Same class of bug at the webform `notes: { message }` writer, repository line 120. | Code fix first; repair migration **only after D8**. |
| **0.3** | **`assignOwner` wipes co-owners.** | 1.0 | Same file, `:110` `deleteMany` then `:112` `createMany`. That join table is what `core/base/base-repository.ts:117-137` uses to scope `readOwn`, so it revokes record *access*, not just assignment. | Same file as 0.2 — one review. Default to add-owner; a `mode` flag only if the client wants replace semantics. |
| **0.4** | **Self-hosted admins cannot grant mailbox access.** | 0.5 | `role-modal.tsx:184` hides `Resource.inboxMessages` when `appMode === "self-hosted"` — a gate written for the ee `/inbox`, over-reaching onto the AGPL `/mail`. Seeded roles work; custom roles cannot be granted. | No edge. Land early because it is free. |
| **0.5** | **AGPL core value-imports from `ee/`.** | 1.0 | `features/event/event.service.ts:17` imports `carriesChangedFields, changedFieldsOf, matchesChangedFields` from `@/ee/routines/routine-event-filter`; native automation dispatch depends on them. Lines 9–10 are `import type` and are fine. | Write an independently-authored AGPL module; read the ee implementation only to understand behaviour. Add `agpl-dispatch-boundary.test.ts`. **Fold in the fail-open fix at `:156`** — one module, not two (see §7.B2). |
| **0.6** | **Webform phone discarded**, and delete `free-mail-domains.ts`. | 1.25 | `field-mapping.ts` produces `fields.phone`, the admin UI offers the mapping, nothing consumes it. | ⚠️ **Do not delete `free-mail-domains.ts`** — §5.F.4b depends on it. See §7.B5. |
| **0.7** | **Lead value lost on conversion** — `Deal.baseValue`. | 3.5 | `convert-lead-to-deal.interactor.ts:70` passes `services: []`. | **Held on D4.** Land it here, before anything reads totals — or close it and take the conversion dialog (§5.F.5e) instead. |
| **0.8** | **`updateField` numeric coercion.** | 0.5 | `automation-step-fields.tsx:107-111` coerces only `seconds`; `Deal.probability` is `Float?` and `UpdateFieldConfigSchema.value` accepts `string`, so `"50"` validates and reaches Prisma. **Live crash today.** | Pull forward from the authoring-UI phase — it gates the cron. |
| **0.9** | **Register `/api/cron/automations`.** | 0.75 | Absent from `vercel.json` crons **and** `docker/cron/entrypoint.sh`. The `schedule` trigger has never fired in any deployment. | 🔴 **Deferred to the end of Stage 2.** See below. |

### 🔴 The cron constraint

Registering that cron turns on `AutomationTriggerKind.schedule` **for the first time in any
environment**. Do not register it until *all* of:

1. `appendNote` (0.2) and `assignOwner` (0.3) fixed and the repair run;
2. run dedupe exists — `AutomationRun` has no unique index and no dedupe today;
3. the double-send guard exists — the delivery row written **before** the transport, keyed on
   `automationRunStepId`; `executeStep.maxRetries = 2` can otherwise re-send after the
   transport already accepted;
4. `updateField` numeric coercion fixed (0.8);
5. the C1 census of enabled schedule automations by action kind returns something you are
   willing to have fire;
6. `nextRunAt` re-stamped forward — the dev database already holds an enabled automation with
   `nextRunAt` in the past, and `AUTOMATION_SWEEP_LIMIT = 100`, so the first sweep would drain
   a backlog of first-ever executions at 100 per 5 minutes.

Ship it behind a kill switch (env var or per-company flag), not as a bare crontab line. Do not
land it in the same release as 0.2/0.3.

---

## 5. Stages 1–3 — the work

Two tracks. For one developer, interleave. For two, this is the split: they intersect only at
`core/di.ts`, the locale catalogues and the schema.

### Track A — storage, records, dedupe, parity

#### A. `core/storage/` foundation — 7–10d · *Increment B*

`storage-provider.ts` (interface + `StorageFailure` consts + `StorageError`, mirroring
`features/mailbox/sync/mailbox-transport.ts`), `storage-config.ts`, `s3-storage.provider.ts`,
`null-storage.provider.ts`, `storage-key.ts`, `upload-policy.ts`.

New deps `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Env group `STORAGE_*`; partial
configuration throws at module load (the `OAUTH_PROXY_URL` precedent); unconfigured is legal
and yields the null provider so an operator who does not want files still boots.

**Must live under `core/`** — `runtime-config-sources.test.ts` requires every top-level dir
reachable from the fumadocs source config to have a `COPY` in the Dockerfile runner, and
`core/` already has one.

**Interface must include `getObject()` streaming read** — §5.F.4a needs an authenticated proxy
route outside `/v1`, and `presignDownload` is not a substitute. See §7.B3.

Key layout `{companyId}/{scope}/{recordId}/{objectUuid}{ext}`, minted server-side; the user's
filename is stored in a DB column only. A row exists in `pending` before the object does.

Presigned URLs behind Coolify: SigV4 signs the `Host` header, so two clients share credentials
— an internal one (`STORAGE_ENDPOINT`) for `statObject`/`putObject`/`deleteObject`, and a
public one (`STORAGE_PUBLIC_ENDPOINT`) used **only** for presigning. `forcePathStyle: true` is
mandatory. Bucket CORS is required for the browser PUT. Clock skew >15 min breaks every
presign.

Safety posture: extension↔mime agreement, hard-refuse `text/html`, `image/svg+xml`, `*+xml`,
`application/x-*`; forced `attachment` disposition on every download except a tiny inline set;
size enforced three times. **No virus scanning** — ClamAV sidecar is +2d and the client signs
the posture either way. ⚠️ The allowlist must carve out email attachments (§7.B3).

Flow: `POST /v1/files/uploads` → browser PUT → `POST /v1/files/{id}/complete` (`statObject`
verifies) → `app/api/cron/sweep-pending-uploads` reaps `pending` rows >24h.

#### B. Dedupe — 33.5d (28.5 contacts + 5 organizations) · *Increment A (scan) + B (merge)*

**Decision: application-side blocking keys, no `pg_trgm`.** The extension would in fact
install everywhere today (all environments connect as superuser), but: a failed
`CREATE EXTENSION` fails the whole release, not the feature; every developer's
`prisma migrate dev` must reproduce it in the shadow database; and it does not solve the
client's problem, which is an identity-join problem, not a typo problem. Trigram on
`firstName||lastName` is the weakest signal and the highest false-positive generator.

Escape hatch documented: if live "find similar as you type" over 100k+ records is ever needed,
`pg_trgm` plus a GIN index on `ContactMatchKey.value` is an additive change with the matcher
unchanged.

**Models:** `DuplicateScan`, `DuplicateGroup`, `DuplicateGroupMember`, `DuplicateDismissal`,
`ContactMatchKey`, `ContactMergeRecord`. All carry `entityType` + nullable `organizationId`
from day one so organizations need no later migration.

**Blocking keys:** `emailLocalPart`, `emailDomainSurname`, `phoneLast7`, `nameKey`,
`nameSoundKey`, `organizationSurname`. Exact email is deliberately *not* a key —
`ContactIdentifier`'s `@@unique([companyId, channelClass, value])` plus `validate-identifiers`
and `check-channel-conflict` already make it impossible for two contacts to own one address,
so every interesting signal is inexact. Say this to the client explicitly.

Soundex/metaphone rejected: English-only, poor on German/French/Italian surnames, and this
product ships five locales. Use a locale-neutral consonant-skeleton fold (~120 lines, no new
dependency).

**Scan** is a workflow — `rebuildMatchKeys` (500/page) → `generateCandidates` (buckets >25
skipped and recorded, not exploded) → `scorePairs` (union-find into clusters, dismissed pairs
dropped first) → `finishScan`. Keys are recomputed on scan, not by an event listener, so the
import hot path is untouched; staleness costs recall, never correctness.

**Dismissal needs its own table.** A group is keyed by a fingerprint over its member set, so a
dismissed {A,B} would reappear as {A,B,C}. Dismissal is a fact about a *pair*.

**Merge:** one transaction per merge, never per batch — forced by the advisory lock. Losers
capped at 9 to stay inside the 30s `BULK_WRITE_TRANSACTION` timeout. Ordered: load under
`accessWhere` (a record invisible under `readOwn` returns `failNotFound` — merging must not be
a back door) → conflict checks returned not thrown → **snapshot written before any delete** →
identifiers re-parented honouring *both* uniques → relations de-duplicated then re-parented →
`Lead.contactId` re-parented `CompanyWide` (under `readOwn`, `accessWhere("lead")` would
silently null another user's lead via `onDelete: SetNull`) → custom fields resolved → scalars →
losers deleted → group marked merged → events published.

**Zero `ee/` changes**, and for a verified reason: `MessagingThreadParticipant` has no
`contactId`; `ee/messaging/persistence/prisma-messaging.repository.ts:1601-1603` hydrates
`message.sender.contact` at read time from a `ContactIdentifier → contact` lookup. Re-parenting
`ContactIdentifier` re-parents the entire inbox and timeline for free.

Deliberately **not** rewritten: `AuditLog.entityId` (no FK, no `entityType`; rewriting would
falsify history — write one `contact.merged` entry on the winner instead), `AutomationRun`,
and saved `DataView`/`P13n`/`Widget`/`Automation` filter JSON (a filter naming a dead id
degrades to "matches nothing", which is visible and correct).

**Workbench** is a new surface under `contacts/duplicates/`, not a mass action —
`MAX_SELECTION_SIZE = 100` caps every selection, and a merge is an operation on a *cluster with
a chosen winner and per-field picks*, which the mass-action contract has no vocabulary for.

Also: import-time `review` strategy turning `duplicate-plan.ts:98-101`'s ambiguous-key bail
into a queued group; opt-in lead-level dedupe and a fuzzy capture ladder for the client's
lead-magnet scenario (tiers 3–4 attach *and* open a group — never silently merge on a fuzzy
signal); and a one-line fix making `resolveOrganizationUnscoped` case-insensitive.

⚠️ **Open technical objection.** The review argues hard-delete-with-JSON-snapshot undo is the
wrong call: a bespoke snapshot format must stay correct as the schema grows ~25 models over 12
months, it will rot silently, and you find out only when someone needs the undo. A
`mergedIntoId` soft-delete pointer is reversible *by construction*. Raise this before 16d of
merge machinery is built. Counter-argument: `Contact` has no soft-delete column, and adding one
touches every `accessWhere` consumer, every count, every grouping query and
`resourceOwnWhereMap` — exactly the edit CLAUDE.md warns against.

#### C. Record files (M10) — 5–7d · *Increment B*

`RecordFile` model, upload/list/download/delete, and a **Files tab** on contact / organization
/ deal — extending the `DetailPanel` union at `components/entity-detail/entity-detail-layout.tsx:62`,
following the M7 precedent where that file gained an optional `emailsPanel`. Each new protected
page needs a sibling `loading.tsx` and bumps `page-state-contract.test.ts:64`.

#### D. Documents + eSignature (M11) — 2–3d stored PDFs, 7–11d with signing · *Increment B*

Document model with status tracking, a Documents tab, and a provider behind an interface so it
is swappable. Signature callbacks go to `app/api/webhooks/` (outside `/v1`, not OpenAPI-scanned);
copy the HMAC pattern from `app/api/webhooks/lemonsqueezy/route.ts`. **Held on D2** — if they
already pay for DocuSign this is connect-and-go; if not, signing can stay in DocuSign and the
CRM just stores the executed PDF.

#### E. Invoices (M12) — 12–18d Tier 2 per D-6 · *Increment B*

Reuses the line-item half, which already exists: `Service` + `ServiceDeal`
(`@@unique([serviceId, dealId])` with `quantity`) drives `Deal.totalValue` at
`features/deals/prisma-deal.repository.ts:1051-1052`, and the terminology presets already let
a workspace rename Services to "Products".

Missing and to be built: per-line currency (currency is workspace-wide on `Company`; `Deal` has
no currency column, though `intl.store.ts:81` `formatCurrency` already accepts a per-call
override), tax/VAT, discount, issue/due dates, payment status, invoice numbering with a row
lock, billing address, PDF generation through `core/storage/`.

⚠️ **Billing identity does not exist on either side.** `Organization` has only
`id, name, companyId, notes, createdAt, updatedAt` — no address, no country, no VAT id. And
`Company` has **no `name` column at all**. An invoice needs a seller legal name/address/VAT and
a buyer address. Neither exists.

⚠️ No Chromium in the Dockerfile runner (`node:24-bookworm-slim`, only
`openssl ca-certificates git`) — rules out Puppeteer/Playwright PDF rendering without a large
apt payload. Use `@react-pdf/renderer`.

#### F. Parity gaps — 57d (MUST 29 + SHOULD 28)

**MUST — 29d**

| # | Item | Days | Notes |
|---|---|---|---|
| 5g | `lead.*` outbound webhooks + 3 `.openapi.ts` | 1 | `WEBHOOK_EVENT_COUNT` is *derived* (`WEBHOOK_EVENTS.length`) — no census to bump. The real gate is `features/webhook/__tests__/webhook-openapi.test.ts:60`. |
| 4b | Organization-level email history | 2 | **Best value-per-day in the programme** against a named client ask. `MessagingThread` has `linkedDealId` but organizations have no link — derive via participant → `ContactIdentifier` → contact → organization. Needs `free-mail-domains.ts` to exclude gmail/outlook, or it becomes "every Gmail user in the tenant". |
| 5c | Web form submissions inbox | 4 | `markSubmissionFailedUnscoped` currently writes into a black hole. A lead magnet that silently drops submissions is worse than one that is down. |
| 5a | Web form mapping: custom fields, `value`, UTM, consent | 4 | Direct blocker for the client's "same buyers, slightly different information" scenario — magnet-specific answers land nowhere today. |
| 1 | Relation custom fields (lean: no grouping, no CSV import) | 9 | Per D-4. Touches 7 hot repository files. Land in one branch, rebase immediately, **never in parallel with 5a** — both touch `prisma-lead.repository.ts`. |
| 4a | Mailbox attachments | 9 | **Blocked on A.** Needs `getObject()` streaming and an allowlist carve-out. |

**SHOULD — 28d**

| # | Item | Days |
|---|---|---|
| 4c | Sent-sync plumbing fixes (already largely implemented — far cheaper than PRD 09 implied) | 2.5 |
| 5d | Editable lead owner/contact/organization (all `EntityDetailStaticField` today) | 2 |
| 5e | Lead conversion dialog (interactor supports pipeline/stage/name/close-date/probability; UI sends `{ id }`) | 2 |
| 5f | Leads in global search (`global-search.interactor.ts:19` has an explicit `Exclude<EntityType, "lead">`) | 2.5 |
| 3 | Days-in-stage bar (+0.5 backfill) — `DealStageHistory` exists and *is* populated; no endpoint reads it | 4 |
| 6 | Shared saved views — `DataView` has `userId` required on all nine read/write sites and no visibility field | 5 |
| 2 | Week calendar over `Task.dueAt` — no calendar grid exists anywhere; `ee/calendar/` is off-limits and `ConnectedAccount`-bound | 6 |
| 5h | Pipedrive lead import (`scripts/migrate-pipedrive/` has no lead arm) | 3.5 |
| 7 | Second-pipeline configuration for post-sale delivery | 0.5 |

**OUT OF SCOPE — declined in writing**

- **5i lead email timeline.** `ACTIVITY_FILTER_FIELD_BY_ENTITY_TYPE` is already
  `Partial<Record<…>>` with no `lead`, `NamedModel` excludes it, and `LEAD_*` events map to
  `null`. Adding it means editing `ee/` and would be a third agreed exception — exactly what
  CLAUDE.md's "never add a wrong FilterFieldKey to satisfy the type" forbids. Automations #1
  and #2 are lead-scoped, so this is visible to the client on day one.
- **Projects as an entity** (30–40d). "Projects" already ships as a `deal` terminology preset
  with full copy in all five catalogues. The configuration answer — a second pipeline with
  `StageKind` — costs 0.5d. Ratio is roughly 60:1. Do not sell the `service → product` preset
  as an *invoicing* answer, though; it fails the first time they ask for an invoice number.
- **Calendar sync** (PRD 09 §10). `ee/`-bound. Decline explicitly rather than drop silently.

**OPTIONAL — quote separately**

Relation-field grouping +1.5 · relation CSV import +2 · drag-to-reschedule +2 · **OAuth
Gmail/Graph 10–12d + 4–8 weeks provider verification** · drafts 4 / outbox 5 / folders 3 /
labels 3 / follow-up 2 · lead assignment rules 5 (+2 territory) · lead MCP tools 2 · ClamAV +2.

---

### Track B — messaging, campaigns, automations

#### G. `features/messaging-send/` — 12.5d · *Increment C*

⚠️ **Freeze `messaging-send.contract.ts` on day 1 — budget 2.5d, not 1.** Four concrete gaps
stand between this layer and its campaign consumer (§7.B4): batched `SuppressionRegistry`
(the campaign path needs one call per ≤100 addresses, not per recipient), an `idempotencyKey`
through the transport chain, `MessageDelivery.campaignId` + a `dedupeKey` unique, and a
`SuppressionReason` enum mismatch. **One agreed `dedupeKey` semantics for both consumers** —
today the two plans use different keys against the same layer.

- **Honest `EmailService`.** Replace the `NODE_ENV !== "production"` short-circuit (which
  returns `true` without sending) with an explicit `EMAIL_TRANSPORT=console` transport
  reporting through `core/errors/`, not `console`. Delete the
  `["features/email/email.service.ts", ["log"]]` entry from `runtime-console.test.ts:10` in the
  same commit — it is an exact census. **Do not widen `send()`'s return type**: it has 16 call
  sites, 7 under `ee/`, and `ee/lifecycle/send-legal-document-notices.interactor.ts:150` reads
  the boolean. Add `deliver(): Promise<EmailReceipt>` alongside and have `send()` delegate.
  Stop discarding Resend's message id at `resend.transport.ts:14`.
  ⚠️ **Release note required**: any environment relying on the silent non-production no-op
  starts sending real mail.
- **Transport headers.** `EmailMessage` has no `headers` field at all today; both transports
  must forward `List-Unsubscribe` and `List-Unsubscribe-Post` verbatim.
- **`MessageTemplate`** model + slice + REST.
- **Merge-field vocabulary + resolver.** Mirror the `getFilterableFields()` allowlist pattern.
  An unknown key is a **hard failure, never a passthrough**. A missing value with no declared
  default is a **failure, not an empty string** — that is what stops "Hi ," reaching the
  client's list. Values HTML-escaped. Add an explicit `UNMERGEABLE_FIELDS` deny-set *on top of*
  the allowlist, plus a test asserting a known-sensitive key is absent, because the vocabulary
  is derived from DTO schemas and a DTO could later gain a sensitive field.
- **Markdown → email-safe HTML.** Store markdown, render at send time, never store HTML.
  `components/editor/email-markdown-editor.tsx` already exists and stores markdown;
  `markdown-it`, `sanitize-html`, `dompurify` and `tiptap-markdown` are already dependencies.
  TipTap's own HTML is not email-safe. One new template (`campaign-message.tsx`) keeps the
  `preview-inventory` census at one addition rather than one per client email.
- **Template preview** against a real record.

⚠️ **Format the output through `core/stores/intl.store.ts`, not `i18n/formatters.tsx`.** The
latter is 8 lines of rich-text chunk renderers (`br`, `bold`, `italic`, `underline`) and cannot
format a date, number or currency. CLAUDE.md is wrong about this; see §9.

#### H. Suppression + unsubscribe — 4.5d · *Increment C*

`MessageSuppression` + `UnsubscribeToken` (store the sha256, never the token). A **public,
unauthenticated, rate-limited** unsubscribe route outside `/v1` — RFC 8058 one-click requires
POST to succeed with no cookie and no CSRF token, and getting this wrong means Gmail's
unsubscribe button silently fails, which is worse for deliverability than no header at all.
Enforcement at send time, **only for `MessageTemplateKind.marketing`** — an internal
notification must not carry an unsubscribe header or be suppressed because the owner
unsubscribed from marketing. Company-settings suppression list.

**Not cuttable.** This is what makes the send legal.

#### I. Delivery tracking — 4.5d · *Increment C*

`MessageDelivery` + `MessageDeliveryEvent` with `@@unique([deliveryId, kind, occurredAt])` for
webhook idempotency. `app/api/webhooks/resend/` — ⚠️ **Resend signs with Svix**
(`svix-id`/`svix-timestamp`/`svix-signature`, base64 HMAC over `${id}.${timestamp}.${body}`),
not the plain hex scheme LemonSqueezy uses, so the structure copies but `verifyHmacSha256Hex`
does not. Bounce/complaint writes a suppression row.

**Under `EMAIL_TRANSPORT=smtp` there is no delivery tracking at all.** Nodemailer reports
envelope acceptance only — no bounce callback, no delivered event, no complaint feed. Status
sits at `sent` forever and suppression is populated only by explicit unsubscribes and manual
entries. Recommend Resend for the client's deployment.

#### J. Sender identity — 3.0d · *Increment C*

Per-company/per-user From and Reply-To. **Domain verification is not optional** — refuse an
unverified custom sender at send time rather than silently falling back, because a silent
fallback is how a sequence quietly lands in spam.

⚠️ The "send via the user's own SMTP needs a brand-new model, ~6d" framing is **wrong**:
`features/mailbox` already creates `ConnectedAccount` rows itself, `MailboxCredential` already
carries `smtpHost`/`smtpPort`/`smtpSecure`, and `connect-mailbox.interactor.ts:60-76` already
validates and SSRF-guards them. The real gap is the cold-compose path — `SendReplyInteractor`
requires a `messagingThreadId` — which is genuinely missing but much smaller.

#### K. Automation `sendEmail` — 4.5d · *Increment C*

`SendEmailConfigSchema` is `{ to: z.email(), subject, body }` — a literal address and static
strings — and `crm-automation-action-executor.ts:81` dispatches `runSendEmail(args.config)`
without `context`, so it structurally cannot reach the triggering record.

Pass `context`; widen the recipient to a discriminated union (literal / record contact / record
owner) behind a `z.preprocess` lift so existing saved `AutomationStep.config` rows keep working
without a data migration; add a resolver walking deal → `DealContact` → `ContactIdentifier`
(`channelClass: "email"` as a literal, per the AGPL-clean precedent at
`prisma-mailbox.repository.ts:413`), lead → `Lead.contactId`, contact directly, and owner via
the user join. A null recipient **fails the step loudly** — the run-step machinery already
marks it failed and breaks the loop.

Route through `messaging-send`; retire `CrmAutomationEmailSender`. Thread a locale through —
`crm-automation-email-sender.ts:14` hardcodes `DEFAULT_LOCALE`.

#### L. Conditions + changedFields — 6.0d · *Increment C*

The back end already exists and is good — the matcher reuses the entire data-view filter
language including deal `stageId`, `pipelineId` and custom fields, and both keys persist. But
`automation-modal.tsx:72-79` sends `{id?, name, triggerKind, entityType, schedule, steps}` and
nothing else, there is no conditions UI, and there is no automations REST API or `.openapi.ts`
anywhere. They are settable only by writing JSON into the column.

Copy `routine-configuration-pane.tsx` — it is **AGPL under `app/`**, not ee code, and may be
copied freely. `getRoutineFilterFieldsAction` shows the pattern; no new interactor is needed.
Write a core `automation-change-fields.ts` and **add a `lead` entry**, which the ee version
lacks because leads are an automation trigger entity but not a routine one.

Real cost: `FilterAccordion`/`FormAutocomplete` are form-context components and
`automation-modal.tsx` is `useState`-based. Convert it to a MobX store (~2 of the 6 days) —
which also fixes the `key={...-${index}}` remount bug at `:166`.

Stage-transition semantics: `changedFields: ["stageId"]` + `conditions: [stageId equals X]`
fires exactly when the stage changed *and* the deal is now in that stage. Pin it with a
database test — it is the most load-bearing behaviour in automations #3, #4 and #6.

#### M. Sequence semantics — 4.0d · *Increment C*

Conditions are evaluated once before the step loop and never re-checked; `cancelled` exists in
the enum and nothing sets it; there is no run dedupe and no unique index on `AutomationRun`.

Re-evaluate after every *delay* (not after every step — that would fight the automation's own
writes), set `cancelled`, exit on record change, and add a `dedupeKey` with
`@@unique([companyId, automationId, dedupeKey])` cleared on terminal states. Without dedupe,
every subsequent deal update starts a *parallel* sequence and the prospect gets email 4 several
times.

⚠️ **Held on S1.** If a 30-day `sleep` does not survive a Coolify redeploy, this needs a
cron-driven `nextStepAt` poller instead — a different design, ~10d of rework.

⚠️ The workflow **body** may not value-import `generated/prisma` — it runs in a `vm` with no
`require`. All logic lives inside `"use step"` functions.

#### N. Authoring UI — 5.5d · *Increment C*

Every config field is a bare text `<Input>` today; `createTask` exposes only `name`,
`createDeal` only `name`, and `assignOwner`/`moveStage` require pasting raw UUIDs. Replace with
a per-kind field descriptor and real pickers (user select, pipeline+stage cascade, duration
picker, `EmailMarkdownEditor` with a merge-field menu). Extend `updateField` to write custom
fields with type coercion — the `WRITABLE_SCALARS` allowlist is 2–3 scalars per entity and
excludes all custom fields.

Do **not** widen `WRITABLE_SCALARS` for deal `stageId`/`pipelineId` — `moveStage` owns that,
and a raw write bypasses `DealStageHistory`.

#### O. Chaining + timeline — 3.0d · *lowest priority, first cut candidate*

`AUTOMATION_MAX_CAUSATION_DEPTH = 1` means automations can never chain. Lift to 3 with a
`visitedAutomationIds` set (a depth counter alone does not kill A→B→A) plus the dedupe key.
**Held on client confirmation that chaining is wanted.**

Timeline logging needs five `DomainEvent` members, one per entity type — `audit-entity-type.ts`
is keyed by *event*, not payload, and the single-event alternative would require editing an
`ee/` call site.

#### P. Lists, audience, campaigns — 57d · *Increment C*

**Lists (9d).** `ContactList` + `ContactListMember` with `@@unique([listId, contactId])`.
`CustomColumnType` has no `multiSelect`, so a custom column can model "which single list", never
membership in several — the PRD's suggested fallback does not exist. `DataView` is a per-user
private saved filter, not a membership set. Adding 5,000 contacts to a list cannot go through
`MAX_SELECTION_SIZE = 100`; it needs a filter-scoped fill workflow.

**Audience (7d).** `features/audience/` with its own query path per D-1. The client's predicate
— *contact on list X AND the contact's organization's industry is Higher Education* — is
Contact → ContactOrganization → Organization → CustomFieldValue, three hops past the root; the
shared builder does one, from a fixed 41-entry map, flat and AND-only. Resolve each contact's
address via `ContactIdentifier` and exclude contacts with none — contacts have no `email`
column and identifiers are searchable but not filterable.

⚠️ **The DSL contradicts the client's annotation.** They wrote *"create complicated lists based
on any field in the CRM"*. The plan excludes `OR`, `NOT`, nesting, deal/lead/task/service
predicates, date-range custom columns, numeric comparison and free-text search. Their actual
`CDI Targets` filter is expressible; the sentence after it is not. **Get this in front of them
before the resolver is written.**

**Selection (4d).** A parallel filter-scoped path. Do not raise the cap; do not bypass it.

**Campaigns (8d) + send workflow (6d) + UI (9d) + retention/docs (5.5d).** `Campaign` +
`CampaignRecipient` modelled on `AutomationRun`/`AutomationRunStep`. Per-recipient idempotency
so a resumed run never double-sends. The workflow uses the SDK's documented
chunk→`allSettled`→`sleep` pattern; pass a campaign id and load recipients **inside** a step —
arguments are serialized into the event log, so 538 records must never be an argument.

**Extract one `features/bulk-job/` primitive** — lists fill, campaign send and duplicate scan
all need the same thing (take a definition not ids, keyset page, write in batches, sleep between
pages to release the advisory lock, record a job marker, confirm against a staleness-checked
count). Saves ~2d and removes three chances to get the lock pacing wrong.

**GDPR.** Tracking opt-in defaults to off — pixels and link rewriting are terminal-equipment
access under ePrivacy/§25 TDDDG. Per-batch suppression. Retention redaction. Preview capped at
25 rows and never exported; the resolver composes `accessWhere` so a `readOwn` operator cannot
preview or mail someone else's contacts.

⚠️ **§7 UWG requires prior express consent for advertising email to German recipients, and the
existing-customer exemption almost certainly does not cover Higher-Ed prospects. The lawful
basis for this specific send may simply not exist**, and no engineering discharges that.
Recording a lawful-basis field satisfies Art. 5(2)/30 accountability; it does not create
legality. Resend is US-based, so 538 EU academic addresses is a Chapter V transfer needing a
DPA + SCCs + a RoPA entry — or an EU SMTP path, which costs all delivery tracking.

---

## 6. Critical path

```
D5/D6 → contract freeze → EmailService receipt → MessageTemplate → merge fields
      → markdown render → suppression/unsubscribe → campaign slice (← lists → audience)
      → send workflow → campaign UI → compliance gate → first 538 send
```

**~55–60 engineer-days before the client's headline ask can go to production**, and
irreducible by headcount because the chain is serial. It assumes the DNS/domain/ESP work —
excluded from every estimate — runs in parallel and lands first.

**Where the programme stalls, by blast radius:**

1. **Storage slips → ~40d blocked** (record files, documents, invoices, mailbox attachments).
   Highest-variance item: SigV4 + Traefik + CORS + Coolify, on a stack that has never had
   object storage. Budget p80 at 3–4d shakeout with a real tail risk.
2. **`messaging-send` Phase 1 slips → the entire send path stalls** — campaigns, automation
   email, document and invoice mail. The +3d fallback (a thin sender with a trivial substituter
   and a hardcoded footer) must not become the plan of record; a hand-rolled unsubscribe is
   exactly where compliance goes wrong.
3. **S1 fails → ~10d rework** and automation #4 needs a different mechanism.
4. **Any unanswered product decision → its whole block.** ~25 open decisions; at least 8 are
   schedule-blocking.
5. **The Linux CI harness** is a throughput constraint, not a dependency — expect at least one
   CI round-trip per `preview-inventory` touch, and it is touched four times.

**Genuine parallel starters, day 1, near-zero contention:** storage · dedupe scan engine ·
days-in-stage bar (4d, no schema, cheapest visible win) · lead webhooks (1d) · org email history
(2d) · second-pipeline configuration (0.5d) · lead conversion dialog · the contract negotiation.

**Bad parallel choices:** anything touching `core/di.ts`, `prisma/schema.prisma`, the five
locale catalogues, `base-repository.ts`, the `Resource` enum, `page-state-contract.test.ts`, or
`prisma-lead.repository.ts` simultaneously.

---

## 7. Cross-plan reconciliation

### A. Corrections carried into this plan

| # | Correction |
|---|---|
| A1 | The messaging cluster scheduled the automation cron in *its* Phase 0 and contains no fix for `appendNote` or `assignOwner`. **Struck** — §4's ordering wins unconditionally. |
| A2 | `i18n/formatters.tsx` is 8 lines of rich-text chunk renderers and cannot format a date, number or currency. The boundary is `core/stores/intl.store.ts`; `hydration-safe-intl.test.ts:10-11` pins the member regex. Three of the six plans had this wrong, from CLAUDE.md. |
| A3 | `tests/conventions/open-core-license.test.ts` does not exist. Nor does `ee/LICENSE.md`. There are **92** convention tests, not 76/77. The AGPL→ee direction is **not** globally enforced. |
| A4 | Adding any `FilterFieldKey` member forces a fill in `RELATION_FIELD_MAPPING` (`base-query-builder.ts:66`, `Record<FilterFieldKey, string>`, exhaustive, 41 entries). **Two parity tasks therefore edit the file D-1 declares untouched.** Reconcile before either lands. |
| A5 | Arithmetic: the parity rollup's MUST column sums to 29 not 24, and SHOULD to 28 not 27. The campaigns plan's section estimates (43) and task table (57) differ by 14 days; the task table is authoritative. |

### B. Contradictions resolved

| # | Conflict | Resolution |
|---|---|---|
| B2 | Two plans write two different AGPL replacements for the same three ee functions on the same import line. | One module. Take the more complete version (it also handles `matchesChangedFields` and adds the guard test) and fold the fail-open fix into it. §4 item 0.5. |
| B3 | The storage interface (`presignUpload`/`presignDownload`/`statObject`/`putObject`/`deleteObject`) does not provide what mailbox attachments need: a `getObject()` streaming read for an authenticated proxy route outside `/v1`, and a content-type policy that does not hard-refuse `text/html`/`*+xml` — which real mail routinely carries. | Settle **one** interface before storage is written. Adding it after means a second pass through `core/di.ts` and `core/storage/`. |
| B4 | The campaign plan consumes four abstracts the messaging plan does not build. | Contract freeze at 2.5d, blocking, not a day-1 parallel task. |
| B5 | One plan deletes `free-mail-domains.ts`; another depends on it for organization email history (a MUST). | **Do not delete it.** |
| B11 | A proposed `cron-schedule-parity` test would immediately fail three other plans' cron routes. | Adopt the test; add +0.25d to each affected route for dual registration. |

### C. Census reconciliation

| Census | Now | Final if everything ships |
|---|---|---|
| `page-state-contract.test.ts:64` protected loaders | **38** | **44–46**. Four workstreams bump it, each assuming a stale predecessor. It is derived from the filesystem — make it a merge-queue check, not a plan-time constant. |
| `preview-inventory` templates / cases / send sites | **16 / 16 / 15** (17 on disk — currently RED) | ~18/18/17, or 17/17/16 if `automation-notice.tsx` is retired. Touched 4+ times. |
| `renderCount` | **68** | 73–74. Derive it, do not guess. |
| `WEBHOOK_EVENT_COUNT` | derived | **no bump ever.** The real gate is `webhook-openapi.test.ts:60`. |
| `Resource` ↔ `RoleModal.resources.*` (exact equality) | 14 | 16 (`invoices`, `campaigns`) — 4 migrations, 2 enum-only. |
| `DomainEvent` ↔ `Common.events.*` (exact equality, both directions) | 55 | **~68–72.** Not previously tracked by any plan. `audit-entity-type.ts` is exhaustive, so every new member is a compile error until mapped, and each costs 5 catalogue entries. |
| ee MCP schema census | `{ uuid: 90, "date-time": 3, email: 6, uri: 4 }` | **unchanged** — *if* no new MCP tools and the relation field types as `z.string()`. ⚠️ Widening the shared `CustomFieldValueSchema` with a `z.uuid()` target could bump `uuid` **silently**. Verify before it lands. |

### D. Shared-file collisions — highest risk

`prisma/schema.prisma` (5 plans, ~25 models; `Company` gains ~15 back-relations on top of 80+
— the worst conflict surface in the repo; one owner for `model Company`, everyone else appends
at EOF) · `core/di.ts` (5 plans, ~60 factories; append one contiguous block per plan — it is the
one file allowed comments) · the five locale catalogues (key order is eslint-enforced, so
additions land in the same alphabetical neighbourhoods across five files; land locale changes as
the final commit of each branch) · `role-modal.tsx` (3 plans, two within 3 lines of each other)
· `core/openapi/openapi-spec.ts` (~41 imports) · `entity-detail-layout.tsx` (×2) ·
`entity-detail-page-view.tsx` (×3) · `use-filter-select-items.tsx` (×3) ·
`docker/cron/entrypoint.sh` (×4, single heredoc) · `vercel.json` (×3+).

---

## 8. Risks

| # | Risk | Severity |
|---|---|---|
| **R1** | ~30% of scope is gated on client answers, quoted as one number. A single figure across that optionality is a range in disguise. | **High** |
| **R2** | First-ever object storage in a self-hosted Coolify stack: new stateful service, new volume that must enter the backup set, SigV4 host-signing, mandatory CORS, Traefik body limits, clock skew. Blocks ~40d. Plus no virus scanning. | **High** |
| **R3** | The advisory lock versus every bulk path, and **nobody has measured it**. The campaign design handles it well; the merge design ("one transaction per merge") does not, and the `ContactMatchKey` rebuild is a full rewrite over 10,000+ rows under the same lock. S2 sets the budget. | **High** |
| **R4** | 30-day durable `sleep` unproven, and was scheduled to be validated *after* the design that depends on it. Moved to week 0. | **High** |
| **R5** | Double-send from step retries, plus two incompatible `dedupeKey` semantics against one shared layer. Fix in the contract, before either consumer is built. | **High** |
| **R6** | GDPR / §7 UWG. Lawful basis may not exist; deliverability damage to transactional mail if marketing shares a domain; Chapter V transfer. The compliance gate must require a **named client signatory**, which an engineer cannot satisfy. | **High** |
| **R7** | `Deal.baseValue` into a derivation 13 references read — and a converted lead with no service lines yields a €50,000 deal and a **zero-line, zero-total invoice**. Either `baseValue` becomes a synthetic invoice line, or invoice creation refuses/warns. Decide before invoices and before merge fields. | **High** |
| **R8** | **Rebase pressure is what the programme is most wrong about.** ~870 upstream commits over 12 months while touching every shared file repeatedly. CLAUDE.md's additive-files rule and this scope are incompatible. Choose: pin to a known-good SHA with quarterly catch-up merges (3–5d each), or carry a continuous 12–20% tax and put it in the number. | **High** |
| **R9** | Windows/Linux harness divergence — five convention tests scan zero files locally. S3 makes it a hook, not a discipline. | **Medium** |
| **R10** | Workflow event-log growth with no retention job, on a single self-hosted Postgres. | **Medium** |
| **R11** | CI has been red since `229e58b7` and stayed red through the shipping of a whole feature. The 0.5d fix is trivial; the cultural gate is the thing to install. | **Medium** |
| **R12** | Bus factor of one on a client's production CRM for 12–17 months. Not a technical risk, and the largest one in the document. | **High** |

### Over-engineered, in the reviewer's judgement

Delivery tracking beyond bounce handling, the sender-identity phase, and chaining+timeline
(~10.5d) for a client whose ask was "bulk personalised email to a filtered list" · campaign
pause/resume/stuck-sweep/retry-rearm UI (excellent for 100k sends; a 538-recipient run needs
cancel + retry-failed) · Tier 2 invoicing for a tab whose usage is unknown · relation custom
fields at full scope when the lean 9d carries the client value.

---

## 9. Gaps nobody owns

| # | Gap | Cost |
|---|---|---|
| **F1** | **Porting the client's 37 live automations.** The engine is built and validated against 6 named ones; the other 31 are unowned, and `scripts/migrate-pipedrive/` has no automation arm. At the PRD's own rate: **10–20d**. |
| **F2** | **Migration covers deals/contacts/orgs and leads. Nothing else.** No list membership (the `CDI Target` values the whole campaigns cluster consumes), no files, documents, activities, notes, email history, or the 229 duplicate groups. **Lists and dedupe both ship empty on day one.** ~8–12d. |
| **F3** | The audience DSL contradicts the client's "any field in the CRM" annotation. Reconcile before building. |
| **F4** | Calendar sync — ee-bound, must be declined in writing. |
| **F5** | OAuth deprecation — existential, and sitting in the OPTIONAL column. Answer D1 first. |
| **F6** | In-app notifications — no system exists; D9. |
| **F7** | Virus scanning (+2d) and a storage quota hook, which the interface lacks. |
| **F8** | `RecordFile` carries a `leadId` FK with no UI. Decide deliberately. |
| **F10** | **CLAUDE.md is wrong in eight places** and nobody owns fixing it: the non-existent licence test and `ee/LICENSE.md`; the convention-test count (92, not 76/77); `i18n/formatters.tsx` as the formatting boundary; "the `Deals` namespace is currently empty" (it is *absent* from all five catalogues); `core/di.ts` line count (2,301, not 1,877); `features/deals` file count (55, not 54); and an ee census that omits `"date-time": 3`. **One PR, half a day, and it stops the next contributor inheriting the same wrong facts.** |

---

## 10. Quality gates

**Gate 0 — before any feature work.** CI green on Linux three runs consecutively, and
never-merge-behind-red as policy · `yarn conventions:check` in Docker via a pre-push hook, with
a demonstrated catch of a deliberate violation of each of the five Windows-vacuous tests ·
PG16 **and** PG17 migration verification demonstrated locally · C1 census run and answered ·
D1–D10 answered in writing · S1 and S2 complete · advisory-lock p50/p95 baselined with an
agreed budget.

**Gate Stage 0.** `appendNote` and `assignOwner` merged; the repair migration rehearsed against
a snapshot restore before production · regression tests that would have caught the originals
(seed a real TipTap document; seed **two** existing assignees — a zero-assignee fixture passes
either way) · the cron **not** registered, and a written census of what the first sweep would
fire.

**Gate storage.** A file uploads and downloads end-to-end through the **real Coolify deployment
with Traefik in front** · browser presigned PUT proven from `BASE_URL` (CORS) · download forces
`attachment` · the cap enforced at all three points · a mistyped upload (`.html` declared
`image/png`) refused · `minio-data` in the documented backup set with **one rehearsed restore**
· pending-upload sweep deletes an orphan · the client has signed the no-AV posture or ClamAV is
funded.

**Gate record files.** Deleting a contact removes rows *and* objects, proven with a bucket
listing · a `readOwn` user cannot see another owner's files · the Files tab works at phone width.

**Gate messaging Phase 1.** Contract frozen and **both** consumers compile against it with
**one** `dedupeKey` semantics · unknown merge key is a hard failure · a `{{user.passwordHash}}`
probe returns `unknownKey` · an XSS payload in a contact name renders escaped · currency and
dates render through `intl.store.ts` · a real email delivered to a real inbox from staging, with
raw source showing inline styles and no `<style>` block · `EMAIL_TRANSPORT` verified in **every**
environment so nobody starts sending by accident.

**Gate messaging Phase 2 — the compliance gate.** One-click unsubscribe works
**unauthenticated** from Gmail's own UI against a real message · suppression consulted **per
batch**, proven by a test that suppresses mid-run · a rendered message missing
`List-Unsubscribe` is **refused**, with a test · separate sending domain live with
SPF/DKIM/DMARC, transactional mail on a different domain/key · named client signatory for
lawful basis on record · counsel's §7 UWG position on file.

**Gate campaigns — before the first production send.** A simulated crash between
transport-accept and the database write produces **zero** double-sends · cancel takes effect
within one batch · advisory-lock wait measured during a full 538-run, inside budget, with
interactive writes proven responsive · **a dry run to a 20-address internal seed list, reviewed
by the client, before the 538**.

**Gate dedupe.** Merge proven reversible for every affected table on a restored copy of
production data · per-merge lock hold time measured; a 229-merge batch does not stall
interactive writes · **precision/recall of the blocking keys reported against the client's
actual 229 groups** — if the scan finds 150 or 400, the keys are wrong, and that must be known
*before* the merge workbench ships · hard delete gated behind explicit confirmation with the
snapshot written in the same transaction.

**Standing, every phase.** `yarn lint` · `yarn typecheck` · **all convention tests on Linux** ·
full vitest · five-locale parity · `openapi:generate` + `raw-docs:generate` regenerated and
committed · `yarn build` · PG16 **and** PG17 · **a successful rebase onto current upstream
immediately before merge**. And: *no phase starts while the next phase's product decisions are
unanswered.*

---

## 11. Explicitly excluded from every number

Infrastructure and devops (MinIO provisioning and Coolify wiring, the new volume in the backup
set with a rehearsed restore, DNS/SPF/DKIM/DMARC for a separate sending domain, Resend account
and domain verification, Postgres sizing, workflow event-log retention) · third-party calendar
time (DocuSign production certification; Google/Microsoft OAuth verification including CASA
assessment, **4–8 weeks** and a recurring audit fee, if D1 forces it) · QA (no manual passes, no
cross-browser, no accessibility, **no performance testing** — yet R3 requires one as an exit
criterion) · UAT and client review (a 538-send, an invoice PDF layout, a dedupe merge UI and an
eSign flow each need sign-off; each round trip is 3–10 business days) · data migration and
cutover of the real Pipedrive data · **design** (every estimate assumes the developer designs
the UI; a dedupe workbench, a campaign composer and an invoice PDF are design work) · security
review (the programme adds a public unauthenticated unsubscribe POST, a widened public web-form
ingest, presigned object URLs and webhook receivers) · support, incident response, user
training, documentation beyond `content/docs` · project management and the ~25 product-decision
conversations.

---

## 12. The five things to do this week

1. ~~Fix the red CI~~ — **done**, `aaa9bc2e`.
2. **Get D1** — the client's mail provider and tenant policy. It can make or unmake ~20 days.
3. **Run S1** — the 30-day durable sleep spike (0.5d).
4. **Run S2** — the advisory-lock baseline (0.5d).
5. **Install S3** — the Docker conventions pre-push hook (1d).

One week that de-risks the other fifty.
