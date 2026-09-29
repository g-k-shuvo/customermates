"use client";

import type { MailThreadLabelDto, MailView } from "@/features/mailbox/mailbox.schema";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const ALL_FOLDERS_VALUE = "\u0000all-folders";

export const ALL_LABELS_VALUE = "\u0000all-labels";

const TOOLBAR_VIEWS = [
  "inbox",
  "followUp",
  "drafts",
  "outbox",
  "archived",
  "all",
] as const satisfies readonly MailView[];

type Props = {
  draft: string;
  folder: string;
  folders: string[];
  searching: boolean;
  onDraftChange: (next: string) => void;
  onFolderChange: (next: string) => void;
  onSubmit: () => void;
  view?: MailView;
  onViewChange?: (next: MailView) => void;
  labels?: MailThreadLabelDto[];
  labelId?: string;
  onLabelChange?: (next: string) => void;
};

export function MailThreadToolbar({
  draft,
  folder,
  folders,
  searching,
  onDraftChange,
  onFolderChange,
  onSubmit,
  view = "inbox",
  onViewChange = () => undefined,
  labels = [],
  labelId = ALL_LABELS_VALUE,
  onLabelChange = () => undefined,
}: Props) {
  const t = useTranslations();

  const viewLabel = (entry: MailView) => {
    switch (entry) {
      case "inbox":
        return t("Mailbox.workspace.viewInbox");
      case "followUp":
        return t("Mailbox.workspace.viewFollowUp");
      case "drafts":
        return t("Mailbox.workspace.viewDrafts");
      case "outbox":
        return t("Mailbox.workspace.viewOutbox");
      case "archived":
        return t("Mailbox.workspace.viewArchived");
      case "all":
        return t("Mailbox.workspace.viewAll");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={view} onValueChange={(next) => onViewChange(next as MailView)}>
        <SelectTrigger aria-label={t("Mailbox.workspace.viewLabel")} className="min-w-32" size="sm">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {TOOLBAR_VIEWS.map((entry) => (
            <SelectItem key={entry} value={entry}>
              {viewLabel(entry)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {labels.length > 0 ? (
        <Select value={labelId} onValueChange={onLabelChange}>
          <SelectTrigger aria-label={t("Mailbox.workspace.labelFilterLabel")} className="min-w-32" size="sm">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value={ALL_LABELS_VALUE}>{t("Mailbox.workspace.allLabels")}</SelectItem>

            {labels.map((label) => (
              <SelectItem key={label.id} value={label.id}>
                {label.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Input
        aria-label={t("Mailbox.searchLabel")}
        className="h-8 w-full max-w-56"
        placeholder={t("Mailbox.searchPlaceholder")}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
        }}
      />

      <Button className="h-8" disabled={searching} size="sm" type="button" variant="secondary" onClick={onSubmit}>
        <Search aria-hidden="true" className="size-3.5" />

        {t("Mailbox.searchSubmit")}
      </Button>

      {folders.length > 1 ? (
        <Select value={folder} onValueChange={onFolderChange}>
          <SelectTrigger aria-label={t("Mailbox.folderLabel")} className="min-w-40" size="sm">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value={ALL_FOLDERS_VALUE}>{t("Mailbox.allFolders")}</SelectItem>

            {folders.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
