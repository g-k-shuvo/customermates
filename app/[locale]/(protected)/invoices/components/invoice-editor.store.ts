import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { InvoiceDto, InvoiceLineInput } from "@/features/invoices/invoice.schema";

import { action, computed, makeObservable } from "mobx";
import { Currency, Resource } from "@/generated/prisma";

import { updateInvoiceAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { invoiceTotals } from "@/features/invoices/invoice-totals";

type LineDraft = {
  description: string;
  quantity: number | undefined;
  unitPrice: number | undefined;
  discountPercent: number | undefined;
  taxRate: number | undefined;
  serviceId: string | null;
};

type InvoiceEditorForm = {
  buyerName: string;
  buyerAddress: string;
  buyerVatId: string;
  buyerEmail: string;
  currency: Currency;
  dueDate: string;
  notes: string;
  lines: LineDraft[];
};

const EMPTY_FORM: InvoiceEditorForm = {
  buyerName: "",
  buyerAddress: "",
  buyerVatId: "",
  buyerEmail: "",
  currency: Currency.eur,
  dueDate: "",
  notes: "",
  lines: [],
};

function formFor(invoice: InvoiceDto): InvoiceEditorForm {
  return {
    buyerName: invoice.buyerName,
    buyerAddress: invoice.buyerAddress,
    buyerVatId: invoice.buyerVatId ?? "",
    buyerEmail: invoice.buyerEmail ?? "",
    currency: invoice.currency,
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : "",
    notes: invoice.notes ?? "",
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      serviceId: line.serviceId,
    })),
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export class InvoiceEditorStore extends BaseFormStore<InvoiceEditorForm> {
  invoiceId = "";

  constructor(
    rootStore: RootStore,
    invoice: InvoiceDto,
    private readonly defaultTaxRate: number,
    private readonly onSaved: (invoice: InvoiceDto) => void,
  ) {
    super(rootStore, formFor(invoice), Resource.invoices);
    this.invoiceId = invoice.id;

    makeObservable(this, {
      totals: computed,
      load: action,
      addLine: action,
      removeLine: action,
    });
  }

  get totals() {
    return invoiceTotals(
      this.form.lines.map((line) => ({
        quantity: line.quantity ?? 0,
        unitPrice: line.unitPrice ?? 0,
        discountPercent: line.discountPercent ?? 0,
        taxRate: line.taxRate ?? 0,
      })),
    );
  }

  load = (invoice: InvoiceDto) => {
    this.invoiceId = invoice.id;
    this.form = { ...EMPTY_FORM, lines: [] };
    this.onInitOrRefresh(formFor(invoice));
  };

  addLine = () => {
    this.form.lines = [
      ...this.form.lines,
      {
        description: "",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        taxRate: this.defaultTaxRate,
        serviceId: null,
      },
    ];
  };

  removeLine = (index: number) => {
    this.form.lines = this.form.lines.filter((_, position) => position !== index);
  };

  save = async () => {
    this.setIsLoading(true);
    try {
      const lines: InvoiceLineInput[] = this.form.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity ?? 0,
        unitPrice: line.unitPrice ?? 0,
        discountPercent: line.discountPercent ?? 0,
        taxRate: line.taxRate ?? 0,
        serviceId: line.serviceId,
      }));
      const result = await updateInvoiceAction({
        id: this.invoiceId,
        buyerName: this.form.buyerName,
        buyerAddress: this.form.buyerAddress,
        buyerVatId: orNull(this.form.buyerVatId),
        buyerEmail: orNull(this.form.buyerEmail),
        currency: this.form.currency,
        dueDate: this.form.dueDate === "" ? null : new Date(this.form.dueDate),
        notes: orNull(this.form.notes),
        lines,
      });

      if (!result.ok) {
        this.setError(result.error);
        return false;
      }

      this.load(result.data);
      this.onSaved(result.data);
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await this.save();
  };
}
