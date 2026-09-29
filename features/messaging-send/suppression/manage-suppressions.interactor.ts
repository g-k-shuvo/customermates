import type { Data, Validated } from "@/core/validation/validation.utils";
import type { SuppressionRepo } from "./suppression.repo";

import { z } from "zod";
import { Action, Resource, SuppressionReason } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const SUPPRESSION_PAGE_SIZE = 50;

const SUPPRESSION_READ = {
  permissions: [
    { resource: Resource.company, action: Action.readAll },
    { resource: Resource.company, action: Action.readOwn },
  ],
  condition: "OR" as const,
};
const SUPPRESSION_WRITE = { resource: Resource.company, action: Action.update };

export const SuppressionDtoSchema = z.object({
  id: z.uuid(),
  address: z.string(),
  reason: z.enum(SuppressionReason),
  note: z.string().nullable(),
  createdAt: z.date(),
});
export type SuppressionDto = Data<typeof SuppressionDtoSchema>;

export const GetSuppressionsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type GetSuppressionsData = Data<typeof GetSuppressionsSchema>;

export const SuppressionListDtoSchema = z.object({
  items: z.array(SuppressionDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type SuppressionListDto = Data<typeof SuppressionListDtoSchema>;

export const AddSuppressionSchema = z.object({
  address: z.email(),
  note: z.string().trim().max(500).nullish(),
});
export type AddSuppressionData = Data<typeof AddSuppressionSchema>;

export const SuppressionIdSchema = z.object({ id: z.uuid() });
export type SuppressionIdData = Data<typeof SuppressionIdSchema>;

@TenantInteractor(SUPPRESSION_READ)
export class GetSuppressionsInteractor extends AuthenticatedInteractor<GetSuppressionsData, SuppressionListDto> {
  constructor(private repo: SuppressionRepo) {
    super();
  }

  @Validate(GetSuppressionsSchema)
  @ValidateOutput(SuppressionListDtoSchema)
  async invoke(data: GetSuppressionsData): Validated<SuppressionListDto> {
    const page = data.page ?? 1;
    const { items, total } = await this.repo.listSuppressions({
      search: data.search || null,
      skip: (page - 1) * SUPPRESSION_PAGE_SIZE,
      take: SUPPRESSION_PAGE_SIZE,
    });

    return { ok: true as const, data: { items, total, page, pageSize: SUPPRESSION_PAGE_SIZE } };
  }
}

@TenantInteractor(SUPPRESSION_WRITE)
export class AddSuppressionInteractor extends AuthenticatedInteractor<AddSuppressionData, SuppressionDto> {
  constructor(private repo: SuppressionRepo) {
    super();
  }

  @Write({ input: AddSuppressionSchema, output: SuppressionDtoSchema })
  async invoke(data: AddSuppressionData): Validated<SuppressionDto> {
    return {
      ok: true as const,
      data: await this.repo.addSuppressionOrThrow({
        address: data.address,
        reason: SuppressionReason.manual,
        note: data.note ?? null,
      }),
    };
  }
}

@TenantInteractor(SUPPRESSION_WRITE)
export class RemoveSuppressionInteractor extends AuthenticatedInteractor<SuppressionIdData, { id: string }> {
  constructor(private repo: SuppressionRepo) {
    super();
  }

  @Write({ input: SuppressionIdSchema, output: z.object({ id: z.uuid() }) })
  async invoke({ id }: SuppressionIdData): Validated<{ id: string }> {
    if (!(await this.repo.removeSuppression(id))) return failNotFound(CustomErrorCode.suppressionNotFound, ["id"]);

    return { ok: true as const, data: { id } };
  }
}
