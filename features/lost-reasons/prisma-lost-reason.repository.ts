import type { RepoArgs } from "@/core/utils/types";
import type { FindLostReasonsByIdsRepo } from "./find-lost-reasons-by-ids.repo";
import type { GetLostReasonsRepo } from "./get/get-lost-reasons.interactor";
import type { GetLostReasonByIdRepo } from "./get/get-lost-reason-by-id.interactor";
import type { CreateLostReasonRepo } from "./upsert/create-lost-reason.repo";
import type { UpdateLostReasonRepo } from "./upsert/update-lost-reason.repo";
import type { DeleteLostReasonRepo } from "./delete/delete-lost-reason.repo";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";

export class PrismaLostReasonRepo
  extends BaseRepository
  implements
    FindLostReasonsByIdsRepo,
    GetLostReasonsRepo,
    GetLostReasonByIdRepo,
    CreateLostReasonRepo,
    UpdateLostReasonRepo,
    DeleteLostReasonRepo
{
  private get lostReasonSelect() {
    return {
      id: true,
      name: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  async getLostReasons() {
    const { companyId } = this.user;

    return this.prisma.lostReason.findMany({
      where: { companyId },
      select: this.lostReasonSelect,
      orderBy: { position: "asc" },
    });
  }

  async getLostReasonById(id: string) {
    const { companyId } = this.user;

    return this.prisma.lostReason.findFirst({
      where: { id, companyId },
      select: this.lostReasonSelect,
    });
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const lostReasons = await this.prisma.lostReason.findMany({
      where: { id: { in: [...ids] }, companyId },
      select: { id: true },
    });

    return new Set(lostReasons.map((lostReason) => lostReason.id));
  }

  @Transaction
  async createLostReasonOrThrow(args: RepoArgs<CreateLostReasonRepo, "createLostReasonOrThrow">) {
    const { companyId } = this.user;

    const created = await this.prisma.lostReason.create({
      data: { companyId, name: args.name, position: args.position },
      select: { id: true },
    });

    return this.prisma.lostReason.findFirstOrThrow({
      where: { id: created.id, companyId },
      select: this.lostReasonSelect,
    });
  }

  @Transaction
  async updateLostReasonOrThrow(args: RepoArgs<UpdateLostReasonRepo, "updateLostReasonOrThrow">) {
    const { companyId } = this.user;
    const { id, ...fields } = args;

    const data: Prisma.LostReasonUncheckedUpdateManyInput = {};

    if (fields.name !== undefined) data.name = fields.name;
    if (fields.position !== undefined) data.position = fields.position;
    if (fields.archivedAt !== undefined) data.archivedAt = fields.archivedAt;

    await this.prisma.lostReason.updateMany({ where: { id, companyId }, data });

    return this.prisma.lostReason.findFirstOrThrow({ where: { id, companyId }, select: this.lostReasonSelect });
  }

  @Transaction
  async deleteLostReasonOrThrow(id: string) {
    const { companyId } = this.user;

    const lostReason = await this.prisma.lostReason.findFirstOrThrow({
      where: { id, companyId },
      select: this.lostReasonSelect,
    });

    await this.prisma.lostReason.deleteMany({ where: { id, companyId } });

    return lostReason;
  }

  async countDealsWithLostReason(lostReasonId: string) {
    const { companyId } = this.user;

    return this.prisma.deal.count({ where: { companyId, lostReasonId } });
  }
}
