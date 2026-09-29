"use client";

import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { MAIL_LABEL_COLORS } from "@/features/mailbox/mailbox.schema";

import { deleteMailLabelAction, upsertMailLabelAction } from "../actions";

type Props = { labels: MailThreadLabelDto[] };

type LabelColor = MailThreadLabelDto["color"];

const NEW_LABEL_FIELD_ID = "mail-labels-new";

export function MailLabelsCard({ labels: initialLabels }: Props) {
  const t = useTranslations();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [labels, setLabels] = useState(initialLabels);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const colorName = (color: LabelColor) => {
    switch (color) {
      case "default":
        return t("Mailbox.workspace.colorPrimary");
      case "secondary":
        return t("Mailbox.workspace.colorNeutral");
      case "destructive":
        return t("Mailbox.workspace.colorRed");
      case "success":
        return t("Mailbox.workspace.colorGreen");
      case "warning":
        return t("Mailbox.workspace.colorAmber");
      case "info":
        return t("Mailbox.workspace.colorBlue");
    }
  };

  const save = (label: { id?: string; name: string; color: LabelColor }) => {
    if (busy) return;
    setBusy(true);

    runUserAction(async () => {
      try {
        const result = await upsertMailLabelAction(label);
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        const saved = result.data;
        setLabels((current) =>
          label.id ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current, saved],
        );
        if (!label.id) {
          setName("");
          toast.success(t("Mailbox.workspace.labelCreated"));
        }
      } finally {
        setBusy(false);
      }
    });
  };

  const remove = (label: MailThreadLabelDto) =>
    showDeleteConfirmation(async () => {
      const result = await deleteMailLabelAction({ id: label.id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      setLabels((current) => current.filter((entry) => entry.id !== label.id));
      return true;
    }, label.name);

  return (
    <Card className="w-full max-w-3xl gap-4 py-5" data-mail-labels-card="">
      <CardContent className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{t("Mailbox.workspace.labelsTitle")}</h2>

          <p className="text-subdued text-xs">{t("Mailbox.workspace.labelsDescription")}</p>
        </div>

        {labels.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("Mailbox.workspace.labelsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {labels.map((label) => (
              <li key={label.id} className="flex flex-wrap items-center gap-2">
                <Badge className="max-w-48" variant={label.color}>
                  <span className="truncate">{label.name}</span>
                </Badge>

                <Select
                  disabled={busy}
                  value={label.color}
                  onValueChange={(color) => save({ id: label.id, name: label.name, color: color as LabelColor })}
                >
                  <SelectTrigger
                    aria-label={t("Mailbox.workspace.labelColor", { name: label.name })}
                    className="ml-auto min-w-28"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {MAIL_LABEL_COLORS.map((color) => (
                      <SelectItem key={color} value={color}>
                        {colorName(color)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  aria-label={t("Mailbox.workspace.deleteLabel", { name: label.name })}
                  className="h-8"
                  disabled={busy}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => remove(label)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            aria-label={t("Mailbox.workspace.newLabelPlaceholder")}
            className="h-8 max-w-56"
            id={NEW_LABEL_FIELD_ID}
            maxLength={40}
            placeholder={t("Mailbox.workspace.newLabelPlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) save({ name: name.trim(), color: "secondary" });
            }}
          />

          <Button
            className="h-8"
            disabled={busy || name.trim().length === 0}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => save({ name: name.trim(), color: "secondary" })}
          >
            <Plus aria-hidden="true" className="size-3.5" />

            {t("Mailbox.workspace.addLabel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
