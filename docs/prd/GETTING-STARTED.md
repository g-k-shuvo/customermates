# Getting started — day one to first merged milestone

Everything verified against `customermates/customermates` at `2e58e5f`. Commands are the
repo's own scripts, not invented ones.

---

## Step 0 — Prerequisites

| Need | Why |
|---|---|
| **Node 24** (`.node-version` pins 24.18.0) | `yarn install` refuses on anything else — the engine check is hard |
| Yarn 1.x (classic) | `yarn.lock` is v1 |
| Docker + Compose v2 | `yarn db:provision` runs a Postgres 17 container |
| ~10 GB free disk | node_modules, `.next`, the PG volume, and a 6.8 GB image if you build one |
| 16 GB RAM on the build machine | the production build OOMs below this |

```bash
node --version    # must be 24.x
docker --version
```

If you use nvm: `nvm install 24 && nvm use 24`. The repo has `.nvmrc`, so `nvm use` alone
works once installed.

---

## Step 1 — Fork on GitHub, don't just clone

Fork `customermates/customermates` into your org through the GitHub UI first. You want a
real fork because you will be sending the Dockerfile fix — and possibly the pipeline work —
back upstream as PRs.

```bash
git clone git@github.com:YOUR-ORG/customermates.git crm
cd crm

git remote add upstream https://github.com/customermates/customermates.git
git remote -v      # origin = your fork, upstream = theirs
git fetch upstream
```

**AGPL housekeeping, do it now while it's cheap.** Section 5(a) requires modified versions
to carry prominent notices that you changed them and when. Add a `NOTICE.md` at the root:

```
This is a modified version of Customermates (https://github.com/customermates/customermates),
originally Copyright (c) 2026-present Benjamin Wagner, dba Customermates.

Modified by <Your Company> from <date>. Changes: rebranding, self-hosted deployment fixes,
sales pipeline, data import, activity scheduling, pipeline reporting.

Licensed under AGPL-3.0-only. Source for this modified version is available at <URL>.
```

Do not remove the existing `LICENSE`, `ee/LICENSE.md`, or any copyright headers.

---

## Step 2 — Branch

```bash
git checkout -b fork/main upstream/main
git push -u origin fork/main
```

`fork/main` is your long-lived integration branch. Feature branches come off it; upstream
rebases land on it. Keep `main` tracking upstream untouched so diffing is easy.

---

## Step 3 — Install and bring up a database

```bash
yarn install --frozen-lockfile
yarn db:provision
```

`db:provision` creates a Postgres 17 container and a named volume owned by this working
directory, on a deterministic port derived from the path hash — so multiple worktrees don't
collide. It prints a `DATABASE_URL` and `DIRECT_URL`. It is idempotent; re-running is safe.

```bash
cp .env.cloud.template .env
# paste the printed DATABASE_URL and DIRECT_URL into .env
yarn db:reset      # migrations + seed + workflow schemas
```

`yarn db:reset` calls `ee/scripts/reset-db.sh`. That is fine — the commercial licence
permits copying and modifying `ee/` for internal, non-production development and testing.
Do not ship modified `ee/` code to production.

---

## Step 4 — Run it, and get logged in without email

```bash
yarn dev          # http://localhost:4000
```

Signup sends a verification email through Resend, which you probably haven't configured.
Skip it:

```bash
yarn dev:become you@example.com
```

That mints a local session cookie directly against your dev database — localhost only. Use
it every time instead of wiring up mail in development.

---

## Step 5 — Establish a green baseline

Do this **before** changing anything, so you know what you broke later.

```bash
yarn typecheck
yarn lint
yarn conventions:check     # the 76 architecture tests
yarn test
yarn i18n:audit
```

All five should pass on a clean checkout. If any fail on unmodified upstream code, note it
and tell the team — you are not chasing it.

---

## Step 6 — Land the PRD pack as your first commit

```bash
cp /path/to/prd/CLAUDE.md ./CLAUDE.md
mkdir -p docs/prd
cp /path/to/prd/0*.md /path/to/prd/README.md /path/to/prd/GETTING-STARTED.md docs/prd/

git add CLAUDE.md docs/prd NOTICE.md
git commit -m "docs: add fork conventions and milestone PRDs"
git push
```

`CLAUDE.md` must be at the **repository root** — Claude Code loads it automatically from
there and nowhere else. This is the difference between an agent that works with the
architecture and one that fights it.

---

## Step 7 — Apply the M1 deployment fixes

The patch from the spike package covers T1.1–T1.4:

```bash
git checkout -b feat/m1-foundations
git am < /path/to/0001-fork-fix-broken-runner-stage-rebrand-hide-vendor-mar.patch
```

