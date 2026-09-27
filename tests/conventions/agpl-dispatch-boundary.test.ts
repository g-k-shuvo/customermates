import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { walkFiles } from "./walk";

const REPO_ROOT = join(__dirname, "..", "..");
const EE_ROOT = join(REPO_ROOT, "ee");

const GUARDED_DIRECTORIES = ["features/event", "features/automation"];

function reachesEe(specifier: string, fromFile: string): boolean {
  if (specifier === "@/ee" || specifier.startsWith("@/ee/")) return true;
  if (!specifier.startsWith(".")) return false;

  const target = resolve(dirname(fromFile), specifier);

  return target === EE_ROOT || target.startsWith(EE_ROOT + sep);
}

function literalText(node: ts.Node | undefined): string | null {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  if (node && ts.isTemplateExpression(node)) return node.head.text;

  return null;
}

function runtimeSpecifiers(source: ts.SourceFile): string[] {
  const found: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) found.push(specifier);
    }

    if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) found.push(specifier);
    }

    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = literalText(node.moduleReference.expression);
      if (specifier !== null) found.push(specifier);
    }

    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const specifier = isDynamicImport || isRequire ? literalText(node.arguments[0]) : null;
      if (specifier !== null) found.push(specifier);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

function eeRuntimeImports(path: string, contents: string): string[] {
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);

  return runtimeSpecifiers(source).filter((specifier) => reachesEe(specifier, path));
}

function guardedFiles(directory: string): string[] {
  return walkFiles(
    join(REPO_ROOT, ...directory.split("/")),
    (path) => /\.tsx?$/.test(path) && !path.includes(`${sep}__tests__${sep}`) && !path.includes(".test."),
  );
}

const PROBE = join(REPO_ROOT, "features", "event", "probe.ts");

describe("the agpl dispatch boundary", () => {
  it("keeps event dispatch and automations free of runtime imports from ee", () => {
    const files = GUARDED_DIRECTORIES.flatMap((directory) => guardedFiles(directory));
    const offenders = files.flatMap((path) =>
      eeRuntimeImports(path, readFileSync(path, "utf8")).map(
        (source) => `${relative(REPO_ROOT, path).split(sep).join("/")} imports ${source}`,
      ),
    );

    expect(files.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  it("still allows type-only imports and re-exports, which carry no proprietary code", () => {
    expect(eeRuntimeImports(PROBE, 'import type { Thing } from "@/ee/routines/thing";')).toEqual([]);
    expect(eeRuntimeImports(PROBE, 'export type { Thing } from "@/ee/routines/thing";')).toEqual([]);
    expect(eeRuntimeImports(PROBE, 'import type { Thing } from "../../ee/routines/thing";')).toEqual([]);
    expect(eeRuntimeImports(PROBE, 'import { thing } from "@/features/eel/thing";')).toEqual([]);
    expect(eeRuntimeImports(PROBE, 'import { thing } from "./ee-helpers";')).toEqual([]);
  });

  it("catches every way of pulling ee code in at runtime", () => {
    expect(eeRuntimeImports(PROBE, 'import { thing } from "@/ee/routines/thing";')).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, 'import { type Thing, thing } from "@/ee/routines/thing";')).toEqual([
      "@/ee/routines/thing",
    ]);
    expect(eeRuntimeImports(PROBE, 'import "@/ee/routines/side-effect";')).toEqual(["@/ee/routines/side-effect"]);
    expect(eeRuntimeImports(PROBE, "import {\n  thing,\n} from '@/ee/routines/thing';")).toEqual([
      "@/ee/routines/thing",
    ]);
    expect(eeRuntimeImports(PROBE, 'export { thing } from "@/ee/routines/thing";')).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, 'export * from "@/ee/routines/thing";')).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, 'const m = await import("@/ee/routines/thing");')).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, "const m = await import(`@/ee/routines/thing`);")).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, "const m = await import(`@/ee/routines/${name}`);")).toEqual(["@/ee/routines/"]);
    expect(eeRuntimeImports(PROBE, 'const m = require("@/ee/routines/thing");')).toEqual(["@/ee/routines/thing"]);
    expect(eeRuntimeImports(PROBE, 'import { thing } from "../../ee/routines/thing";')).toEqual([
      "../../ee/routines/thing",
    ]);
    expect(eeRuntimeImports(PROBE, 'export { thing } from "../../ee/routines/thing";')).toEqual([
      "../../ee/routines/thing",
    ]);
    expect(eeRuntimeImports(PROBE, 'const m = await import("../../ee/routines/thing");')).toEqual([
      "../../ee/routines/thing",
    ]);
  });
});
