import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { InvoiceSettingsDto } from "@/features/invoices/invoice.schema";

import { Resource } from "@/generated/prisma";

import { updateInvoiceSettingsAction } from "../../../invoices/actions";

import { BaseFormStore } from "@/core/base/base-form.store";

type InvoiceSettingsForm = {
  sellerName: string;
  sellerAddress: string;
  sellerVatId: string;
  sellerEmail: string;
  sellerPhone: string;
  bankDetails: string;
  footer: string;
  numberPrefix: string;
  nextNumber: number | undefined;
  paymentTermsDays: number | undefined;
  defaultTaxRate: number | undefined;
};

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function invoiceSettingsForm(settings: InvoiceSettingsDto): InvoiceSettingsForm {
  return {
    sellerName: settings.sellerName,
    sellerAddress: settings.sellerAddress,
    sellerVatId: settings.sellerVatId ?? "",
    sellerEmail: settings.sellerEmail ?? "",
    sellerPhone: settings.sellerPhone ?? "",
    bankDetails: settings.bankDetails ?? "",
    footer: settings.footer ?? "",
    numberPrefix: settings.numberPrefix,
    nextNumber: settings.nextNumber,
    paymentTermsDays: settings.paymentTermsDays,
    defaultTaxRate: settings.defaultTaxRate,
  };
}

export class InvoiceSettingsStore extends BaseFormStore<InvoiceSettingsForm> {
  constructor(rootStore: RootStore, initial: InvoiceSettingsForm) {
    super(rootStore, initial, Resource.company);
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);
    try {
      const result = await updateInvoiceSettingsAction({
        sellerName: this.form.sellerName,
        sellerAddress: this.form.sellerAddress,
        sellerVatId: orNull(this.form.sellerVatId),
        sellerEmail: orNull(this.form.sellerEmail),
        sellerPhone: orNull(this.form.sellerPhone),
        bankDetails: orNull(this.form.bankDetails),
        footer: orNull(this.form.footer),
        numberPrefix: this.form.numberPrefix,
        nextNumber: this.form.nextNumber ?? 1,
        paymentTermsDays: this.form.paymentTermsDays ?? 0,
        defaultTaxRate: this.form.defaultTaxRate ?? 0,
      });

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      this.onInitOrRefresh(invoiceSettingsForm(result.data));
      this.toastSuccess("Common.notifications.saved");
    } finally {
      this.setIsLoading(false);
    }
  };
}
