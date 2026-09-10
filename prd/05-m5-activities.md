# PRD 05 — M5: Activities and scheduling

**Estimate:** 5–8 days · **Depends on:** M2

For a lot of sales teams this matters more than the pipeline. Pipedrive's daily loop is
"call Bob Tuesday 3pm, mark done" — and none of it exists here.

---

## The gap

`Task` in `prisma/schema.prisma` is:

```
id, type (TaskType: userPendingAuthorization | custom), companyId, name,
relatedUserId, notes, createdAt, updatedAt + relations
```

**No due date. No completion state. No activity type. No duration.**

`Calendar` and `CalendarEvent` exist but both require a `ConnectedAccount` and carry a
`unipileCalendarId` — they mirror externally synced calendars via the `ee/` messaging
integration, and connected accounts redirect to `/dashboard` in self-hosted mode. **They
cannot be used.** This has to be native, in the AGPL tree.

---

## T5.1 — Schema

```prisma
enum ActivityKind { call meeting email task deadline lunch }

// added to model Task
  activityKind    ActivityKind?
  dueAt           DateTime?
  durationMinutes Int?
  completedAt     DateTime?
  completedById   String?
  completedBy     User?    @relation("TaskCompletedBy", fields: [completedById], references: [id], onDelete: SetNull)

  @@index([companyId, dueAt])
  @@index([companyId, completedAt])
  @@index([relatedUserId, dueAt])
```

Extending `Task` rather than adding an `Activity` model is deliberate: `Task` already has
the relation tables the CRM needs (`TaskDeal`, `TaskContact`, `TaskOrganization`,
`TaskService`, `TaskUser`), the RBAC `Resource.tasks`, and 12 OpenAPI operations. A parallel
model would duplicate all of it and double the fork delta.

`activityKind` is nullable so existing tasks stay valid.

---

## T5.2 — Behaviour

- Marking complete sets `completedAt` and `completedById`; un-completing clears both.
- A task with `dueAt` in the past and no `completedAt` is **overdue** — derived in the
  query, not stored.
- "Next activity" for a deal is its earliest incomplete task with a `dueAt`.
- Completing an activity offers to schedule the next one — this is the single most
  important habit Pipedrive builds, and it is cheap to copy.
- Extend `features/tasks/` create and update interactors, schemas, repos and the 12
  `.openapi.ts` files. Regenerate the spec.

---

## T5.3 — UI

- **Agenda view** — a new tab on the tasks page: overdue, today, tomorrow, this week,
  later. Grouped, sorted by `dueAt`, completable inline.
- **Deal detail** — next activity in the pinned summary (respect
  `entity-detail-pinned-summary.test.ts`), plus the activity list with due dates and
  completion.
- **Kanban card** — next-activity indicator and an overdue marker. A deal with no scheduled
  activity is worth flagging; that is the behaviour Pipedrive drives.
- **Dashboard** — "My overdue activities" and "Due today" counts.

Icons per `ActivityKind`. All copy in five locales.

---

## Milestone acceptance

- A rep can schedule a call against a deal for a date and time, see it in the agenda, and
  complete it.
- Overdue activities are visible on the dashboard, the agenda and the kanban card.
- Completing an activity prompts to schedule the next.
- Deals with no next activity are identifiable via a filter.
- Conventions green, OpenAPI regenerated, five locales updated.
- Tests cover overdue boundaries, completion and reversal, and next-activity selection with
  ties.
