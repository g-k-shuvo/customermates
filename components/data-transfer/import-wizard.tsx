"use client";

import type { ImportRowIssue } from "@/features/data-transfer/import/import-issues";
import type { MappingTarget } from "@/features/data-transfer/import/import-mapping";

import { AtSign, SlidersHorizontal, Table2 } from "lucide-react";
import { MessagingProvider } from "@/generated/prisma";
import { observer } from "mobx-react-lite";
import { Fragment, useRef } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";
import { AppCard } from "@/components/card/app-card";
import { AppChip } from "@/components/chip/app-chip";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { runUserAction } from "@/core/errors/report-application-error";
import { DUPLICATE_STRATEGIES, type DuplicateStrategy } from "@/features/data-transfer/data-transfer.schema";
import { identifierTargetFor, targetIdentity } from "@/features/data-transfer/import/import-mapping";
import { IMPORT_FILE_ACCEPT } from "@/features/data-transfer/import/read-import-file";
import {
  buildIssueReportCsv,
  issueReportEntries,
  issueReportFileName,
} from "@/features/data-transfer/import/issue-report";
import { useRootStore } from "@/core/stores/root-store.provider";

const STEP_ORDER = ["file", "mapping", "preview", "result"] as const;

const IGNORE_VALUE = "ignore";

const RECORD_ID_VALUE = "recordId";

const NO_DUPLICATE_KEY_VALUE = "none";

const CSV_MIME_TYPE = "text/csv;charset=utf-8";

const BYTE_ORDER_MARK = "\uFEFF";

function downloadCsv(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([`${BYTE_ORDER_MARK}${text}`], { type: CSV_MIME_TYPE }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function columnPrefix(issue: ImportRowIssue): string {
  const letter = issue.columnLetter ? `${issue.columnLetter}. ` : "";

  return `${letter}${issue.columnLabel}:`;
}

type IssueGroup = { issue: ImportRowIssue; rows: number[] };

function groupIssues(issues: ImportRowIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();

  for (const issue of issues) {
    const key = [issue.code, issue.columnLetter, issue.columnLabel, issue.message, JSON.stringify(issue.values)].join(
      "\u0000",
    );
    const seen = groups.get(key);

    if (!seen) {
      groups.set(key, { issue, rows: issue.sheetRow === null ? [] : [issue.sheetRow] });
      continue;
    }

    if (issue.sheetRow !== null) seen.rows.push(issue.sheetRow);
  }

  return [...groups.values()];
}

function ImportIssueList({ issues }: { issues: ImportRowIssue[] }) {
  const t = useTranslations();
  const groups = groupIssues(issues);
  const blocking = issues.some((issue) => issue.blocking);

  return (
    <div className="space-y-2">
      <p className={cn("text-sm", blocking ? "text-destructive" : "text-warning")}>
        {blocking
          ? t("DataTransfer.import.issueCount", { count: issues.length })
          : t("DataTransfer.import.warningCount", { count: issues.length })}
      </p>

      <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
        {groups.slice(0, ISSUE_DISPLAY_LIMIT).map(({ issue, rows }, index) => (
          <li key={index} className="flex items-baseline gap-2">
            <span className="min-w-16 shrink-0 font-mono text-xs text-muted-foreground">
              {rows.length > 1
                ? t("DataTransfer.import.rowsAffected", { count: rows.length })
                : rows.length === 1
                  ? `${t("DataTransfer.import.row")} ${rows[0]}`
                  : "-"}
            </span>

            <span className="min-w-0">
              {issue.columnLabel && <span className="mr-1 font-medium">{columnPrefix(issue)}</span>}

              {issue.values ? t(`DataTransfer.import.issues.${issue.code}`, issue.values) : issue.message}
            </span>
          </li>
        ))}
      </ul>

      {groups.length > ISSUE_DISPLAY_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("DataTransfer.import.moreIssues", { count: groups.length - ISSUE_DISPLAY_LIMIT })}
        </p>
      )}
    </div>
  );
}

const ISSUE_DISPLAY_LIMIT = 200;

function decodeTarget(value: string): MappingTarget {
  if (value === IGNORE_VALUE) return { kind: "ignore" };
  if (value === RECORD_ID_VALUE) return { kind: "recordId" };
  if (value.startsWith("custom:")) return { kind: "customField", columnId: value.slice("custom:".length) };
  const identifier = identifierTargetFor(value);
  if (identifier) return identifier;

  return { kind: "field", key: value.slice("field:".length) };
}

