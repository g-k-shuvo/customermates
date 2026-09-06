import type { DiagramDataPoint } from "../widget.schema";
import type {
  WidgetForCalculation,
  DealRecord,
  GroupAccumulator,
  EntityForGrouping,
  GroupedDealAggregate,
  PipelinePosition,
  WinRateRow,
  DurationRow,
} from "./widget-calculator.types";
import type { ChipColor } from "@/constants/chip-colors";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { getCustomColumnRepo } from "@/core/di";
import { BaseRepository } from "@/core/base/base-repository";
import { winRatePercent } from "../widget-metrics";

function winRateMetrics(row: WinRateRow) {
  return {
    wonCount: row.wonCount,
    lostCount: row.lostCount,
    wonValue: row.wonValue,
    lostValue: row.lostValue,
    sampleSize: row.wonCount + row.lostCount,
  };
}

function durationMetrics(row: DurationRow) {
  return { mean: row.meanDays, median: row.medianDays, sampleSize: row.sampleSize };
}

export class WidgetGroupingService extends BaseRepository {
  groupDealsByEntityType(widget: WidgetForCalculation, deals: DealRecord[]): DiagramDataPoint[] {
    const { groupByType, aggregationType } = widget;
    const acc: GroupAccumulator = new Map();

    switch (groupByType) {
      case WidgetGroupByType.contact:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const contacts = deal.contacts ?? [];
          if (contacts.length === 0) {
            const existing = acc.get("no-group");
            acc.set("no-group", {
              labelKind: "system",
              systemLabelKey: "noGroup",
              value: (existing?.value ?? 0) + dealValue,
            });
          } else {
            contacts.forEach((contact) => {
              const label =
                `${contact.contact.firstName ?? ""} ${contact.contact.lastName ?? ""}`.trim() || contact.contact.id;
              const existing = acc.get(contact.contact.id);
              acc.set(contact.contact.id, { labelKind: "literal", label, value: (existing?.value ?? 0) + dealValue });
            });
          }
        }
        break;

      case WidgetGroupByType.organization:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const organizations = deal.organizations ?? [];
          if (organizations.length === 0) {
            const existing = acc.get("no-group");
            acc.set("no-group", {
              labelKind: "system",
              systemLabelKey: "noGroup",
              value: (existing?.value ?? 0) + dealValue,
            });
          } else {
            organizations.forEach((organization) => {
              const label = organization.organization.name || organization.organization.id;
              const existing = acc.get(organization.organization.id);
              acc.set(organization.organization.id, {
                labelKind: "literal",
                label,
                value: (existing?.value ?? 0) + dealValue,
              });
            });
          }
        }
        break;

