import type { ImportKeyColumn, ImportKeyMatch } from "../data-transfer.schema";
import type { MessagingProvider, Prisma } from "@/generated/prisma";

import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { channelClass } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

type KeyModel = "contact" | "organization" | "deal" | "service" | "task";

type KeyedRow = { id: string } & Record<string, unknown>;

const KEY_MODEL: Record<EntityType, KeyModel> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
};

function valuesByComparable(values: string[]): Map<string, string[]> {
  const byComparable = new Map<string, string[]>();

  for (const value of values) {
    const comparable = value.toLocaleLowerCase();
    byComparable.set(comparable, [...(byComparable.get(comparable) ?? []), value]);
  }

  return byComparable;
}

export class ImportKeyMatcher extends BaseRepository {
  async match(entityType: EntityType, key: ImportKeyColumn, values: string[]): Promise<ImportKeyMatch[]> {
    const found =
      key.kind === "identifier"
        ? await this.matchIdentifiers(key.provider, values)
        : key.kind === "customField"
          ? await this.matchCustomField(entityType, key.columnId, values)
          : await this.matchField(entityType, key.key, values);

    return [...found.entries()].map(([value, ids]) => [value, [...new Set(ids)]] as ImportKeyMatch);
  }

  private async matchField(entityType: EntityType, field: string, values: string[]): Promise<Map<string, string[]>> {
    const model = KEY_MODEL[entityType];
    const where = { ...this.accessWhere(model), [field]: { in: values, mode: "insensitive" } };
    const rows = await this.findKeyedRows(model, where, field);

    return this.group(
      values,
      rows.map((row) => [String(row[field] ?? ""), row.id] as const),
    );
  }

  private async matchIdentifiers(provider: MessagingProvider, values: string[]): Promise<Map<string, string[]>> {
    const byNormalized = new Map<string, string[]>();

    for (const value of values) {
      const normalized = normalizeChannelValue(provider, value);
      if (normalized) byNormalized.set(normalized, [...(byNormalized.get(normalized) ?? []), value]);
    }

    if (byNormalized.size === 0) return new Map();

    const rows = await this.prisma.contactIdentifier.findMany({
      where: {
        companyId: this.companyId,
        channelClass: channelClass(provider),
        value: { in: [...byNormalized.keys()] },
        contact: this.accessWhere("contact"),
      },
      select: { value: true, contactId: true },
    });

    const matches = new Map<string, string[]>();

    for (const row of rows) {
      for (const value of byNormalized.get(row.value) ?? [])
        matches.set(value, [...(matches.get(value) ?? []), row.contactId]);
    }

    return matches;
  }

  private async matchCustomField(
    entityType: EntityType,
    columnId: string,
    values: string[],
  ): Promise<Map<string, string[]>> {
    const rows = await this.prisma.customFieldValue.findMany({
      where: {
        companyId: this.companyId,
        entityType,
        columnId,
        value: { in: values, mode: "insensitive" },
        ...this.ownerAccessWhere(entityType),
      },
      select: {
        value: true,
        contactId: true,
        organizationId: true,
        dealId: true,
        serviceId: true,
        taskId: true,
      },
    });

    const ownerOf = (row: (typeof rows)[number]) => {
      if (entityType === EntityType.contact) return row.contactId;
      if (entityType === EntityType.organization) return row.organizationId;
      if (entityType === EntityType.deal) return row.dealId;
      if (entityType === EntityType.service) return row.serviceId;

      return row.taskId;
    };

    return this.group(
      values,
      rows.flatMap((row) => {
        const owner = ownerOf(row);

        return owner ? [[row.value ?? "", owner] as const] : [];
      }),
    );
  }

  private ownerAccessWhere(entityType: EntityType): Prisma.CustomFieldValueWhereInput {
    switch (entityType) {
      case EntityType.contact:
        return { contact: this.accessWhere("contact") };
      case EntityType.organization:
        return { organization: this.accessWhere("organization") };
      case EntityType.deal:
        return { deal: this.accessWhere("deal") };
      case EntityType.service:
        return { service: this.accessWhere("service") };
      case EntityType.task:
        return { task: this.accessWhere("task") };
    }
  }

  private group(values: string[], pairs: ReadonlyArray<readonly [string, string]>): Map<string, string[]> {
    const byComparable = valuesByComparable(values);
    const matches = new Map<string, string[]>();

    for (const [stored, id] of pairs) {
      for (const value of byComparable.get(stored.toLocaleLowerCase()) ?? [])
        matches.set(value, [...(matches.get(value) ?? []), id]);
    }

    return matches;
  }

  private findKeyedRows(model: KeyModel, where: unknown, field: string): Promise<KeyedRow[]> {
    const delegate = (this.prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>)[
      model
    ];

    return delegate.findMany({ where, select: { id: true, [field]: true } }) as Promise<KeyedRow[]>;
  }
}
