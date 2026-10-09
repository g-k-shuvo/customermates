import type { DryRunImportData } from "@/features/data-transfer/data-transfer.schema";
import type { PrecheckFn } from "@/core/validation/run-precheck";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";
import { runPrecheck } from "@/core/validation/run-precheck";

export type BulkWritePrecheck = {
  createMany: PrecheckFn<never>;
  updateMany: PrecheckFn<never>;
};

export abstract class BaseDryRunImportInteractor extends AuthenticatedInteractor<DryRunImportData, null> {
  constructor(
    private collectionKey: string,
    private createSchema: z.ZodType,
    private updateSchema: z.ZodType,
    private precheck: BulkWritePrecheck,
  ) {
    super();
  }

  async invoke(data: DryRunImportData): Validated<null> {
    const schema = data.mode === "create" ? this.createSchema : this.updateSchema;
    const context = await getZodParseContext();
    const parsed = await schema.safeParseAsync({ [this.collectionKey]: data.rows }, context);

    if (parsed.success) {
      const checked = await this.check(parsed.data, data.mode);
      return checked.ok ? { ok: true as const, data: null } : { ok: false as const, error: checked.error };
    }

    const failedRows = new Set(parsed.error.issues.map((issue) => this.rowIndexOf(issue.path)));
    const remaining = data.rows.map((row, index) => ({ row, index })).filter(({ index }) => !failedRows.has(index));
    if (remaining.length === 0) return { ok: false as const, error: parsed.error };

    const reparsed = await schema.safeParseAsync({ [this.collectionKey]: remaining.map(({ row }) => row) }, context);
    if (!reparsed.success) return { ok: false as const, error: parsed.error };

    const checked = await this.check(reparsed.data, data.mode);
    if (checked.ok) return { ok: false as const, error: parsed.error };

    const remapped = checked.error.issues.map((issue) => {
      const position = this.rowIndexOf(issue.path);
      if (position === undefined) return issue;
      return { ...issue, path: [this.collectionKey, remaining[position].index, ...issue.path.slice(2)] };
    });

    return { ok: false as const, error: new z.ZodError([...parsed.error.issues, ...remapped]) };
  }

  private check(value: unknown, mode: DryRunImportData["mode"]) {
    return runPrecheck(value, (parsedValue, ctx) =>
      mode === "create"
        ? this.precheck.createMany(parsedValue as never, ctx)
        : this.precheck.updateMany(parsedValue as never, ctx),
    );
  }

  private rowIndexOf(path: readonly PropertyKey[]): number | undefined {
    const [collection, index] = path;
    return collection === this.collectionKey && typeof index === "number" ? index : undefined;
  }
}
