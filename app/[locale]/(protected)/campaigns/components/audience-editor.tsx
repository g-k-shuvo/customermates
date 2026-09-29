"use client";

import type { CampaignEditorStore, ConditionKind, ConditionRow, GroupMode } from "./campaign-editor.store";

import { Plus, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CustomColumnType } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

const KINDS: ConditionKind[] = ["onList", "notOnList", "organizationField", "contactField"];

export const AudienceEditor = observer(({ store, disabled }: { store: CampaignEditorStore; disabled: boolean }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const preview = store.preview;

  const kindLabel = (kind: ConditionKind) => {
    switch (kind) {
      case "onList":
        return t("Campaigns.audience.kinds.onList");
      case "notOnList":
        return t("Campaigns.audience.kinds.notOnList");
      case "organizationField":
        return t("Campaigns.audience.kinds.organizationField");
      case "contactField":
        return t("Campaigns.audience.kinds.contactField");
    }
  };

  const valueInput = (row: ConditionRow) => {
    const columns = row.kind === "organizationField" ? store.options.organizationColumns : store.options.contactColumns;
    const column = columns.find((candidate) => candidate.id === row.columnId);

    return (
      <>
        <Select
          disabled={disabled}
          value={row.columnId || undefined}
          onValueChange={(columnId) => store.updateCondition(row.key, { columnId, values: [] })}
        >
          <SelectTrigger aria-label={t("Campaigns.audience.field")}>
            <SelectValue placeholder={t("Campaigns.audience.field")} />
          </SelectTrigger>

          <SelectContent>
            {columns.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {column?.type === CustomColumnType.singleSelect ? (
          <Select
            disabled={disabled}
            value={row.values[0] ?? undefined}
            onValueChange={(value) => store.updateCondition(row.key, { values: [value] })}
          >
            <SelectTrigger aria-label={t("Campaigns.audience.value")}>
              <SelectValue placeholder={t("Campaigns.audience.value")} />
            </SelectTrigger>

            <SelectContent>
              {column.options.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            aria-label={t("Campaigns.audience.value")}
            disabled={disabled || !column}
            placeholder={t("Campaigns.audience.valuesPlaceholder")}
            value={row.values.join(", ")}
            onChange={(event) =>
              store.updateCondition(row.key, {
                values: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        )}
      </>
    );
  };

  const renderRow = (row: ConditionRow) => (
    <div key={row.key} className="grid gap-2 sm:grid-cols-[12rem_1fr_1fr_auto]" data-audience-row="">
      <Select
        disabled={disabled}
        value={row.kind}
        onValueChange={(kind) =>
          store.updateCondition(row.key, { kind: kind as ConditionKind, listId: "", columnId: "", values: [] })
        }
      >
        <SelectTrigger aria-label={t("Campaigns.audience.kind")}>
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {kindLabel(kind)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {row.kind === "onList" || row.kind === "notOnList" ? (
        <div className="sm:col-span-2">
          <Select
            disabled={disabled}
            value={row.listId || undefined}
            onValueChange={(listId) => store.updateCondition(row.key, { listId })}
          >
            <SelectTrigger aria-label={t("Campaigns.audience.list")}>
              <SelectValue placeholder={t("Campaigns.audience.list")} />
            </SelectTrigger>

            <SelectContent>
              {store.options.lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        valueInput(row)
      )}

      <Button
        aria-label={t("Campaigns.audience.remove")}
        disabled={disabled}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => store.removeCondition(row.key)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4" data-campaign-audience="">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("Campaigns.audience.title")}</h2>

        <p className="text-xs text-muted-foreground">{t("Campaigns.audience.help")}</p>
      </div>

      {store.items.map((item) =>
        item.type === "condition" ? (
          renderRow(item.row)
        ) : (
          <div
            key={item.key}
            className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3"
            data-audience-group={item.mode}
          >
            <div className="flex items-center justify-between gap-2">
              <Select
                disabled={disabled}
                value={item.mode}
                onValueChange={(mode) => store.setGroupMode(item.key, mode as GroupMode)}
              >
                <SelectTrigger aria-label={t("Campaigns.audience.groupMode")} className="w-56">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="anyOf">{t("Campaigns.audience.groups.anyOf")}</SelectItem>

                  <SelectItem value="noneOf">{t("Campaigns.audience.groups.noneOf")}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                aria-label={t("Campaigns.audience.removeGroup")}
                disabled={disabled}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => store.removeGroup(item.key)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {item.rows.map(renderRow)}

            <div>
              <Button
                disabled={disabled}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => store.addCondition(item.key)}
              >
                <Plus className="size-4" />

                {t("Campaigns.audience.addToGroup")}
              </Button>
            </div>
          </div>
        ),
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled} size="sm" type="button" variant="secondary" onClick={() => store.addCondition()}>
            <Plus className="size-4" />

            {t("Campaigns.audience.add")}
          </Button>

          <Button
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => store.addGroup("anyOf")}
          >
            <Plus className="size-4" />

            {t("Campaigns.audience.addAnyGroup")}
          </Button>

          <Button
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => store.addGroup("noneOf")}
          >
            <Plus className="size-4" />

            {t("Campaigns.audience.addNoneGroup")}
          </Button>
        </div>

        <Button
          disabled={!store.definition || store.isBusy}
          id="campaign-preview"
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => store.runPreview())}
        >
          {t("Campaigns.audience.preview")}
        </Button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-2" data-audience-preview="">
          <p className="text-sm">
            {t("Campaigns.audience.count", {
              count: intlStore.formatNumber(preview.count),
              withoutEmail: intlStore.formatNumber(preview.withoutEmail),
            })}
          </p>

          <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
            {preview.sample.map((row) => (
              <li key={row.contactId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>{`${row.firstName} ${row.lastName}`.trim()}</span>

                <span className="flex gap-2 text-muted-foreground">
                  <span>{row.email}</span>

                  {row.organizationName ? <span>{row.organizationName}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
});
