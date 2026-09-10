# Working in this repository

This is a fork of `customermates/customermates` — an open-core CRM (Next.js 16, React 19,
Prisma 7, PostgreSQL, better-auth, Tailwind v4, MobX, TanStack Table). We are extending it
into a Pipedrive replacement for a client.

**Read this file completely before writing any code.** This codebase enforces its
architecture with ~76 automated convention tests under `tests/conventions/`. Code that
ignores the rules below will fail CI even when it compiles and works.

---

## The rules that will bite you first

### 1. No comments. Anywhere.

`tests/conventions/no-comments.test.ts` scans `app/`, `components/`, `features/`, `ee/`,
`core/`, `workflows/` and `i18n/` with the TypeScript AST and fails on **any** comment.

Only allowed: `eslint-*`, `@ts-*`, `prettier-*` directives, and triple-slash references.
Only `core/di.ts` is allowlisted as a file.

Do not write explanatory comments, JSDoc, TODOs, or section banners. If code needs
explaining, rename things until it doesn't. This applies to code you generate — the
default instinct to annotate will break the build.

### 2. No `console`

`tests/conventions/runtime-console.test.ts` catches direct and qualified access
(`console.log`, `globalThis.console.*`, aliases). Use the existing error reporting in
`core/errors/`.

### 3. Every user-visible string is translated

Hardcoded copy in JSX, text-bearing props, conditional copy, object labels and prop
defaults all fail `tests/conventions/*i18n*` and `terminology-boundary`. Add keys to
**all five** locales — `i18n/locales/{en,de,es,fr,it}.json` — parity is enforced.

Keys are namespaced by feature (`DealModal`, `DataView`, `CompanySettings`, …). Note the
`Deals` namespace is currently empty; deal UI copy lives in `DealModal`, `DataView`,
`EntityDetail`.

Never call `createZodError` with a string or template literal — pass a key.

### 4. Never format dates, numbers or sort strings directly

No ambient `Intl`, no `toLocaleString`/`toLocaleDateString`, no `localeCompare`. Use the
shared formatting boundary in `i18n/formatters.tsx`. Enforced by
`locale-consumer-audit` and `hydration-safe-intl`.

---

## Architecture

### Feature slices

```
features/<entity>/
  <entity>.schema.ts              Zod DTO schemas
  prisma-<entity>.repository.ts   Prisma implementation
  <operation>.repo.ts             narrow per-operation repo interfaces
  get/    <op>.interactor.ts + <op>.openapi.ts
  upsert/ <op>.interactor.ts + <op>.openapi.ts
  delete/ <op>.interactor.ts + <op>.openapi.ts
  __tests__/
```

For scale: `features/deals` is 35 files, `features/services` 33, `features/tasks` 38.
A new entity is not a small change — budget accordingly.

### Interactors

Business logic lives in interactors, never in route handlers or components.

```ts
@TenantInteractor({ resource: Resource.deals, action: Action.create })
export class CreateDealInteractor extends AuthenticatedInteractor<CreateDealData, DealDto> {
  constructor(private repo: CreateDealRepo, private eventService: EventService) { super(); }

  @Write({ input: CreateDealSchema, output: DealDtoSchema, precheck: (self, data, ctx) => ... })
  async invoke(data: CreateDealData): Validated<DealDto> {
    ...
    return { ok: true as const, data: deal };
  }
}
```

Enforced by `interactor-error-contract.test.ts`:

- **Return expected failures, do not throw them.** Tenant interactors return a result
  object. Throwing an expected failure fails the test.
- **Id validators must classify not-found as `not_found`.**
- **Output validation runs inside explicit transactions.**
- **Access `AppError`s may only be constructed inside access infrastructure** — not in
  feature code.

Decorators live in `core/decorators/`: `tenant-interactor`, `write`, `validate`,
`validate-output`, `transaction`, `bypass-tenant`, `system-interactor`, `allow-in-demo-mode`.

### Repositories

Extend `BaseRepository` (`core/base/base-repository.ts`).

- **Every Prisma `update` / `updateMany` / `upsert` must be tenant-scoped** through
  `this.accessWhere(model)`, or carry `@BypassTenantGuard` with a real justification.
  Enforced by `tenant-write-scoping.test.ts`.
- **Naming is enforced** (`repo-naming.test.ts`): a method that throws when a record is
  missing ends in `OrThrow`. Scope is explicit in the name — `OrThrowUnscoped`,
  `OrThrowCompanyWide`. `Unscoped` and `CompanyWide` are meaningful suffixes, not decoration.
- **Prisma repositories may only be value-imported by `core/di.ts`**
  (`di-boundaries.test.ts`). Everywhere else imports the narrow `*.repo.ts` interface with
  `import type`.

### Dependency injection