export const ImportWizard = observer(function ImportWizard() {
  const { importWizardStore: store } = useRootStore();
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepNumber = STEP_ORDER.indexOf(store.step) + 1;
  const progressText = t("DataTransfer.import.progress", { current: stepNumber, total: STEP_ORDER.length });

  const fieldOptions = store.descriptor.fields.map((field) => ({
    value: `field:${field.key}`,
    label: t(field.labelKey),
  }));

  const customOptions = store.customColumns.map((column) => ({
    value: `custom:${column.id}`,
    label: column.label,
  }));

  const channelOptions = store.descriptor.supportsIdentifiers
    ? Object.values(MessagingProvider).map((provider) => ({
        value: `identifier:${provider}`,
        label: t("DataTransfer.import.channelOption", { provider: t(`Common.providers.${provider}`) }),
      }))
    : [];

  const optionGroups = [
    { labelKey: "DataTransfer.import.groupFields", icon: Table2, options: fieldOptions },
    { labelKey: "DataTransfer.import.groupCustomFields", icon: SlidersHorizontal, options: customOptions },
    { labelKey: "DataTransfer.import.groupChannels", icon: AtSign, options: channelOptions },
  ];

  const strategyLabels: Record<DuplicateStrategy, string> = {
    create: t("DataTransfer.import.duplicateStrategies.create"),
    update: t("DataTransfer.import.duplicateStrategies.update"),
    skip: t("DataTransfer.import.duplicateStrategies.skip"),
  };

  const downloadIssueReport = () => {
    const entries = issueReportEntries({
      issues: store.issues,
      sources: store.parsed?.sources ?? [],
      rows: store.parsed?.rows ?? [],
      messageOf: (issue) =>
        issue.values ? t(`DataTransfer.import.issues.${issue.code}`, issue.values) : issue.message,
    });

    const csv = buildIssueReportCsv(entries, {
      row: t("DataTransfer.import.report.row"),
      column: t("DataTransfer.import.report.column"),
      header: t("DataTransfer.import.report.header"),
      value: t("DataTransfer.import.report.value"),
      message: t("DataTransfer.import.report.message"),
      blocking: t("DataTransfer.import.report.blocking"),
      blockingYes: t("DataTransfer.import.report.blockingYes"),
      blockingNo: t("DataTransfer.import.report.blockingNo"),
    });

    downloadCsv(csv, issueReportFileName(store.fileName));
  };

  return (
    <AppModal
      description={t("DataTransfer.import.description")}
      size="5xl"
      store={store}
      title={t("DataTransfer.import.title")}
    >
      <AppCard>
        <AppCardHeader className="flex-col items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">{progressText}</p>

            <h2 className="min-w-0 break-words text-xl font-semibold">{t("DataTransfer.import.title")}</h2>
          </div>

          <WizardProgress
            current={stepNumber}
            label={t("DataTransfer.import.progressLabel")}
            total={STEP_ORDER.length}
            valueText={progressText}
          />
        </AppCardHeader>

        <AppCardBody>
          {store.step === "file" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("DataTransfer.import.fileHint")}</p>

              <input
                ref={fileInputRef}
                accept={IMPORT_FILE_ACCEPT}
                className="hidden"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) runUserAction(() => store.selectFile(file));
                }}
              />

              <Button
                disabled={store.isLoading}
                id="import-choose-file"
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("DataTransfer.import.chooseFile")}
              </Button>

              {store.isLoading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner aria-label={t("Loading.text")} size="sm" />

                  {t("Loading.text")}
                </p>
              )}

              {store.fileError && (
                <p className="text-sm text-destructive">
                  {store.fileError === "demoBlocked"
                    ? t("Common.errors.demoMode")
                    : t("DataTransfer.import.fileRejected")}
                </p>
              )}
            </div>
          )}

          {store.step === "mapping" && store.parsed && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("DataTransfer.import.mappingHint", { file: store.fileName, rows: store.parsed.rows.length })}
              </p>

              {store.duplicateTargetCount > 0 && (
                <p className="text-sm text-destructive">
                  {t("DataTransfer.import.duplicateTargets", { count: store.duplicateTargetCount })}
                </p>
              )}

              <ul className="space-y-2">
                {store.parsed.sources.map((source, index) => (
                  <li key={source.index} className="flex items-center gap-3">
                    <span className="flex w-1/3 min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-medium">
                        {`${source.letter}. ${source.header || t("DataTransfer.import.unnamedColumn")}`}
                      </span>

                      {source.samples.length > 0 && (
                        <span className="flex min-w-0 gap-1">
                          {source.samples.map((sample, sampleIndex) => (
                            <AppChip key={`${sampleIndex}-${sample}`}>{sample}</AppChip>
                          ))}
                        </span>
                      )}
                    </span>

                    <Select
                      value={targetIdentity(store.mapping[index] ?? { kind: "ignore" })}
                      onValueChange={(value) => store.setTarget(index, decodeTarget(value))}
                    >
                      <SelectTrigger className="w-2/3">
                        <SelectValue placeholder=" " />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value={IGNORE_VALUE}>{t("DataTransfer.import.ignoreColumn")}</SelectItem>

                        <SelectItem value={RECORD_ID_VALUE}>{t("DataTransfer.import.recordId")}</SelectItem>

                        {optionGroups.map(({ labelKey, icon: GroupIcon, options }) =>
                          options.length === 0 ? null : (
                            <Fragment key={labelKey}>
                              <SelectSeparator />

                              <SelectGroup>
                                <SelectLabel className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <GroupIcon className="size-3.5 shrink-0" />

                                  {t(labelKey)}
                                </SelectLabel>

                                {options.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </Fragment>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>

              {store.duplicateKeyColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                  <span className="text-sm font-medium">{t("DataTransfer.import.duplicateKeyLabel")}</span>

                  <Select
                    value={store.duplicateKeyIndex === null ? NO_DUPLICATE_KEY_VALUE : String(store.duplicateKeyIndex)}
                    onValueChange={(value) =>
                      store.setDuplicateKeyIndex(value === NO_DUPLICATE_KEY_VALUE ? null : Number(value))
                    }
                  >
                    <SelectTrigger className="w-64" id="import-duplicate-key">
                      <SelectValue placeholder=" " />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value={NO_DUPLICATE_KEY_VALUE}>
                        {t("DataTransfer.import.duplicateKeyNone")}
                      </SelectItem>

                      {store.duplicateKeyColumns.map((column) => (
                        <SelectItem key={column.index} value={String(column.index)}>
                          {`${column.letter}. ${column.header || t("DataTransfer.import.unnamedColumn")}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-sm font-medium">{t("DataTransfer.import.duplicateStrategyLabel")}</span>

                  <Select
                    disabled={store.duplicateKeyIndex === null}
                    value={store.duplicateStrategy}
                    onValueChange={(value) => store.setDuplicateStrategy(value as DuplicateStrategy)}
                  >
                    <SelectTrigger className="w-64" id="import-duplicate-strategy">
                      <SelectValue placeholder=" " />
                    </SelectTrigger>

                    <SelectContent>
                      {DUPLICATE_STRATEGIES.map((strategy) => (
                        <SelectItem key={strategy} value={strategy}>
                          {strategyLabels[strategy]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {store.step === "preview" && store.plan && (
            <div className="space-y-3">
              <p className="text-sm">
                {t("DataTransfer.import.previewCounts", {
                  create: store.plan.create.length,
                  update: store.plan.update.length,
                })}
              </p>

              {store.issues.length === 0 ? (
                <p className="text-sm text-success">{t("DataTransfer.import.noIssues")}</p>
              ) : (
                <div className="space-y-2">
                  <ImportIssueList issues={store.issues} />

                  {store.skippableCount > 0 && (
                    <label className="flex items-center gap-2 text-sm" htmlFor="import-skip-invalid">
                      <Checkbox
                        checked={store.skipInvalid}
                        id="import-skip-invalid"
                        onCheckedChange={(checked) => store.setSkipInvalid(checked === true)}
                      />

                      {t("DataTransfer.import.skipInvalid", { count: store.skippableCount })}
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {store.step === "result" && store.summary && (
            <div className="space-y-2 text-sm">
              <p>
                {t("DataTransfer.import.resultCounts", {
                  created: store.summary.created,
                  updated: store.summary.updated,
                })}
              </p>

              {store.summary.skipped > 0 && (
                <p className="text-muted-foreground">
                  {t("DataTransfer.import.resultSkipped", { count: store.summary.skipped })}
                </p>
              )}

              {store.summary.stoppedAtSheetRow !== null && (
                <p className="text-destructive">
                  {t("DataTransfer.import.stopped", {
                    row: store.summary.stoppedAtSheetRow,
                    remaining: store.summary.notAttempted,
                  })}
                </p>
              )}

              {store.issues.length > 0 && <ImportIssueList issues={store.issues} />}
            </div>
          )}

          {store.isLoading && store.progressTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("DataTransfer.import.batchProgress", { done: store.progressDone, total: store.progressTotal })}
            </p>
          )}
        </AppCardBody>

        <AppCardFooter>
          {store.step === "mapping" && (
            <Button disabled={store.isLoading} type="button" variant="secondary" onClick={() => store.setStep("file")}>
              {t("Common.actions.back")}
            </Button>
          )}

          {store.step === "mapping" && (
            <Button
              disabled={store.isLoading || store.duplicateTargetCount > 0}
              id="import-validate"
              type="button"
              onClick={() => runUserAction(() => store.runDryRun())}
            >
              {t("DataTransfer.import.validate")}
            </Button>
          )}

          {store.step === "preview" && (
            <Button
              disabled={store.isLoading}
              type="button"
              variant="secondary"
              onClick={() => store.setStep("mapping")}
            >
              {t("Common.actions.back")}
            </Button>
          )}

          {(store.step === "preview" || store.step === "result") && store.issues.length > 0 && (
            <Button
              id="import-download-issues"
              type="button"
              variant="secondary"
              onClick={() => runUserAction(downloadIssueReport)}
            >
              {t("DataTransfer.import.downloadIssues")}
            </Button>
          )}

          {store.step === "preview" && (
            <Button
              disabled={store.isLoading || store.hasBlockingIssues}
              id="import-commit"
              type="button"
              onClick={() => runUserAction(() => store.commit())}
            >
              {t("DataTransfer.import.commit")}
            </Button>
          )}

          {store.step === "result" && (
            <Button type="button" onClick={() => store.close()}>
              {t("Common.actions.close")}
            </Button>
          )}
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
});
