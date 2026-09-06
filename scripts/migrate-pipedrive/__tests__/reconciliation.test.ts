import { describe, expect, it } from "vitest";

import { MigrationLedger, buildReconciliationReport, emptyTally, renderReconciliationReport } from "../reconciliation";

const startedAt = new Date("2024-01-01T00:00:00.000Z");
const finishedAt = new Date("2024-01-01T00:00:42.000Z");

describe("buildReconciliationReport", () => {
  it("reconciles an entity when source equals target plus skipped", () => {
    const report = buildReconciliationReport({
      dryRun: false,
      startedAt,
      finishedAt,
      tallies: { organizations: { ...emptyTally(), sourceCount: 10, created: 9, targetCount: 9 } },
      skipped: [{ entity: "organizations", sourceId: "7", label: "", reason: "organization has no name" }],
      unmapped: [],
    });

    expect(report.entities).toEqual([
      {
        entity: "organizations",
        sourceCount: 10,
        created: 9,
        updated: 0,
        unchanged: 0,
        targetCount: 9,
        skipped: 1,
        reconciled: true,
      },
    ]);
    expect(report.reconciled).toBe(true);
  });

  it("flags an entity whose counts do not add up", () => {
    const report = buildReconciliationReport({
      dryRun: false,
      startedAt,
      finishedAt,
      tallies: { deals: { ...emptyTally(), sourceCount: 5, created: 3, targetCount: 3 } },
      skipped: [],
      unmapped: [],
    });

    expect(report.entities[0]).toMatchObject({ entity: "deals", reconciled: false });
    expect(report.reconciled).toBe(false);
  });

  it("keeps the PRD's entity order and omits entities the run never touched", () => {
    const report = buildReconciliationReport({
      dryRun: true,
      startedAt,
      finishedAt,
      tallies: {
        deals: { ...emptyTally(), sourceCount: 1, targetCount: 1 },
        organizations: { ...emptyTally(), sourceCount: 1, targetCount: 1 },
      },
      skipped: [],
      unmapped: [],
    });

    expect(report.entities.map((line) => line.entity)).toEqual(["organizations", "deals"]);
  });

  it("reports an entity that only ever produced skips", () => {
    const report = buildReconciliationReport({
      dryRun: false,
      startedAt,
      finishedAt,
      tallies: {},
      skipped: [{ entity: "notes", sourceId: "1", label: "", reason: "note is not attached to anything" }],
      unmapped: [],
    });

    expect(report.entities).toEqual([
      {
        entity: "notes",
        sourceCount: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        targetCount: 0,
        skipped: 1,
        reconciled: false,
      },
    ]);
  });

  it("sorts unmapped values by how often they appeared", () => {
    const report = buildReconciliationReport({
      dryRun: false,
      startedAt,
      finishedAt,
      tallies: {},
      skipped: [],
      unmapped: [
        { kind: "activity.type", value: "email", occurrences: 2 },
        { kind: "activity.type", value: "call", occurrences: 9 },
        { kind: "activity.type", value: "task", occurrences: 2 },
      ],
    });

    expect(report.unmapped.map((entry) => entry.value)).toEqual(["call", "email", "task"]);
  });
});

describe("renderReconciliationReport", () => {
  it("announces a dry run, the per-entity table, unmapped values and skip reasons", () => {
    const rendered = renderReconciliationReport(
      buildReconciliationReport({
        dryRun: true,
        startedAt,
        finishedAt,
        tallies: { deals: { ...emptyTally(), sourceCount: 2, created: 1, targetCount: 1 } },
        skipped: [{ entity: "deals", sourceId: "42", label: "Big deal", reason: "deal is deleted in Pipedrive" }],
        unmapped: [{ kind: "activity.type", value: "call", occurrences: 3, detail: "no home until M5" }],
      }),
    );

    expect(rendered).toContain("DRY RUN (nothing was written)");
    expect(rendered).toContain("after 42s");
    expect(rendered).toContain("Every entity reconciles.");
    expect(rendered).toContain("activity.type: call (x3) — no home until M5");
    expect(rendered).toContain('deals 42 "Big deal" — deal is deleted in Pipedrive');
  });

  it("says loudly when an entity does not reconcile", () => {
    const rendered = renderReconciliationReport(
      buildReconciliationReport({
        dryRun: false,
        startedAt,
        finishedAt,
        tallies: { contacts: { ...emptyTally(), sourceCount: 3, targetCount: 1 } },
        skipped: [],
        unmapped: [],
      }),
    );

    expect(rendered).toContain("MISMATCH");
    expect(rendered).toContain("do NOT reconcile");
  });
});

describe("MigrationLedger", () => {
  it("accumulates tallies, skips and deduplicated unmapped values", () => {
    const ledger = new MigrationLedger();

    ledger.tally("deals").sourceCount = 2;
    ledger.tally("deals").created += 1;
    ledger.tally("deals").targetCount += 1;
    ledger.skip({ entity: "deals", sourceId: "2", label: "Lost", reason: "no lost reason" });
    ledger.unmapped("activity.type", "call", "no home until M5");
    ledger.unmapped("activity.type", "call");

    const report = ledger.report({ dryRun: false, startedAt, finishedAt });

    expect(report.entities[0]).toMatchObject({ entity: "deals", sourceCount: 2, created: 1, skipped: 1 });
    expect(report.reconciled).toBe(true);
    expect(report.unmapped).toEqual([
      { kind: "activity.type", value: "call", occurrences: 2, detail: "no home until M5" },
    ]);
  });
});
