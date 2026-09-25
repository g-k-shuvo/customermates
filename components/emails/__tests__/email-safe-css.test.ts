import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const EMAIL_ROOT = path.resolve(__dirname, "..");

const UNSUPPORTED_UTILITIES = [
  "inline-flex",
  "flex-col",
  "flex-row",
  "items-center",
  "items-start",
  "items-end",
  "justify-center",
  "justify-between",
  "grid-cols",
];

function emailComponentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) return entry === "__tests__" ? [] : emailComponentFiles(absolute);

    return absolute.endsWith(".tsx") ? [absolute] : [];
  });
}

describe("email safe css", () => {
  it("uses no flexbox or grid utilities, which email clients strip", () => {
    const offenders = emailComponentFiles(EMAIL_ROOT).flatMap((file) => {
      const source = readFileSync(file, "utf8");

      return UNSUPPORTED_UTILITIES.filter((utility) =>
        new RegExp(`(^|[\\s"'\`])${utility}($|[\\s"'\`-])`).test(source),
      ).map((utility) => `${path.relative(EMAIL_ROOT, file)} uses "${utility}"`);
    });

    expect(
      offenders,
      "Outlook and Gmail drop flexbox and grid, so a button sized this way collapses and its label will not centre. Use padding, display inline-block and line-height instead.",
    ).toEqual([]);
  });
});