Then add the build-heap fix by hand — in `Dockerfile`, immediately before `RUN yarn build`
in the builder stage:

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=5120"
```

Verify it actually boots:

```bash
docker build -t crm:local .
docker compose up -d
docker compose logs -f app          # expect: ✓ Running next.config.ts
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:4000/en/auth/sign-in
```

Expect `200`. Without the fix you get a crash loop on
`Cannot find module './core/seo/route-aliases'`.

---

## Step 8 — Hand T1.5 to Claude Code

SMTP is the one M1 task not in the patch. This is your first real agent session, and a good
one to calibrate on — small, well-bounded, touches one directory.

```
Read CLAUDE.md, then docs/prd/01-m1-foundations.md.

Implement T1.5 only — the SMTP email transport. Do not touch the other tasks.

Constraints from CLAUDE.md that matter here:
- no comments anywhere in the code you write
- no console access
- keep the change inside features/email/ and env.ts; do not modify call sites
- unit tests colocated in features/email/__tests__/

When done, run: yarn lint && yarn typecheck && yarn conventions:check && yarn test
```

Review the diff against the acceptance criteria in the PRD, not against whether it looks
plausible. Then:

```bash
git commit -m "feat(email): add smtp transport alongside resend"
```

Conventional Commits, lowercase scope, no trailing period — commitlint runs on the
`commit-msg` hook and will reject anything else.

---

## Step 9 — Send the Dockerfile fix upstream

Separate branch off clean upstream, so the PR contains only the fix:

```bash
git checkout -b fix/docker-runner-missing-modules upstream/main
# apply only the Dockerfile COPY change
git commit -m "fix(docker): copy core and content into the runner stage"
git push origin fix/docker-runner-missing-modules
```

Open the PR against `customermates/customermates`. It currently breaks the documented
install path for every self-hoster and it is two lines. Note that contributing means
accepting `.github/CLA.md` — a licence grant, not a copyright assignment; you retain all
right, title and interest in your contributions.

---

## Step 10 — Start M2

M2 is 12–16 days and too large for one agent session. Split it along the task boundaries
already in the PRD — each maps to roughly a day or three:

| Session | Task | Branch |
|---|---|---|
| 1 | T2.1 + T2.2 schema and migration | `feat/m2-pipeline-schema` |
| 2 | T2.3 backfill migration | `feat/m2-stage-backfill` |
| 3 | T2.4 `features/pipelines` slice | `feat/m2-pipelines-feature` |
| 4 | T2.5 deal fields end to end | `feat/m2-deal-pipeline-fields` |
| 5 | T2.6 kanban by stage | `feat/m2-kanban-stage-grouping` |
| 6 | T2.7 forecast from stage probability | `feat/m2-stage-forecast` |
| 7 | T2.8 pipeline and stage admin UI | `feat/m2-pipeline-admin` |

Session prompt shape:

```
Read CLAUDE.md, then docs/prd/02-m2-pipeline-core.md.

Implement T2.4 only — the features/pipelines slice. T2.1 and T2.2 are already merged;
the schema is in place.

Follow the structure of features/deals exactly. Watch these enforced rules:
- .openapi.ts must sit beside its .interactor.ts
- prisma repositories are value-imported only by core/di.ts
- interactors return expected failures, they do not throw them
- every Prisma write is tenant-scoped through accessWhere
- repository methods that throw on missing records end in OrThrow

Run yarn conventions:check and yarn test before you finish.
```

**Do T2.3 with particular care.** The backfill has to turn every company's existing
`singleSelect` weighting column into real stages without anyone's board changing shape.
Seed a database in the old format, snapshot the board, migrate, and diff. It is the task
most likely to fail quietly.

---

## The review loop

For every agent PR, check in this order — cheapest signal first:

1. `yarn conventions:check` — the 76 tests catch most architectural drift automatically.
2. Read the migration. Migrations are the only thing here that is hard to undo in production.
3. Check the diff size against the PRD's file list. A change touching far more than the PRD
   anticipated usually means the agent worked around a convention rather than with it.
4. Confirm generated files are committed — CI fails on stale `openapi:generate` output.
5. Only then read the implementation.

---

## Keeping up with upstream

Weekly, not at the end:

```bash
git fetch upstream
git checkout fork/main
git rebase upstream/main
yarn install --frozen-lockfile
yarn db:reset
yarn conventions:check && yarn test
```

Upstream pushes ~87 commits a month with no release cadence. Rebasing weekly means small
conflicts you can reason about. Rebasing quarterly means a bad week.

If a rebase conflicts inside a file you edited, that is the fork tax being charged. Note
which files cost you the most — those are the candidates for restructuring as additive
files instead of edits.

---

## Two things to get right early

**Migrations must work on PostgreSQL 16 and 17.** Dev provisions 17; the self-host compose
runs 16; CI verifies both. A migration using a 17-only feature passes locally and fails in
CI.

**Never touch `ee/`.** 335 files under a commercial licence. `open-core-license.test.ts`
guards the boundary. Anything that needs `ConnectedAccount` — inbox, calendar sync, email
sync — is unavailable in self-hosted mode and out of scope permanently.
