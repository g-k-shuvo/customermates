import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { walkFiles } from "./walk";

const REPO_ROOT = join(__dirname, "..", "..");

const GUARDED_DIRECTORIES = ["features/event", "features/automation"];

function valueImportsFromEe(contents: string): string[] {
  return [...contents.matchAll(/^import\s+(?!type\b)([^;]*?)from\s+"(@\/ee\/[^"]+)";/gm)].map(([, , source]) =>
    String(source),
  );
}

function guardedFiles(directory: string): string[] {
  return walkFiles(
    join(REPO_ROOT, ...directory.split("/")),
    (path) => /\.tsx?$/.test(path) && !path.includes(`${sep}__tests__${sep}`) && !path.includes(".test."),
  );
}

describe("the agpl dispatch boundary", () => {
  it("keeps event dispatch and automations free of runtime imports from ee", () => {
    const offenders = GUARDED_DIRECTORIES.flatMap((directory) =>
      guardedFiles(directory).flatMap((path) =>
        valueImportsFromEe(readFileSync(path, "utf8")).map(
          (source) => `${relative(REPO_ROOT, path).split(sep).join("/")} imports ${source}`,
        ),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("still allows type-only imports, which carry no proprietary code", () => {
    expect(valueImportsFromEe('import type { Thing } from "@/ee/routines/thing";')).toEqual([]);
    expect(valueImportsFromEe('import { thing } from "@/ee/routines/thing";')).toEqual(["@/ee/routines/thing"]);
  });
});
