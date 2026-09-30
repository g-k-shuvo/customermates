"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useCanonicalColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IGNORED_CHANGE_KEYS } from "@/core/utils/calculate-changes";

import { NotesDiff } from "./notes-diff";

type Change = { previous: unknown; current: unknown };

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const NAME_KEYS = ["name", "title", "label", "email", "value", "id"] as const;

export function readAuditChanges(eventData: unknown): [string, Change][] {
  if (!eventData || typeof eventData !== "object") return [];

  const data = eventData as { changes?: unknown; payload?: { changes?: unknown } | null };
  const changes = data.changes ?? data.payload?.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];

  return Object.entries(changes as Record<string, unknown>).flatMap(([field, change]) =>
    !IGNORED_CHANGE_KEYS.has(field) && change && typeof change === "object" && "current" in change
      ? [[field, change as Change]]
      : [],
  );
}

function describeObject(value: object): string {
  const record = value as Record<string, unknown>;
  if (typeof record.firstName === "string" || typeof record.lastName === "string")
    return [record.firstName, record.lastName].filter(Boolean).join(" ");

  for (const key of NAME_KEYS) if (typeof record[key] === "string" && record[key] !== "") return record[key];

  return JSON.stringify(value);
}

export const AuditLogChanges = observer(function AuditLogChanges({ eventData }: { eventData: unknown }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const columnLabel = useCanonicalColumnLabel();
  const changes = readAuditChanges(eventData);

  if (changes.length === 0) return null;

  const describe = (value: unknown): string => {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0))
      return t("AuditLogModal.noValue");
    if (typeof value === "number") return intlStore.formatNumber(value);
    if (typeof value === "boolean") return value ? t("AuditLogModal.changes.yes") : t("AuditLogModal.changes.no");
    if (value instanceof Date) return intlStore.formatNumericalShortDateTime(value);
    if (typeof value === "string")
      return ISO_DATE_TIME.test(value) ? intlStore.formatNumericalShortDateTime(new Date(value)) : value;
    if (Array.isArray(value)) return value.map((item) => describe(item)).join(", ");
    if (typeof value === "object") return describeObject(value);

    return String(value);
  };

  return (
    <div className="flex flex-col gap-2" data-audit-log-changes="">
      <h3 className="text-sm font-semibold">{t("AuditLogModal.changes.title")}</h3>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("AuditLogModal.changes.field")}</th>

              <th className="px-3 py-2 font-medium">{t("AuditLogModal.changes.before")}</th>

              <th className="px-3 py-2 font-medium">{t("AuditLogModal.changes.after")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {changes.map(([field, change]) => (
              <tr key={field} className="align-top">
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap" scope="row">
                  {columnLabel(field)}
                </th>

                {field === "notes" ? (
                  <td className="px-3 py-2" colSpan={2}>
                    <NotesDiff current={change.current} previous={change.previous} />
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 break-words text-muted-foreground">{describe(change.previous)}</td>

                    <td className="px-3 py-2 break-words">{describe(change.current)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
