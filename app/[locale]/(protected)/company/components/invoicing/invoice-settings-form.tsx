"use client";

import type { InvoiceSettingsDto } from "@/features/invoices/invoice.schema";

import { observer } from "mobx-react-lite";
import { useEffect, useId, useMemo } from "react";
import { useTranslations } from "next-intl";

import { InvoiceSettingsStore, invoiceSettingsForm } from "./invoice-settings.store";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { formatInvoiceNumber } from "@/features/invoices/invoice-totals";

export const InvoiceSettingsForm = observer(({ settings }: { settings: InvoiceSettingsDto }) => {
  const t = useTranslations();
  const formId = useId();
  const rootStore = useRootStore();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- seeded once; later settings arrive through the effect below
  const store = useMemo(() => new InvoiceSettingsStore(rootStore, invoiceSettingsForm(settings)), [rootStore]);

  useEffect(() => store.onInitOrRefresh(invoiceSettingsForm(settings)), [store, settings]);

  const topBarActions = useMemo(
    () => <FormActions anchorScope="invoice-settings" formId={formId} store={store} variant="topbar" />,
    [formId, store],
  );
  useSetTopBarActions(topBarActions);

  return (
    <AppForm id={formId} store={store} onSubmit={(event) => store.onSubmit(event)}>
      <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-6 motion-reduce:animate-none">
        <section aria-labelledby="invoice-seller-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium" id="invoice-seller-title">
              {t("InvoiceSettings.sellerTitle")}
            </h2>

            <p className="text-subdued text-xs">{t("InvoiceSettings.sellerDescription")}</p>
          </div>

          <FormInput required id="sellerName" label={t("InvoiceSettings.sellerName")} maxLength={200} />

          <FormTextarea
            required
            id="sellerAddress"
            label={t("InvoiceSettings.sellerAddress")}
            maxLength={1000}
            rows={3}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput id="sellerVatId" label={t("InvoiceSettings.sellerVatId")} maxLength={64} />

            <FormInput id="sellerEmail" label={t("InvoiceSettings.sellerEmail")} type="email" />

            <FormInput id="sellerPhone" label={t("InvoiceSettings.sellerPhone")} maxLength={40} type="tel" />
          </div>

          <FormTextarea id="bankDetails" label={t("InvoiceSettings.bankDetails")} maxLength={1000} rows={2} />

          <FormTextarea id="footer" label={t("InvoiceSettings.footer")} maxLength={1000} rows={2} />
        </section>

        <div className="border-t border-border" />

        <section aria-labelledby="invoice-numbering-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium" id="invoice-numbering-title">
              {t("InvoiceSettings.numberingTitle")}
            </h2>

            <p className="text-subdued text-xs" data-invoice-next-number-preview="">
              {t("InvoiceSettings.numberingPreview", {
                number: formatInvoiceNumber(store.form.numberPrefix, store.form.nextNumber ?? 1),
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput id="numberPrefix" label={t("InvoiceSettings.numberPrefix")} maxLength={20} />

            <FormNumberInput id="nextNumber" label={t("InvoiceSettings.nextNumber")} />

            <FormNumberInput id="paymentTermsDays" label={t("InvoiceSettings.paymentTermsDays")} />

            <FormNumberInput id="defaultTaxRate" label={t("InvoiceSettings.defaultTaxRate")} />
          </div>
        </section>
      </div>
    </AppForm>
  );
});
