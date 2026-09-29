"use client";

import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, BellRing, Inbox, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import {
  setThreadArchivedAction,
  setThreadFollowUpAction,
  setThreadLabelsAction,
  upsertMailLabelAction,
} from "../actions";
import { FOLLOW_UP_OPTIONS, followUpDateFor, isFollowUpDue, type FollowUpOption } from "./mail-schedule-options";
import { MailLabelChip } from "./mail-label-chip";

export type ThreadWorkspaceState = {
  archived: boolean;
  followUpAt: Date | null;
  labels: MailThreadLabelDto[];
};

type Props = {
  threadId: string;
  state: ThreadWorkspaceState;
  allLabels: MailThreadLabelDto[];
  onChanged: (threadId: string, patch: Partial<ThreadWorkspaceState>) => void;
  onLabelCreated: (label: MailThreadLabelDto) => void;
};

const NO_FOLLOW_UP = "none";
const CURRENT_FOLLOW_UP = "current";
const NEW_LABEL_FIELD_ID = "mail-new-label";

export function MailThreadWorkspaceBar({ threadId, state, allLabels, onChanged, onLabelCreated }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const followUpOptionLabel = (option: FollowUpOption) => {
    switch (option) {
      case "tomorrow":
        return t("Mailbox.workspace.followUpTomorrow");
      case "threeDays":
        return t("Mailbox.workspace.followUpThreeDays");
      case "week":
        return t("Mailbox.workspace.followUpWeek");
    }
  };

  const run = (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);

    runUserAction(async () => {
      try {
        await work();
      } finally {
        setBusy(false);
      }
    });
  };

  const toggleArchived = () =>
    run(async () => {
      const result = await setThreadArchivedAction({ threadId, archived: !state.archived });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      onChanged(threadId, { archived: result.data.archived });
      toast.success(
        result.data.archived ? t("Mailbox.workspace.archivedToast") : t("Mailbox.workspace.unarchivedToast"),
      );
    });

  const changeFollowUp = (value: string) => {
    if (value === CURRENT_FOLLOW_UP) return;

    run(async () => {
      const followUpAt = value === NO_FOLLOW_UP ? null : followUpDateFor(value as FollowUpOption, new Date());
      const result = await setThreadFollowUpAction({ threadId, followUpAt });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      onChanged(threadId, { followUpAt: result.data.followUpAt });
      toast.success(
        result.data.followUpAt
          ? t("Mailbox.workspace.followUpSet", { date: intlStore.formatNumericalShortDateTime(result.data.followUpAt) })
          : t("Mailbox.workspace.followUpCleared"),
      );
    });
  };

  const saveLabels = (labelIds: string[]) =>
    run(async () => {
      const result = await setThreadLabelsAction({ threadId, labelIds });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      onChanged(threadId, { labels: result.data.labels });
    });

  const toggleLabel = (labelId: string) => {
    const selected = state.labels.map((label) => label.id);
    saveLabels(selected.includes(labelId) ? selected.filter((id) => id !== labelId) : [...selected, labelId]);
  };

  const createLabel = () => {
    const name = newLabel.trim();
    if (name.length === 0) return;

    run(async () => {
      const created = await upsertMailLabelAction({ name, color: "secondary" });
      if (!created.ok) {
        toastZodErrorTree(created.error);
        return;
      }

      onLabelCreated(created.data);
      setNewLabel("");

      const result = await setThreadLabelsAction({
        threadId,
        labelIds: [...state.labels.map((label) => label.id), created.data.id],
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      onChanged(threadId, { labels: result.data.labels });
    });
  };

  const selectedIds = new Set(state.labels.map((label) => label.id));
  const due = isFollowUpDue(state.followUpAt, new Date());

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-2" data-mail-workspace-bar="">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-7" disabled={busy} size="sm" type="button" variant="secondary" onClick={toggleArchived}>
          {state.archived ? (
            <Inbox aria-hidden="true" className="size-3.5" />
          ) : (
            <Archive aria-hidden="true" className="size-3.5" />
          )}

          {state.archived ? t("Mailbox.workspace.unarchive") : t("Mailbox.workspace.archive")}
        </Button>

        <Select
          disabled={busy}
          value={state.followUpAt ? CURRENT_FOLLOW_UP : NO_FOLLOW_UP}
          onValueChange={changeFollowUp}
        >
          <SelectTrigger aria-label={t("Mailbox.workspace.followUpLabel")} className="min-w-44" size="sm">
            <BellRing aria-hidden="true" className={cn("size-3.5", due && "text-destructive")} />

            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {state.followUpAt ? (
              <SelectItem value={CURRENT_FOLLOW_UP}>
                {due
                  ? t("Mailbox.workspace.followUpDue")
                  : t("Mailbox.workspace.followUpOn", {
                      date: intlStore.formatNumericalShortDateTime(state.followUpAt),
                    })}
              </SelectItem>
            ) : null}

            <SelectItem value={NO_FOLLOW_UP}>{t("Mailbox.workspace.followUpNone")}</SelectItem>

            {FOLLOW_UP_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {followUpOptionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div aria-label={t("Mailbox.workspace.labelsLabel")} className="flex flex-wrap items-center gap-1.5" role="group">
        {allLabels.map((label) => (
          <button
            key={label.id}
            aria-pressed={selectedIds.has(label.id)}
            className={cn(
              "rounded-full transition-opacity",
              !selectedIds.has(label.id) && "opacity-50 hover:opacity-80",
            )}
            disabled={busy}
            type="button"
            onClick={() => toggleLabel(label.id)}
          >
            <MailLabelChip label={label} />
          </button>
        ))}

        <Input
          aria-label={t("Mailbox.workspace.newLabelPlaceholder")}
          className="h-7 w-32"
          id={NEW_LABEL_FIELD_ID}
          maxLength={40}
          placeholder={t("Mailbox.workspace.newLabelPlaceholder")}
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") createLabel();
          }}
        />

        <Button
          aria-label={t("Mailbox.workspace.addLabel")}
          className="h-7"
          disabled={busy || newLabel.trim().length === 0}
          size="sm"
          type="button"
          variant="ghost"
          onClick={createLabel}
        >
          <Plus aria-hidden="true" className="size-3.5" />

          {t("Mailbox.workspace.addLabel")}
        </Button>
      </div>
    </div>
  );
}
