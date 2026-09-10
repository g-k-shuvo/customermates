"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const ALL_FOLDERS_VALUE = "\u0000all-folders";

type Props = {
  draft: string;
  folder: string;
  folders: string[];
  searching: boolean;
  onDraftChange: (next: string) => void;
  onFolderChange: (next: string) => void;
  onSubmit: () => void;
};

export function MailThreadToolbar({
  draft,
  folder,
  folders,
  searching,
  onDraftChange,
  onFolderChange,
  onSubmit,
}: Props) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-2">
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
