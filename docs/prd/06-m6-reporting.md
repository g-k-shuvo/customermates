# PRD 06 — M6: Pipeline reporting

**Estimate:** 5–8 days · **Depends on:** M3 (`DealStageHistory`)

---

## What exists

The widget system is real but narrow. From `prisma/schema.prisma`:

```prisma
enum WidgetKind { chart activityTimeline }
enum AggregationType { count dealValue dealQuantity dealWeightedValue }
enum WidgetGroupByType { contact organization deal service customColumn none }
```

`Widget` already carries `entityFilters`, `dealFilters`, `displayOptions`, `groupByType`,
`groupByCustomColumnId`, `aggregationType`, `layout`, `isTemplate`. Grouping by a custom
column works today, so "deals by stage" is nearly free.

Everything time-based has to be built, and all of it reads `DealStageHistory`.

---

## T6.1 — Group by stage and pipeline

Add to `WidgetGroupByType`: `dealStage`, `dealPipeline`. Add
`groupByPipelineStageId`/`groupByPipelineId` handling alongside the existing
`groupByCustomColumnId`.

Gets you, with existing aggregations: deals by stage (count), value by stage, weighted
value by stage. Respect `dashboard-widget-ui.test.ts`.

---

## T6.2 — Funnel

New `WidgetKind.funnel`. For a pipeline and a period, per stage: deals that entered, deals
that advanced, conversion rate to the next stage, and overall open-to-won conversion.

Reads `DealStageHistory` — "entered" means a history row with that `toStageId` in the
window, not deals currently sitting there. Getting this wrong is the classic funnel bug.

---

## T6.3 — Win rate

New `AggregationType.winRate`. Won ÷ (won + lost) over closed deals in the period, by
count and by value. Groupable by owner, pipeline, stage-lost-at, lost reason and period.

Open deals are excluded from the denominator. State this in the widget subtitle — it is the
number people argue about.

---

## T6.4 — Sales cycle and time in stage

New `AggregationType.salesCycleDays` and `stageDurationDays`.

- Sales cycle: mean and median days from deal creation to `wonAt`, for won deals in the
  period.
- Time in stage: mean and median `durationSeconds` from `DealStageHistory`, per stage.

Report median alongside mean. A single large deal skews the mean and the mean is what gets
quoted.

---

## T6.5 — Default dashboard

Ship a template dashboard (`Widget.isTemplate`) seeded for new companies:

1. Open pipeline value by stage
2. Weighted forecast by expected close month
3. Funnel for the default pipeline, last 90 days
4. Win rate by owner, last 90 days
5. Average sales cycle, last 12 months
6. Deals lost by reason, last 90 days

---

## Performance

These are aggregate queries over the two largest tables. Before shipping:

- Verify the M3 indexes (`[companyId, enteredAt]`, `[dealId, enteredAt]`, `[toStageId]`,
  `[companyId, status, closedAt]`) are actually used — `EXPLAIN ANALYZE` on a seeded
  dataset of at least 100k deals and 500k history rows.
- Aggregate in SQL. Do not pull rows into Node and reduce there.
- Bound every query by company and period. An unbounded dashboard query is how this gets
  slow in month three.

---

## Milestone acceptance

- A manager opens the dashboard and sees funnel, win rate and sales cycle without
  configuring anything.
- Funnel conversion is computed from stage history, not current stage occupancy.
- Median is shown next to mean everywhere an average appears.
- Every widget query is bounded and index-backed; verified with `EXPLAIN ANALYZE` at scale.
- Conventions green, five locales updated.
- Tests cover funnel maths against a fixture with known transitions, win-rate denominator
  handling, and median vs mean on a skewed set.