`core/di.ts` — 1,514 lines, 273 hand-written factory functions, no container. Register
every new interactor and repository here. It is the one file allowed to contain comments.

### OpenAPI

- One `.openapi.ts` per operation, **in the same directory as its `.interactor.ts`**
  (`openapi-colocation.test.ts`).
- Every route module must be represented in the spec (`rest-openapi-coverage.test.ts`).
- Regenerate with `yarn openapi:generate` and commit the result.

### Prisma

- **Every model needs `companyId`** plus the relation and an index, unless it is on the
  allowlist in `prisma-tenant-fk.test.ts`. Over 35 of the 40+ models have it.
- Migrations are hand-named: `prisma/migrations/YYYYMMDDHHMMSS_snake_case_name/`.
- Data migrations that backfill must be idempotent and safe to re-run.

### Events

Publish domain events through `EventService`; kinds are in
`features/event/domain-events.ts`. Cross-entity side effects belong in listeners, not
inline in the interactor that caused them.

### Client-side

- MobX stores (`*.store.ts(x)`), `observer()` components.
- Promises started from a JSX handler go through `runUserAction`
  (`core/errors/report-application-error.ts`) — enforced by `user-action-boundary.test.ts`.
- Overlays, page states, drawers and tabs each have their own enforced contract; copy an
  existing usage rather than inventing one.

---

## Licence boundaries — do not cross these

- Everything outside `ee/` is **AGPL-3.0-only**. Our changes go here.
- **`ee/` is proprietary** (335 files, Customermates Commercial License). Do not modify
  anything under `ee/`, and do not make an Enterprise feature operational — unified inbox,
  connected accounts, SSO, white-labelling. `tests/conventions/open-core-license.test.ts`
  guards this.
- Self-hosted mode (`APP_MODE=self-hosted`) redirects `/inbox`,
  `/profile/connected-accounts` and `/company/subscription`. Do not build features that
  depend on `ConnectedAccount` — it is unavailable in our deployment.

**The one agreed exception.** `ee/agent-chat/__tests__/provider-safe-schema.test.ts` pins an
exact census of MCP tool schema formats (`{ uuid: N, email: 6, uri: 4 }`). Every uuid field we
add to an MCP tool input raises that count, so the constant must be bumped with the change or
`yarn test` fails. Bump the number; never remove fields to satisfy it. This is the only edit
sanctioned under `ee/`, and it will conflict on rebase.

---

## Commands

```bash
yarn db:provision        # worktree-owned Postgres 17 container, deterministic port
yarn db:reset            # apply migrations, seed, prepare workflow schemas
yarn dev                 # localhost:4000
yarn dev:become <email>  # mint a local session cookie — log in without sending mail
yarn conventions:check   # the 76 convention tests. run before every commit
yarn typecheck           # fumadocs source config + tsc --noEmit
yarn lint                # eslint, --max-warnings 0
yarn test                # full vitest
yarn i18n:audit          # locale parity across all five catalogs
yarn openapi:generate
yarn build
```

Git hooks are active. `pre-commit` runs `yarn lint --max-warnings=0` and `tsc --noEmit`,
and **fails if the hook modified files** — re-stage and commit again. `commit-msg` runs
commitlint.

Node 24 is required (`.node-version`). The Docker build needs
`NODE_OPTIONS="--max-old-space-size=5120"` in the builder stage or it OOMs, and a
4 vCPU / 16 GB build machine.

## Commits

Conventional Commits, lowercase scope, header ≤ 100 chars, no trailing period.

```
feat(deals): add pipeline stage to the deal model
fix(kanban): keep group counts stable when a stage is renamed
```

## Definition of done

CI (`.github/workflows/test.yml`) runs, in order: seed verification, `yarn openapi:generate`,
`yarn raw-docs:generate`, **a check that generated files are committed**, `yarn typecheck`,
`yarn lint`, `yarn test`, `yarn i18n:audit`. A second job verifies the schema against
**PostgreSQL 16** as well as 17 — dev provisions 17, the self-host compose runs 16, so every
migration must work on both.

Before opening a PR:

1. `yarn lint` clean, `yarn typecheck` clean.
2. `yarn conventions:check` green — all 76.
3. `yarn test` green, with unit tests for new interactors in a colocated `__tests__/`.
4. All five locales updated; `yarn i18n:audit` clean.
5. `yarn openapi:generate` and `yarn raw-docs:generate` run **and the diffs committed** —
   CI fails if generated files are stale.
6. `yarn build` succeeds.

## Keep the fork delta small

Upstream pushes ~87 commits a month with no release cadence, and we rebase onto it. Prefer
additive files over edits to existing ones; when you must edit an existing file, make the
smallest change that works. Every line we touch is a future merge conflict.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
