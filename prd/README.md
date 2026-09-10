# PRD pack — Customermates → Pipedrive replacement

Specified against `customermates/customermates` at commit `2e58e5f` (31 Aug 2026), with
the schema, feature slices, kanban grouping, DI and convention tests read directly.

## How to use this with Claude Code

0. Follow `GETTING-STARTED.md` — prerequisites, fork setup, dev database, green baseline.
1. Copy `CLAUDE.md` to the **repository root**. Claude Code loads it automatically and it
   is the single most important file here — this codebase enforces its architecture with
   ~76 convention tests, and an agent that has not read them will write code that compiles,
   works, and fails CI.
2. Copy the numbered PRDs to `docs/prd/` in the repo.
3. Work one milestone at a time. Open a session per milestone and point it at the file:

   ```
   Read docs/prd/02-m2-pipeline-core.md and implement it. Follow CLAUDE.md.
   Run `yarn vitest run tests/conventions` before you commit.
   ```

4. Do not run milestones in parallel. M3 depends on M2's schema, M6 depends on M3's
   `DealStageHistory`.

## Files

| File | Purpose |
|------|---------|
| `GETTING-STARTED.md` | Day-one setup through first merged milestone. **Start here.** |
| `CLAUDE.md` | Repo conventions. Goes at the repo root. Read second. |
| `00-product-overview.md` | Goal, users, milestones, non-goals, constraints |
| `01-m1-foundations.md` | Deployment blockers, SMTP |
| `02-m2-pipeline-core.md` | Pipeline + Stage models, kanban by stage, forecast |
| `03-m3-closing-multi-pipeline.md` | Won/lost, lost reasons, history, rotting, multi-pipeline |
| `04-m4-data-migration.md` | CSV import, Pipedrive migration |
| `05-m5-activities.md` | Scheduling on Task, agenda, overdue |
| `06-m6-reporting.md` | Funnel, win rate, sales cycle |

## A note on estimates

Days assume one experienced Next.js/Prisma developer and cover implementation plus unit
tests — not infrastructure, QA, UAT or client review. They assume the codebase's
conventions are followed rather than worked around. Ignoring them is faster once and
slower forever.
