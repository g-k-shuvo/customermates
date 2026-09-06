# M7 — Email integration (AGPL)

**Goal.** Connect real mailboxes over IMAP/SMTP, sync threads into the CRM, show them in an
inbox and on contact and deal records, and reply from inside the app — entirely under
AGPL-3.0, with no Commercial Agreement and no `ee/` code.

**Est.** 21–28d. This is the largest milestone in the programme; M2 was 12–16d.

---

## The licence rule that governs every task

`ee/LICENSE.md` §2 permits copying and modifying `ee/` **for internal, non-production
development and testing only**. It grants no right to relicense that code or ship it.

So:

- **Read `ee/messaging` to understand behaviour. Never copy, paste, port or transliterate it.**
- Everything we write is independently authored and lives outside `ee/`.
- Matching an exported name so an existing AGPL caller keeps compiling is fine. Reproducing
  the body that sits behind that name is not.
- Do not remove the `APP_MODE === "self-hosted"` redirects. §4 forbids deliberately making an
  Enterprise Feature operational or bypassing self-hosted entitlement controls. Our inbox is a
  separate AGPL surface; `/inbox` stays inert.

## What we already own

`prisma/schema.prisma` and `app/` are outside `ee/`, so they are AGPL and reusable as-is:

| Asset | Location | Note |
|---|---|---|
| `ConnectedAccount` | `schema.prisma:1419` | `unipileAccountId` is an opaque unique key; we write `imap:<uuid>` |
| `MessagingThread` | `schema.prisma:1457` | `unipileThreadId` becomes our normalised thread key |
| `MessagingThreadParticipant` | `schema.prisma:1487` | `identifier` holds the email address — this is what links to contacts |
| `MessagingMessage` | `schema.prisma:1512` | `unipileMessageId` becomes the RFC `Message-ID` |
| `MessagingProvider` enum | `schema.prisma:1567` | already has `mail`, `google`, `outlook` |
| `Resource.inboxMessages` | `schema.prisma:929` | permissions already modelled |

The vendor-named columns are unfortunate but functional. Renaming them is an edit to an
upstream model and a permanent rebase conflict, so we keep the names and document the meaning.

## Architecture decision — build our own inbox route, do not repoint `/inbox`

The existing AGPL inbox UI (`app/[locale]/(protected)/inbox/`, 40 files, 5,405 lines) imports
19 distinct `@/ee/messaging` modules, and 91 AGPL files import `@/ee/messaging` in total.
Reusing it means repointing all of that onto our modules.

`CLAUDE.md` is explicit: upstream lands ~87 commits a month, we rebase onto it, and *"additive
files beat edits to existing ones"*. Repointing 91 shared files is the single largest rebase
liability we could take on, and it buys us UI for LinkedIn, WhatsApp, Instagram, Telegram,
drafts and folders — none of which an IMAP-only feature needs.

**Decision.** New route `/mail`, new components under `features/mailbox/` and
`app/[locale]/(protected)/mail/`. Zero edits to the 91 files. `/inbox` keeps its self-hosted
redirect and stays inert. Our fork delta is almost entirely additive files.

## Shape

```
features/mailbox/
  mailbox.schema.ts                 Zod DTOs
  prisma-mailbox.repository.ts
  credentials/
    secret-box.ts                   AES-256-GCM seal/open
    <op>.repo.ts
  connect/
    create-mailbox.interactor.ts    + .openapi.ts
    test-mailbox.interactor.ts      verify host/port/credentials before saving
    delete-mailbox.interactor.ts
  sync/
    imap-client.ts                  imapflow wrapper behind a MailboxTransport interface
    normalize-message.ts            mailparser -> our DTO
    thread-key.ts                   Message-ID / In-Reply-To / References threading
    sync-mailbox.interactor.ts
  inbox/
    get-threads.interactor.ts
    get-thread.interactor.ts
  outbound/
    send-reply.interactor.ts        reuses features/email transport from T1.5
  link/
    link-participants.ts            participant identifier -> Contact / Deal
  __tests__/
```

New dependencies: `imapflow`, `mailparser`, plus a sanitiser for rendering HTML bodies.
`nodemailer` is already installed from T1.5.

---

## T7.1 — Mailbox credentials, encrypted at rest

**Problem.** IMAP needs a password or app password per mailbox. There is **no encryption
helper anywhere in this repo** — nothing matches `createCipheriv`, `encrypt(`, or
`ENCRYPTION_KEY`. Storing these in plaintext is not acceptable.

**Change.** New AGPL model `MailboxCredential`, 1:1 with `ConnectedAccount`, holding
`imapHost`, `imapPort`, `imapSecure`, `username`, and a sealed secret. Additive model, so no
upstream model is edited.

Seal with AES-256-GCM from a new `MAILBOX_SECRET_KEY` (32 bytes, base64). Store nonce and auth
tag alongside the ciphertext. The key never lands in the database and is required at boot when
the feature is enabled.

**Acceptance.**
- Secrets are unreadable in `psql`; no plaintext password in any column, log or error.
- A wrong or rotated key fails closed with a typed error, never a silent empty password.
- Unit tests cover seal/open round-trip, tampered ciphertext, and wrong key.

