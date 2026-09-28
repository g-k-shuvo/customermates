"use client";

import type { KeyboardEvent } from "react";
import type { BillingProfileDto } from "@/features/invoices/invoice.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getBillingProfileAction, upsertBillingProfileAction } from "@/app/[locale]/(protected)/invoices/actions";
import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Draft = { legalName: string; address: string; vatId: string; email: string };

const draftFor = (profile: BillingProfileDto): Draft => ({
  legalName: profile.legalName,
  address: profile.address,
  vatId: profile.vatId ?? "",
  email: profile.email ?? "",
});

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function OrganizationBillingProfile({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const t = useTranslations();
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    runUserAction(async () => {
      const result = await getBillingProfileAction(organizationId);
      if (!result.ok) return;

      setSaved(draftFor(result.data));
      setDraft(draftFor(result.data));
    });
  }, [organizationId]);

  if (!draft || !saved) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const field = (key: keyof Draft) => ({
    id: `billing-${key}`,
    readOnly: !canEdit,
    value: draft[key],
    onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value }),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      if (canEdit && dirty) runUserAction(save);
    },
  });

  const save = async () => {
    setIsSaving(true);
    try {
      const result = await upsertBillingProfileAction({
        organizationId,
        legalName: draft.legalName,
        address: draft.address,
        vatId: orNull(draft.vatId),
        email: orNull(draft.email),
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      setSaved(draftFor(result.data));
      setDraft(draftFor(result.data));
      toast.success(t("Invoices.billing.saved"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="billing-profile-title"
      className="flex flex-col gap-3 border-b p-4"
      data-billing-profile=""
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold" id="billing-profile-title">
          {t("Invoices.billing.title")}
        </h3>

        <p className="text-xs text-muted-foreground">{t("Invoices.billing.description")}</p>
      </div>

      <div className="space-y-1.5">
        <FormLabel htmlFor="billing-legalName">{t("Invoices.billing.legalName")}</FormLabel>

        <Input maxLength={200} {...field("legalName")} />
      </div>

      <div className="space-y-1.5">
        <FormLabel htmlFor="billing-address">{t("Invoices.billing.address")}</FormLabel>

        <Textarea maxLength={1000} rows={3} {...field("address")} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FormLabel htmlFor="billing-vatId">{t("Invoices.billing.vatId")}</FormLabel>

          <Input maxLength={64} {...field("vatId")} />
        </div>

        <div className="space-y-1.5">
          <FormLabel htmlFor="billing-email">{t("Invoices.billing.email")}</FormLabel>

          <Input type="email" {...field("email")} />
        </div>
      </div>

      {canEdit && dirty && (
        <div className="flex justify-end gap-2">
          <Button size="sm" type="button" variant="secondary" onClick={() => setDraft(saved)}>
            {t("Invoices.billing.reset")}
          </Button>

          <Button disabled={isSaving} size="sm" type="button" onClick={() => runUserAction(save)}>
            {t("Invoices.billing.save")}
          </Button>
        </div>
      )}
    </section>
  );
}
