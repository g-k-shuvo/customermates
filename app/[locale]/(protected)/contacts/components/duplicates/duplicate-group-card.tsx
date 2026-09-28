"use client";

import type { DuplicateGroupDto, DuplicateMemberDto } from "@/features/duplicates/duplicate.schema";
import type { DuplicatesStore } from "./duplicates.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { DuplicateMatchKeyKind, EntityType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { memberName } from "./duplicate-member-name";

type Translate = ReturnType<typeof useTranslations>;

function signalLabel(t: Translate, signal: DuplicateMatchKeyKind): string {
  switch (signal) {
    case DuplicateMatchKeyKind.emailLocalPart:
      return t("Duplicates.signals.emailLocalPart");
    case DuplicateMatchKeyKind.emailDomainSurname:
      return t("Duplicates.signals.emailDomainSurname");
    case DuplicateMatchKeyKind.phoneLast7:
      return t("Duplicates.signals.phoneLast7");
    case DuplicateMatchKeyKind.nameKey:
      return t("Duplicates.signals.nameKey");
    case DuplicateMatchKeyKind.nameSoundKey:
      return t("Duplicates.signals.nameSoundKey");
    case DuplicateMatchKeyKind.organizationSurname:
      return t("Duplicates.signals.organizationSurname");
    case DuplicateMatchKeyKind.organizationNameKey:
      return t("Duplicates.signals.organizationNameKey");
    case DuplicateMatchKeyKind.organizationSoundKey:
      return t("Duplicates.signals.organizationSoundKey");
    case DuplicateMatchKeyKind.organizationDomain:
      return t("Duplicates.signals.organizationDomain");
  }
}

function MemberLines({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>

      {values.map((value) => (
        <dd key={value} className="truncate text-sm">
          {value}
        </dd>
      ))}
    </div>
  );
}

const MemberColumn = observer(({ member }: { member: DuplicateMemberDto }) => {
  const t = useTranslations();
  const entityHref = useEntityHref();
  const intlStore = useHydratedIntlStore();
  const created = [intlStore.formatDescriptiveShortDate(member.createdAt)];

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <AppLink className="truncate font-medium" href={entityHref(member.kind, member.id) ?? "#"}>
        {memberName(member)}
      </AppLink>

      {member.kind === EntityType.contact ? (
        <dl className="flex flex-col gap-2">
          <MemberLines label={t("Duplicates.fields.emails")} values={member.emails} />

          <MemberLines label={t("Duplicates.fields.phones")} values={member.phones} />

          <MemberLines
            label={t("Duplicates.fields.organizations")}
            values={member.organizations.map((organization) => organization.name)}
          />

          <MemberLines label={t("Duplicates.fields.createdAt")} values={created} />
        </dl>
      ) : (
        <dl className="flex flex-col gap-2">
          <MemberLines label={t("Duplicates.fields.domains")} values={member.domains} />

          <MemberLines
            label={t("Duplicates.fields.linked")}
            values={[t("Duplicates.linkedCounts", { contacts: member.contactCount, deals: member.dealCount })]}
          />

          <MemberLines label={t("Duplicates.fields.createdAt")} values={created} />
        </dl>
      )}
    </div>
  );
});

type Props = { group: DuplicateGroupDto; store: DuplicatesStore; canDismiss: boolean; canMerge: boolean };

export const DuplicateGroupCard = observer(({ group, store, canDismiss, canMerge }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const isDismissing = store.dismissingIds.has(group.id);
  const label = t("Duplicates.groupLabel", { count: group.members.length, entities: plural(store.entityType) });

  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>

          {group.signals.map((signal) => (
            <AppChip key={signal} size="sm" variant="secondary">
              {signalLabel(t, signal)}
            </AppChip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {canDismiss && (
            <Button
              disabled={isDismissing}
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => store.dismiss(group.id, t("Duplicates.dismissed")))}
            >
              {t("Duplicates.notDuplicates")}
            </Button>
          )}

          {canMerge && (
            <Button size="sm" onClick={() => store.openMerge(group)}>
              {t("Duplicates.merge.action")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        {group.members.map((member) => (
          <MemberColumn key={member.id} member={member} />
        ))}
      </div>
    </section>
  );
});