## T7.2 — IMAP transport behind an interface

**Change.** `MailboxTransport` interface with an `imapflow` implementation, mirroring how
T1.5 put Resend and SMTP behind `EmailTransport`. Keeping the interface now is what makes
Gmail/Outlook OAuth an additive change later rather than a rewrite.

Connection test runs **before** a mailbox is saved, so a typo surfaces in the form.

**Security.** The IMAP host is user-supplied, which is an SSRF vector — a tenant could point it
at an internal address. Reject loopback, link-local and private ranges unless explicitly
allowlisted by env.

**Acceptance.** Connect, list folders, disconnect against a local Greenmail/Dovecot container.
Bad credentials, bad host and TLS failure each produce a distinct typed failure.

## T7.3 — Sync engine (the hard one)

**Change.** Fetch → parse → normalise → persist into the existing models.

- Incremental by `UIDVALIDITY` + last seen `UID` per folder; a `UIDVALIDITY` change forces
  resync of that folder.
- Threading from RFC 5322 `Message-ID`, `In-Reply-To` and `References`, falling back to
  normalised subject plus participant set. `thread-key.ts` is pure and unit-tested — this is
  where correctness lives.
- Idempotent: `@@unique([connectedAccountId, unipileMessageId])` makes re-running a batch a
  no-op. Re-sync must never duplicate a thread or message.
- Participants upserted with `identifier` = lowercased email; this is the join key for T7.5.

**Acceptance.** Syncing the same mailbox twice changes nothing the second time. A reply
lands in its parent thread. Malformed and non-UTF-8 messages are stored, not fatal.

## T7.4 — Scheduling and backfill

**Change.** Cron route following `app/api/cron/lifecycle/route.ts`. Per-mailbox cursor,
exponential backoff on failure, and a Postgres advisory lock so two runs never sync one
mailbox concurrently — `runInTransaction` already takes `pg_advisory_xact_lock`, so follow it.

Initial backfill is bounded (default 90 days, configurable) and resumable. An unbounded
backfill of a ten-year mailbox is how this feature takes down the instance.

**Acceptance.** Overlapping cron runs do not double-sync. A mailbox failing does not stall
the others. Backfill resumes after a kill.

## T7.5 — Link threads to contacts and deals

**Change.** Match `MessagingThreadParticipant.identifier` against contact email addresses
(already a first-class array field). Where a matched contact has exactly one open deal, offer
the deal link; never guess silently across several.

**Privacy.** `MessagingThread.sharedToCrm` already exists and defaults `false`. A personal
mailbox must not dump a user's private mail into a shared CRM record. Default private;
sharing is deliberate.

**Acceptance.** A thread with a known contact shows on that contact. Nothing appears on a
record until it is shared. Tenant scoping holds — no cross-company leakage.

## T7.6 — `/mail` inbox

**Change.** Thread list, thread view, read/unread, search, folder filter. Our own components,
MobX store, `runUserAction` for handlers, all copy in five locales.

**Security.** Rendering third-party HTML email is an XSS sink. Sanitise to an allowlist,
strip scripts and event handlers, allow only safe link schemes, and block remote images by
default behind a "show images" affordance (they are tracking pixels).

**Acceptance.** A stored-XSS payload in a message body does not execute. Convention tests
green — no comments, no `console`, i18n parity across all five catalogs.

## T7.7 — Email on contact and deal records

**Change.** An Emails tab beside the M5 activity timeline on contact and deal detail, showing
shared threads for that record.

**Acceptance.** Opening a deal shows its shared correspondence, newest first, and nothing that
was never shared.

## T7.8 — Reply and compose

**Change.** Reply, reply-all and forward from a thread, sending through the T1.5 transport
already built and verified against MailHog. Set `In-Reply-To` and `References` correctly so
the reply threads in the recipient's client, and append to the IMAP Sent folder so it is not
missing from the user's own mail client.

**Acceptance.** A reply threads correctly in Gmail and Outlook. It appears in the user's Sent
folder. Reply-all excludes the sender's own address.

## T7.9 — Contract work

Permissions on `Resource.inboxMessages`, colocated `.openapi.ts` per operation, regenerated
spec, DI registration in `core/di.ts`, and unit tests colocated in `__tests__/`.

---

## Risks

| Risk | Mitigation |
|---|---|
| Credential theft | T7.1 encryption; key outside the database; never logged |
| Stored XSS from email HTML | T7.6 sanitiser, remote images blocked by default |
| SSRF via user-supplied IMAP host | T7.2 private-range rejection |
| Google deprecating app passwords | T7.2 transport interface keeps OAuth additive |
| Backfill overwhelming the instance | T7.4 bounded, resumable, advisory-locked |
| Upstream rebase pain | Additive files only; `/inbox` and the 91 ee-importing files untouched |
| Deliverability of replies | Client's SPF/DKIM for the sending domain — an infrastructure task for them, not code |

## Open question for the client

Sending replies from their domain needs SPF/DKIM on the SMTP sender. That is the same
unanswered T1.4 input — the sending domain for `RESEND_OPERATOR_EMAIL` / SMTP `from`.
