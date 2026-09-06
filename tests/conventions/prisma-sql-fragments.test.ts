import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

// Prisma.sql builds a fragment whose class identity must match the one the client's $queryRaw
// splices against. Next bundles the generated client separately per server layer, and
// prisma/db.ts caches a single instance on `global` outside production, so in development a
// client from one layer meets fragments from another. `instanceof Sql` then fails, the fragment
// is bound as a query parameter instead of being spliced, and Postgres rejects the statement
// (22P02 for a boolean predicate, 42601 for anything else).
//
// Compose raw SQL with plain strings for the code-controlled parts and pass every value as a
// positional parameter through $queryRawUnsafe instead. See
// features/widget/calculator/widget-data-fetcher.service.ts for the pattern.

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee", "core", "workflows", "i18n"];
const BANNED_MEMBERS = new Set(["sql", "empty", "join", "raw"]);

type Offence = { file: string; line: number; member: string };

function isPrismaNamespace(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === "Prisma";
}

function offencesIn(file: string): Offence[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Offence[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      isPrismaNamespace(node.expression) &&
      BANNED_MEMBERS.has(node.name.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ file: relative(REPO_ROOT, file), line: line + 1, member: node.name.text });
    }
    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

describe("prisma sql fragments", () => {
  it("never builds a Prisma.Sql fragment in application code", () => {
    const files = SCANNED_DIRECTORIES.flatMap((directory) =>
      walkFiles(join(REPO_ROOT, directory), (path) => /\.tsx?$/.test(path) && !path.includes("__tests__")),
    );

    const offences = files.flatMap(offencesIn);

    expect(offences).toEqual([]);
  }, 60_000);

  it("detects every banned member so the sweep above cannot pass vacuously", () => {
    const source = ts.createSourceFile(
      "sample.ts",
      [
        "const a = Prisma.sql`TRUE`;",
        "const b = Prisma.empty;",
        "const c = Prisma.join([a]);",
        "const d = Prisma.raw('1');",
        "const e = Prisma.DealWhereInput;",
      ].join("\n"),
      ts.ScriptTarget.Latest,
      true,
    );

    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        isPrismaNamespace(node.expression) &&
        BANNED_MEMBERS.has(node.name.text)
      )
        found.push(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(found).toEqual(["sql", "empty", "join", "raw"]);
  });
});
