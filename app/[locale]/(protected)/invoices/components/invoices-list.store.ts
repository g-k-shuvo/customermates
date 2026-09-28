import type { InvoiceListDto } from "@/features/invoices/invoice.schema";
import type { InvoiceStatus } from "@/generated/prisma";

import { action, computed, makeObservable, observable } from "mobx";

import { getInvoicesAction } from "../actions";

export type InvoicesPageState = "loading" | "error" | "filtered-empty" | "true-empty" | "content";

export class InvoicesListStore {
  data: InvoiceListDto | null = null;
  status: InvoiceStatus | null = null;
  loadFailed = false;
  isLoading = false;

  constructor() {
    makeObservable(this, {
      data: observable.ref,
      status: observable,
      loadFailed: observable,
      isLoading: observable,
      pageState: computed,
      lastPage: computed,
      hydrate: action,
      setStatus: action,
      setLoading: action,
      setLoadFailed: action,
    });
  }

  get pageState(): InvoicesPageState {
    if (this.loadFailed) return "error";
    if (!this.data || this.isLoading) return "loading";
    if (this.data.items.length > 0) return "content";

    return this.status ? "filtered-empty" : "true-empty";
  }

  get lastPage(): number {
    return this.data ? Math.max(1, Math.ceil(this.data.total / this.data.pageSize)) : 1;
  }

  hydrate = (data: InvoiceListDto) => {
    this.data = data;
    this.loadFailed = false;
  };

  setStatus = (status: InvoiceStatus | null) => {
    this.status = status;
  };

  setLoading = (loading: boolean) => {
    this.isLoading = loading;
  };

  setLoadFailed = (failed: boolean) => {
    this.loadFailed = failed;
  };

  load = async (page = this.data?.page ?? 1) => {
    this.setLoading(true);
    try {
      const result = await getInvoicesAction({ page, ...(this.status ? { status: this.status } : {}) });
      if (result.ok) this.hydrate(result.data);
      else this.setLoadFailed(true);
    } finally {
      this.setLoading(false);
    }
  };

  filter = async (status: InvoiceStatus | null) => {
    this.setStatus(status);
    await this.load(1);
  };
}