      case WidgetGroupByType.deal:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const label = deal.name || deal.id;
          const existing = acc.get(deal.id);
          acc.set(deal.id, { labelKind: "literal", label, value: (existing?.value ?? 0) + dealValue });
        }
        break;

      case WidgetGroupByType.service:
        for (const deal of deals) {
          for (const service of deal.services ?? []) {
            const serviceValue = this.getServiceValue(service, aggregationType);
            const label = service.service.name || service.service.id;
            const existing = acc.get(service.service.id);
            acc.set(service.service.id, {
              labelKind: "literal",
              label,
              value: (existing?.value ?? 0) + serviceValue,
            });
          }
        }
        break;

      case WidgetGroupByType.dealStage:
      case WidgetGroupByType.dealPipeline:
      case WidgetGroupByType.customColumn:
      case WidgetGroupByType.none:
        break;

      default: {
        const exhaustive: never = groupByType;
        return exhaustive;
      }
    }

    return Array.from(acc.values());
  }

  private getDealValue(
    deal: { totalValue: number; totalQuantity: number; weightedValue?: number | null },
    aggregationType: AggregationType,
  ): number {
    switch (aggregationType) {
      case AggregationType.dealValue:
        return deal.totalValue;
      case AggregationType.dealQuantity:
        return deal.totalQuantity;
      case AggregationType.dealWeightedValue:
        return deal.weightedValue ?? 0;
      case AggregationType.count:
      case AggregationType.winRate:
      case AggregationType.salesCycleDays:
      case AggregationType.stageDurationDays:
        return 0;
      default: {
        const exhaustive: never = aggregationType;
        return exhaustive;
      }
    }
  }

  private getServiceValue(
    service: { service: { amount: number }; quantity: number },
    aggregationType: AggregationType,
  ): number {
    switch (aggregationType) {
      case AggregationType.dealValue:
        return service.service.amount * service.quantity;
      case AggregationType.dealQuantity:
        return service.quantity;
      case AggregationType.count:
      case AggregationType.dealWeightedValue:
      case AggregationType.winRate:
      case AggregationType.salesCycleDays:
      case AggregationType.stageDurationDays:
        return 0;
      default: {
        const exhaustive: never = aggregationType;
        return exhaustive;
      }
    }
  }

  buildPipelinePositionPoints(
    aggregates: GroupedDealAggregate[],
    positions: PipelinePosition[],
    aggregationType: AggregationType,
  ): DiagramDataPoint[] {
    const byKey = new Map(aggregates.map((aggregate) => [aggregate.key ?? "", aggregate]));
    const points: DiagramDataPoint[] = [];

    for (const position of positions) {
      const aggregate = byKey.get(position.id);
      if (!aggregate) continue;

      points.push({
        labelKind: "literal",
        label: position.name || position.id,
        value: this.getAggregateValue(aggregate, aggregationType),
      });
    }

    const ungrouped = aggregates.filter(
      (aggregate) => !aggregate.key || !positions.some((p) => p.id === aggregate.key),
    );
    const ungroupedValue = ungrouped.reduce(
      (sum, aggregate) => sum + this.getAggregateValue(aggregate, aggregationType),
      0,
    );

    if (ungrouped.length > 0) points.push({ labelKind: "system", systemLabelKey: "noGroup", value: ungroupedValue });

    return points;
  }

  private getAggregateValue(aggregate: GroupedDealAggregate, aggregationType: AggregationType): number {
    switch (aggregationType) {
      case AggregationType.count:
        return aggregate.count;
      case AggregationType.dealValue:
        return aggregate.totalValue;
      case AggregationType.dealQuantity:
        return aggregate.totalQuantity;
      case AggregationType.dealWeightedValue:
        return aggregate.weightedValue;
      case AggregationType.winRate:
      case AggregationType.salesCycleDays:
      case AggregationType.stageDurationDays:
        return 0;
      default: {
        const exhaustive: never = aggregationType;
        return exhaustive;
      }
    }
  }

  buildWinRatePoints(rows: WinRateRow[], positions: PipelinePosition[], grouped: boolean): DiagramDataPoint[] {
    if (!grouped) {
      const row = rows[0];
      if (!row) return [];

      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: winRatePercent(row.wonCount, row.lostCount) ?? 0,
          metrics: winRateMetrics(row),
        },
      ];
    }

    const byKey = new Map(rows.map((row) => [row.key ?? "", row]));
    const points: DiagramDataPoint[] = [];

    for (const position of positions) {
      const row = byKey.get(position.id);
      if (!row) continue;

      points.push({
        labelKind: "literal",
        label: position.name || position.id,
        value: winRatePercent(row.wonCount, row.lostCount) ?? 0,
        metrics: winRateMetrics(row),
      });
    }

    return points;
  }

  buildDurationPoints(rows: DurationRow[], positions: PipelinePosition[], grouped: boolean): DiagramDataPoint[] {
    const groupRows = rows.filter((row) => !row.isTotal);

    if (!grouped) {
      const row = rows.find((candidate) => candidate.isTotal) ?? groupRows[0];
      if (!row || row.sampleSize === 0) return [];

      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: row.meanDays ?? 0,
          metrics: durationMetrics(row),
        },
      ];
    }

    const byKey = new Map(groupRows.map((row) => [row.key ?? "", row]));
    const points: DiagramDataPoint[] = [];

    for (const position of positions) {
      const row = byKey.get(position.id);
      if (!row || row.sampleSize === 0) continue;

      points.push({
        labelKind: "literal",
        label: position.name || position.id,
        value: row.meanDays ?? 0,
        metrics: durationMetrics(row),
      });
    }

    return points;
  }

  async groupDealsByCustomColumn(widget: WidgetForCalculation, deals: DealRecord[]): Promise<DiagramDataPoint[]> {
    const { groupByCustomColumnId, entityType, aggregationType } = widget;

    if (!groupByCustomColumnId) return [];

    const customColumn = await getCustomColumnRepo().findById(groupByCustomColumnId);
    if (!customColumn || customColumn.type !== "singleSelect") return [];

    const optionsMap = this.buildOptionsMap(customColumn);

    const items: Array<{ id: string; value: number }> = [];

    switch (entityType) {
      case EntityType.contact: {
        const contactIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.contacts ?? []).forEach((contact) => contactIds.add(contact.contact.id));
        });

        const valueByContactId = await getCustomColumnRepo().findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.contact,
          Array.from(contactIds),
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          (deal.contacts ?? []).forEach((contact) => {
            items.push({ id: contact.contact.id, value: dealValue });
          });
        }

        return this.accumulateCustomColumnValues(items, valueByContactId, optionsMap);
      }

      case EntityType.organization: {
        const organizationIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.organizations ?? []).forEach((organization) => organizationIds.add(organization.organization.id));
        });

        const valueByOrganizationId = await getCustomColumnRepo().findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.organization,
          Array.from(organizationIds),
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          (deal.organizations ?? []).forEach((organization) => {
            items.push({ id: organization.organization.id, value: dealValue });
          });
        }

        return this.accumulateCustomColumnValues(items, valueByOrganizationId, optionsMap);
      }

      case EntityType.deal: {
        const dealIds = deals.map((deal) => deal.id);

        const valueByDealId = await getCustomColumnRepo().findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.deal,
          dealIds,
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          items.push({ id: deal.id, value: dealValue });
        }

        return this.accumulateCustomColumnValues(items, valueByDealId, optionsMap);
      }

      case EntityType.service: {
        const serviceIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.services ?? []).forEach((service) => {
            serviceIds.add(service.service.id);
            const serviceValue = this.getServiceValue(service, aggregationType);
            items.push({ id: service.service.id, value: serviceValue });
          });
        });

        const valueByServiceId = await getCustomColumnRepo().findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.service,
          Array.from(serviceIds),
        );

        return this.accumulateCustomColumnValues(items, valueByServiceId, optionsMap);
      }

      case EntityType.task: {
        return [];
      }
    }
  }

  private accumulateCustomColumnValues(
    items: Array<{ id: string; value: number }>,
    valueById: Map<string, string>,
    optionsMap: Map<string, { label: string; color: ChipColor }>,
  ): DiagramDataPoint[] {
    const acc: GroupAccumulator = new Map();

    for (const item of items) {
      const customValueId = valueById.get(item.id);
      if (!customValueId) {
        const existing = acc.get("no-group");
        acc.set("no-group", {
          labelKind: "system",
          systemLabelKey: "noGroup",
          value: (existing?.value ?? 0) + item.value,
        });
        continue;
      }

      const option = optionsMap.get(customValueId);
      const label = option?.label ?? customValueId;
      const existing = acc.get(customValueId);
      acc.set(customValueId, {
        labelKind: "literal",
        label,
        value: (existing?.value ?? 0) + item.value,
        optionColor: option?.color,
      });
    }

    return Array.from(acc.values());
  }

  buildCustomColumnPoints(
    counts: Array<{ value: string | null; count: number }>,
    customColumn: {
      type: "singleSelect";
      options: { options: Array<{ value: string; label: string; color: ChipColor }> };
    },
  ): DiagramDataPoint[] {
    const optionsMap = this.buildOptionsMap(customColumn);
    const acc: GroupAccumulator = new Map();

    for (const { value, count } of counts) {
      if (!value) {
        const existing = acc.get("no-group");
        acc.set("no-group", {
          labelKind: "system",
          systemLabelKey: "noGroup",
          value: (existing?.value ?? 0) + count,
        });
        continue;
      }

      const option = optionsMap.get(value);
      const existing = acc.get(value);
      acc.set(value, {
        labelKind: "literal",
        label: option?.label ?? value,
        value: (existing?.value ?? 0) + count,
        optionColor: option?.color,
      });
    }

    return Array.from(acc.values());
  }

  private buildOptionsMap(customColumn: {
    type: "singleSelect";
    options: { options: Array<{ value: string; label: string; color: ChipColor }> };
  }): Map<string, { label: string; color: ChipColor }> {
    const map = new Map<string, { label: string; color: ChipColor }>();
    customColumn.options.options.forEach((opt) => {
      if (opt.value && opt.label) map.set(opt.value, { label: opt.label, color: opt.color });
    });
    return map;
  }

  groupEntitiesByEntityType(entities: EntityForGrouping[], entityType: EntityType): DiagramDataPoint[] {
    const acc: GroupAccumulator = new Map();

    for (const entity of entities) {
      const label = this.getEntityLabel(entity, entityType);
      const existing = acc.get(entity.id);
      acc.set(entity.id, { labelKind: "literal", label, value: (existing?.value ?? 0) + 1 });
    }

    return Array.from(acc.values());
  }

  private getEntityLabel(entity: EntityForGrouping, entityType: EntityType): string {
    switch (entityType) {
      case EntityType.contact:
        return `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim() || entity.id;
      case EntityType.organization:
        return entity.name || entity.id;
      case EntityType.deal:
        return entity.name || entity.id;
      case EntityType.service:
        return entity.name || entity.id;
      case EntityType.task:
        return entity.name || entity.id;
    }
  }
}
