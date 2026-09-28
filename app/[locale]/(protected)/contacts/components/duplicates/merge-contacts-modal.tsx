"use client";

import type { ReactNode } from "react";
import type { DuplicateMemberDto } from "@/features/duplicates/duplicate.schema";
import type { DuplicatesStore } from "./duplicates.store";

import { observer } from "mobx-react-lite";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { memberName } from "./duplicate-member-name";

function Choice({
  legend,
  members,
  value,
  onChange,
  render,
}: {
  legend: string;
  members: readonly DuplicateMemberDto[];
  value: string;
  onChange: (id: string) => void;
  render: (member: DuplicateMemberDto) => ReactNode;
}) {
  const groupId = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>

      <RadioGroup className="gap-2" value={value} onValueChange={onChange}>
        {members.map((member) => {
          const itemId = `${groupId}-${member.id}`;

          return (
            <div key={member.id} className="flex items-center gap-2">
              <RadioGroupItem id={itemId} value={member.id} />

              <Label className="min-w-0 flex-1 font-normal" htmlFor={itemId}>
                {render(member)}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

function hint(member: DuplicateMemberDto): string | undefined {
  return member.kind === EntityType.contact ? member.emails[0] : member.domains[0];
}

export const MergeContactsModal = observer(function MergeContactsModal({ store }: { store: DuplicatesStore }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { plural } = useEntityTerminology();

  const group = store.mergeGroup;
  const isOpen = group !== null;
  const focusReturn = useOverlayFocusReturn(isOpen);
  const members = group?.members ?? [];
  const winnerId = store.winnerId ?? members[0]?.id ?? "";
  const winner = members.find((member) => member.id === winnerId);
  const differs = (pick: (member: DuplicateMemberDto) => string) => new Set(members.map(pick)).size > 1;
  const isContact = store.entityType === EntityType.contact;
  const entities = plural(store.entityType);
  const nameOf = (member: DuplicateMemberDto, field: "firstName" | "lastName") =>
    member.kind === EntityType.contact ? member[field] : member.name;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) store.closeMerge();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" {...focusReturn}>
        <AppCard>
          <AppCardHeader>
            <AlertDialogTitle className="text-base font-semibold">
              {t("Duplicates.merge.title", { entities })}
            </AlertDialogTitle>
          </AppCardHeader>

          <AppCardBody>
            <AlertDialogDescription className="text-sm text-foreground">
              {isContact
                ? t("Duplicates.merge.description", { name: winner ? memberName(winner) : "", days: 30 })
                : t("Duplicates.merge.organizationDescription", { name: winner ? memberName(winner) : "", days: 30 })}
            </AlertDialogDescription>

            <Choice
              legend={t("Duplicates.merge.keep")}
              members={members}
              render={(member) => (
                <span className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{memberName(member)}</span>

                  {hint(member) && <span className="truncate text-muted-foreground">{hint(member)}</span>}

                  <span className="text-muted-foreground">
                    {t("Duplicates.merge.created", { date: intlStore.formatDescriptiveShortDate(member.createdAt) })}
                  </span>
                </span>
              )}
              value={winnerId}
              onChange={store.chooseWinner}
            />

            {isContact && differs((member) => nameOf(member, "firstName")) && (
              <Choice
                legend={t("Duplicates.merge.firstName")}
                members={members}
                render={(member) => nameOf(member, "firstName")}
                value={store.fieldSources.firstName ?? winnerId}
                onChange={(id) => store.chooseFieldSource("firstName", id)}
              />
            )}

            {isContact && differs((member) => nameOf(member, "lastName")) && (
              <Choice
                legend={t("Duplicates.merge.lastName")}
                members={members}
                render={(member) => nameOf(member, "lastName")}
                value={store.fieldSources.lastName ?? winnerId}
                onChange={(id) => store.chooseFieldSource("lastName", id)}
              />
            )}

            {!isContact && differs(memberName) && (
              <Choice
                legend={t("Duplicates.merge.name")}
                members={members}
                render={memberName}
                value={store.fieldSources.name ?? winnerId}
                onChange={(id) => store.chooseFieldSource("name", id)}
              />
            )}

            {store.differingColumns.map((column) => (
              <Choice
                key={column.id}
                legend={column.label}
                members={members}
                render={(member) =>
                  member.customFieldValues.some((entry) => entry.columnId === column.id) ? (
                    <CustomFieldValue column={column} item={member} />
                  ) : (
                    <span className="text-muted-foreground">{t("DataView.noValue")}</span>
                  )
                }
                value={store.customFieldSources[column.id] ?? winnerId}
                onChange={(id) => store.chooseCustomFieldSource(column.id, id)}
              />
            ))}
          </AppCardBody>

          <AppCardFooter>
            <AlertDialogCancel disabled={store.isMerging}>{t("Common.actions.cancel")}</AlertDialogCancel>

            <AlertDialogAction
              disabled={store.isMerging || !winner}
              onClick={(event) => {
                event.preventDefault();
                runUserAction(() =>
                  store.confirmMerge({
                    merged: t("Duplicates.merge.merged"),
                    undo: t("Duplicates.merge.undo"),
                    undone: t("Duplicates.merge.undone"),
                  }),
                );
              }}
            >
              {t("Duplicates.merge.confirm", { count: members.length, entities })}
            </AlertDialogAction>
          </AppCardFooter>
        </AppCard>
      </AlertDialogContent>
    </AlertDialog>
  );
});
