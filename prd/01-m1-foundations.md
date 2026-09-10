# PRD 01 — M1: Foundations

**Estimate:** 3 days · **Depends on:** nothing · **Blocks:** everything

Make the fork build, boot, and behave like our product rather than the vendor's.

---

## T1.1 — Fix the Docker runner stage

**Problem.** `ghcr.io/customermates/customermates:latest` crash-loops:

```
Error: Cannot find module './core/seo/route-aliases'
Require stack: /app/next.config.compiled.js
error Command failed with exit code 1
```

`next.config.ts` imports `@/core/seo/route-aliases`, and `content/derived-tokens` is
resolved at server start, but the Dockerfile runner stage copies only
`core/config/environment.ts` and `core/fumadocs`. Prisma migrations apply fine — all 35
run — so this is purely a packaging bug.

**Change.** In `Dockerfile`, replace the two narrow `core/` copies in the runner stage with
the whole trees:

```dockerfile
COPY --from=builder /app/core ./core
COPY --from=builder /app/content ./content
```

**Acceptance**
- `docker build -t crm:local .` succeeds.
- `docker compose up -d` reaches a stable `Up` state with no restart loop.
- Logs show `✓ Running next.config.ts`.
- `/`, `/en`, `/en/auth/sign-in`, `/en/dashboard` all return HTTP 200.

**Also:** open this as a PR upstream. It breaks the documented install path for every
self-hoster and it is two lines.

---

## T1.2 — Make the build survive

**Problem.** `yarn build` compiles successfully (~4 min) then dies during static
generation: `FATAL ERROR: Ineffective mark-compacts near heap limit`. Upstream sets no
`NODE_OPTIONS`.

**Change.** In the builder stage of `Dockerfile`, before `RUN yarn build`:

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=5120"
```

**Acceptance**
- Build completes end to end on a 4 vCPU / 16 GB runner.
- Document the build-machine requirement in the repo README.

**Note.** A large part of the cost is statically generating 412 marketing content files
across 5 locales. If T1.3 is later done by deletion rather than redirect, revisit this.

---

## T1.3 — Do not serve the vendor's marketing site

**Problem.** The public marketing pages live in the same Next.js app and are not gated by
`APP_MODE`. On a self-hosted instance `/`, `/en/pricing`, `/en/blog`, `/en/compare/*` and
`/en/docs` all return 200 — the vendor's homepage and per-seat price list, on our client's
domain. The homepage alone contains 163 brand mentions.

**Change.** In `app/[locale]/(static)/layout.tsx`, before the locale check:

```ts
if (env.APP_MODE === "self-hosted") redirect("/dashboard");
```

`env` is already imported. Import `redirect` alongside `notFound`.

**Why a redirect and not deletion.** Deleting `app/[locale]/(static)/` and the 412 files
under `content/` is cleaner and cheaper to build, but it is a large fork delta against a
fast-moving upstream. Redirect first; revisit if the build cost bites.

**Acceptance**
- With `APP_MODE=self-hosted`, `/`, `/en/pricing`, `/en/blog`, `/en/compare/*` redirect to
  `/dashboard`.
- `/en/auth/sign-in` and the invitation flow still work — they are in `(public)`, not
  `(static)`.
- With `APP_MODE=cloud`, marketing pages render unchanged.

---

## T1.4 — Brand the application surface

Colour is four values in `styles/globals.css`: `--primary` and `--ring`, in the light
block (~lines 340–410) and the dark block (~lines 411–470). Everything downstream is a CSS
custom property.

Also update: `core/openapi/openapi-spec.ts` (`title`, `description`),
`components/emails/base/email-layout.tsx` (logo `alt`, footer), the logo assets under
`public/images/{light,dark}/`, and favicons.

**Acceptance**
- No "Customermates" string renders in any authenticated view or outbound email.
- Light and dark themes both legible; contrast checked.
- Total diff for branding stays under ~30 lines outside asset files.

---

## T1.5 — SMTP email transport

**Problem.** `features/email/email.service.ts` instantiates the Resend SDK directly
(`new Resend(env.RESEND_API_KEY)`). There is no nodemailer or SMTP path anywhere. Signup
verification, password reset and team invitations all route through it, so self-hosting
requires a Resend account and a verified sending domain.

**Change.** Introduce a transport interface behind the existing email service and select on
config:

- `EMAIL_TRANSPORT=resend` (default, unchanged behaviour) or `EMAIL_TRANSPORT=smtp`.
- SMTP config: `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT` (default 587), `EMAIL_SMTP_USER`,
  `EMAIL_SMTP_PASSWORD`, `EMAIL_SMTP_SECURE`.
- Add all of it to `env.ts` and `.env.selfhost.template`.

Keep the change inside `features/email/` and `env.ts`. Do not alter call sites.

**Acceptance**
- Signup verification, password reset and invitation emails all send over SMTP against a
  local MailHog or equivalent.
- Setting `EMAIL_TRANSPORT=resend` behaves exactly as before.
- Unit tests cover transport selection and a send failure on each transport.
- No secrets logged.

---

## Milestone acceptance

- Fresh `docker compose up -d` on a clean volume reaches a working sign-in page on our
  branding, at our domain, with a real verification email delivered over SMTP.
- `yarn lint`, `yarn vitest run tests/conventions` and `yarn build` all pass.
