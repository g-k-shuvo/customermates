import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";
import { UpsertRoleSchema } from "@/features/role/upsert-role.interactor";

const REPO_ROOT = join(__dirname, "..", "..");
const MODAL = join(REPO_ROOT, "app", "[locale]", "(protected)", "company", "components", "role", "role-modal.tsx");

const RESOURCES = Object.values(Resource).toSorted();

function renderedResources(): string[] {
  const source = ts.createSourceFile(MODAL, readFileSync(MODAL, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "renderResourcePermissions"
    ) {
      const [argument] = node.arguments;
      if (
        argument &&
        ts.isPropertyAccessExpression(argument) &&
        ts.isIdentifier(argument.expression) &&
        argument.expression.text === "Resource"
      )
        found.push(argument.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found.toSorted();
}

describe("role resource coverage", () => {
  it("validates a permission block for every resource", () => {
    const shape = Object.keys(UpsertRoleSchema.shape.permissions.shape).toSorted();

    expect(shape).toEqual(RESOURCES);
  });

  it("renders a permission row for every resource", () => {
    expect(renderedResources()).toEqual(RESOURCES);
  });
});
