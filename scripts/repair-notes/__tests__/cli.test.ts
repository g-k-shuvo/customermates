import { describe, expect, it } from "vitest";

import type { RepairOutcome, RepairRun } from "../repair-notes";

import { EXIT, UsageError, USAGE, exitCodeOf, parseArguments, renderRepair, runRepairNotes } from "../cli";
import { emptyRepair } from "../repair-notes";

const COMPANY_ID = "10000000-0000-4000-8000-000000000001";

function capture() {
  const lines = { out: "", err: "" };

  return {
    lines,
    output: {
      write: (text: string) => {
        lines.out += text;
      },
      error: (text: string) => {
        lines.err += text;
      },
    },
  };
}

function runWith(outcomes: Partial<Record<RepairOutcome, number>>, aborted: RepairRun["aborted"] = null): RepairRun {
  const contact = emptyRepair("Contact");
  Object.assign(contact.outcomes, outcomes);

  return { tables: [contact], aborted };
}

const APPLY_OPTIONS = parseArguments(["--apply"]);

describe("parseArguments", () => {
  it("defaults to a read-only census of every company", () => {
    expect(parseArguments([])).toEqual({
      mode: "census",
      history: "hold",
      companyId: undefined,
      batchSize: 200,
      reportPath: undefined,
      allowRemote: false,
      help: false,
    });
  });

  it("reads every option", () => {
    expect(
      parseArguments([
        "--apply",
        "--restore-from-audit",
        "--company",
        COMPANY_ID,
        "--batch-size=50",
        "--report",
        "out.json",
        "--allow-remote",
      ]),
    ).toEqual({
      mode: "apply",
      history: "restore",
      companyId: COMPANY_ID,
      batchSize: 50,
      reportPath: "out.json",
      allowRemote: true,
      help: false,
    });
  });

  it("holds recoverable rows back unless told to restore or discard them", () => {
    expect(parseArguments(["--apply"]).history).toBe("hold");
    expect(parseArguments(["--apply", "--discard-history"]).history).toBe("discard");
  });

  it("lower-cases the company id, which the database stores in lower case", () => {
    expect(parseArguments(["--company", "10000000-0000-4000-8000-00000000000A"]).companyId).toBe(
      "10000000-0000-4000-8000-00000000000a",
    );
  });

  it.each([
    [["--aply"], /Unknown argument "--aply"/],
    [["--restore-from-adit", "--apply"], /Unknown argument/],
    [["--census", "--apply"], /Choose one of --census and --apply/],
    [["--restore-from-audit"], /only take effect with --apply/],
    [["--discard-history"], /only take effect with --apply/],
    [["--apply", "--restore-from-audit", "--discard-history"], /Choose one of --restore-from-audit/],
    [["--company", "acme"], /company id/],
    [["--company"], /needs a value/],
    [["--batch-size", "0"], /positive integer/],
    [["--batch-size", "--apply"], /needs a value/],
    [["--apply=yes"], /Unknown argument/],
    [["apply"], /Unknown argument/],
  ])("refuses %j", (argv, message) => {
    expect(() => parseArguments(argv)).toThrow(UsageError);
    expect(() => parseArguments(argv)).toThrow(message);
  });
});

describe("exitCodeOf", () => {
  it.each([
    ["a clean run", {}, null, EXIT.done],
    ["unreadable rows alone", { converted: 3, unreadable: 2 }, null, EXIT.done],
    ["rows changed meanwhile", { converted: 3, changed: 1 }, null, EXIT.retry],
    ["locked rows", { locked: 1, held: 2 }, null, EXIT.retry],
    ["held rows", { converted: 1, held: 2 }, null, EXIT.decide],
    ["an aborted run", { converted: 1 }, { table: "Deal" as const, message: "boom" }, EXIT.failed],
  ])("returns the right status for %s", (_, outcomes, aborted, code) => {
    expect(exitCodeOf(runWith(outcomes, aborted))).toBe(code);
  });
});

describe("renderRepair", () => {
  it("tells the operator how to decide about held rows", () => {
    const text = renderRepair(runWith({ converted: 2, held: 3 }), APPLY_OPTIONS);

    expect(text).toContain("3 row(s) held back");
    expect(text).toContain("--restore-from-audit");
    expect(text).toContain("--discard-history");
  });

  it("asks for a re-run when rows changed meanwhile or were locked", () => {
    expect(renderRepair(runWith({ changed: 1, locked: 2 }), APPLY_OPTIONS)).toContain(
      "3 row(s) changed meanwhile or locked by the app; run again",
    );
  });

  it("names the recoverable rows it converted without restoring", () => {
    const run = runWith({ converted: 2 });
    run.tables[0].discarded = 2;

    expect(renderRepair(run, parseArguments(["--apply", "--discard-history"]))).toContain(
      "2 recoverable row(s) converted without restoring",
    );
  });

  it("still prints what committed when the run aborted, and which tables it never reached", () => {
    const text = renderRepair(runWith({ converted: 4 }, { table: "Contact", message: "boom" }), APPLY_OPTIONS);

    expect(text).toMatch(/^Contact\s+4\s/mu);
    expect(text).toContain("ABORTED in Contact: boom");
    expect(text).toContain("Tables not reached: Deal, Organization, Lead, Task, Service");
  });
});

describe("runRepairNotes", () => {
  it("prints the usage", async () => {
    const { lines, output } = capture();

    await expect(runRepairNotes(["--help"], {}, output)).resolves.toBe(EXIT.done);
    expect(lines.out).toBe(USAGE);
  });

  it("rejects a typo before touching any database", async () => {
    const { lines, output } = capture();

    await expect(runRepairNotes(["--aply"], { DATABASE_URL: "postgresql://x@127.0.0.1:1/x" }, output)).resolves.toBe(
      EXIT.usage,
    );
    expect(lines.out).toBe("");
    expect(lines.err).toContain('Unknown argument "--aply"');
  });

  it("names the remote database it refuses before connecting to it", async () => {
    const { lines, output } = capture();

    await expect(
      runRepairNotes(["--apply"], { DATABASE_URL: "postgresql://crm:secret@db.example.invalid:5432/crm" }, output),
    ).resolves.toBe(EXIT.failed);
    expect(lines.out).toBe("Datasource: db.example.invalid:5432/crm (from DATABASE_URL, remote)\n");
    expect(lines.err).toContain("Refusing to run against a non-local database");
    expect(lines.err).not.toContain("secret");
  });

  it("refuses to run while a libpq routing variable is set", async () => {
    const { lines, output } = capture();

    await expect(
      runRepairNotes(["--census"], { DATABASE_URL: "postgresql://x@127.0.0.1/x", PGPORT: "37987" }, output),
    ).resolves.toBe(EXIT.failed);
    expect(lines.err).toContain("PGPORT must be unset");
  });
});
