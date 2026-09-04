# PRD 00 — Product Overview

## Goal

Turn our fork of Customermates into a CRM that a sales team can move to from Pipedrive
without losing how they work.

## Context

Customermates is a well-built CRM with contacts, organizations, deals, services, tasks,
typed custom fields, RBAC, an audit log, webhooks and a 65-endpoint REST API. What it does
not have is the thing Pipedrive is: **a pipeline**.

Verified against `prisma/schema.prisma` at commit `2e58e5f`, the `Deal` model is:

```
id, name, totalValue, totalQuantity, weightedValue, companyId, notes,
createdAt, updatedAt + relations to organizations, users, contacts,
services, tasks, customFieldValues
```

There is no stage, no won/lost, no close date, no probability, no pipeline.
`grep -n "stage" prisma/schema.prisma` returns zero matches.

Today, stages are simulated: a company creates a `singleSelect` custom column, assigns a
`weight` to each option, and nominates it as `Company.dealWeightingColumnId`. The kanban
board groups by that column and `weightedValue` is derived from the selected option's
weight. It works as one flat pipeline per company, and it is what we are replacing.

A second gap is scheduling. `Task` has `type` (only `userPendingAuthorization` or
`custom`), `name`, `relatedUserId`, `notes` and relations — **no due date, no completion
state, no activity type**. `Calendar` and `CalendarEvent` exist but require a
`ConnectedAccount`, which is disabled in self-hosted mode. So there is no scheduling at all.

## Users

- **Sales rep** — lives in the pipeline. Drags deals between stages, marks them won or
  lost, works a list of activities due today.
- **Sales manager** — needs forecast, funnel conversion, win rate and sales cycle.
- **Admin** — configures pipelines, stages, probabilities, lost reasons; runs the import.

## Milestones

| ID | Milestone | Delivers | Est. |
|----|-----------|----------|------|
| M1 | Foundations | A branded instance that boots and sends mail | 3d |
| M2 | Pipeline core | Real stages, kanban by stage, weighted forecast | 12–16d |
| M3 | Closing & multi-pipeline | Won/lost, lost reasons, rotting, several pipelines | 10–15d |
| M4 | Data migration | CSV import + Pipedrive migration | 8–13d |
| M5 | Activities | Scheduled activities, agenda, overdue | 5–8d |
| M6 | Reporting | Funnel, win rate, sales cycle | 5–8d |

**Stop after M4 and reassess with the client** — that is a usable CRM holding their real
data, and it is cheaper to ask them what they miss than to guess now.

## Non-goals

- Anything under `ee/`. Unified inbox, connected accounts, SSO and white-labelling need a
  commercial agreement and are out of scope permanently.
- Email or calendar sync — Cloud-only, behind `ee/`.
- A native mobile app.
- A built-in automation builder. Automation is external n8n.
- Rewriting the data-view, filtering or custom-column systems. We extend them.

## Constraints

- **AGPL-3.0.** Everything we build is AGPL and must be offered as source to users of the
  instance. Do not design around an assumption of secrecy.
- **`ee/` is untouchable.** No edits, no activating Enterprise features.
- **Small fork delta.** Upstream moves fast and we rebase onto it. Additive files beat
  edits; small edits beat large ones.
- **Convention tests are the contract.** See `CLAUDE.md`. All 76 must stay green.

## Definition of done for the whole programme

A sales team can: create deals in a named pipeline, drag them through ordered stages, see
a weighted forecast, mark deals won or lost with a reason, see which deals have gone stale,
schedule and complete activities against them, import their Pipedrive export with history
intact, and read a funnel with win rate and average sales cycle.
