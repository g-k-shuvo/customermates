import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { WebFormFieldMapping } from "@/features/webform/ingest/field-mapping";
import type { WebFormSourceDto } from "@/features/webform/webform-source.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, makeObservable, observable, toJS } from "mobx";
import { CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import {
  createWebFormSourceAction,
  deleteWebFormSourceAction,
  rotateWebFormSecretAction,
  updateWebFormSourceAction,
} from "../../actions";

import { getCustomColumnsByEntityTypeAction } from "@/app/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

export type WebFormSourceFormData = {
  id?: string;
  name: string;
  slug: string;
  active: boolean;
  defaultLabels: string[];
  dedupeLeads: boolean;
  fieldMapping: WebFormFieldMapping;
};

const MAPPING_PATH_KEYS = [
  "firstName",
  "lastName",
  "email",
  "organizationName",
  "message",
  "value",
  "titleTemplate",
] as const;

export function withEveryMappingKey(mapping: WebFormFieldMapping): WebFormFieldMapping {
  const keys = Object.fromEntries(MAPPING_PATH_KEYS.map((key) => [key, undefined]));

  return { ...keys, ...mapping, customFields: [...(mapping.customFields ?? [])] };
}

export const EMPTY_WEB_FORM_SOURCE: WebFormSourceFormData = {
  name: "",
  slug: "",
  active: true,
  defaultLabels: [],
  dedupeLeads: false,
  fieldMapping: {},
};

export function adoptLegacyPhoneMapping(
  mapping: WebFormFieldMapping,
  columns: readonly CustomColumnDto[],
): WebFormFieldMapping {
  const { phone, ...rest } = mapping;
  const path = phone?.trim();
  if (!path) return rest;

  const rows = rest.customFields ?? [];
  if (rows.some((row) => row.path === path)) return rest;

  const phoneColumns = columns.filter((column) => column.type === CustomColumnType.phone);

  return { ...rest, customFields: [...rows, { path, columnId: phoneColumns.length === 1 ? phoneColumns[0].id : "" }] };
}

export class WebFormSourceModalStore extends BaseModalStore<WebFormSourceFormData> {
  revealedSecret: string | null = null;
  mappableColumns: CustomColumnDto[] = [];

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_WEB_FORM_SOURCE, Resource.leads);

    makeObservable(this, {
      revealedSecret: observable,
      mappableColumns: observable,

      setRevealedSecret: action,
      setMappableColumns: action,
      addCustomField: action,
      removeCustomField: action,
      delete: action,
      rotateSecret: action,
      onSubmit: action,
    });
  }

  get isEditing(): boolean {
    return Boolean(this.form.id);
  }

  setRevealedSecret = (secret: string | null) => {
    this.revealedSecret = secret;
  };

  setMappableColumns = (columns: CustomColumnDto[]) => {
    this.mappableColumns = columns;
  };

  loadMappableColumns = async (): Promise<void> => {
    const [leadColumns, contactColumns] = await Promise.all([
      getCustomColumnsByEntityTypeAction({ entityType: EntityType.lead }),
      getCustomColumnsByEntityTypeAction({ entityType: EntityType.contact }),
    ]);
    this.setMappableColumns(
      [...leadColumns, ...contactColumns].filter((column) => column.type !== CustomColumnType.relation),
    );

    if (this.form.fieldMapping.phone?.trim()) {
      this.onChange(
        "fieldMapping",
        withEveryMappingKey(adoptLegacyPhoneMapping(this.form.fieldMapping, this.mappableColumns)),
      );
    }
  };

  addCustomField = () => {
    this.onChange("fieldMapping.customFields", [
      ...(this.form.fieldMapping.customFields ?? []),
      { path: "", columnId: "" },
    ]);
  };

  removeCustomField = (index: number) => {
    this.onChange(
      "fieldMapping.customFields",
      (this.form.fieldMapping.customFields ?? []).filter((_row, position) => position !== index),
    );
  };

  openForSource = (source: WebFormSourceDto) => {
    this.setRevealedSecret(null);
    this.openWith({
      id: source.id,
      name: source.name,
      slug: source.slug,
      active: source.active,
      defaultLabels: [...source.defaultLabels],
      dedupeLeads: source.dedupeLeads,
      fieldMapping: withEveryMappingKey(source.fieldMapping),
    });
    void this.loadMappableColumns().catch(reportApplicationError);
  };

  openForCreate = () => {
    this.setRevealedSecret(null);
    this.openWith({ ...EMPTY_WEB_FORM_SOURCE, fieldMapping: withEveryMappingKey({}) });
    void this.loadMappableColumns().catch(reportApplicationError);
  };

  delete = async (): Promise<boolean> => {
    if (!this.form.id) return false;

    this.setIsLoading(true);

    try {
      const res = await deleteWebFormSourceAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.webFormSourcesStore.removeItem(res.data);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  rotateSecret = async (): Promise<boolean> => {
    if (!this.form.id) return false;

    this.setIsLoading(true);

    try {
      const res = await rotateWebFormSecretAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      this.setRevealedSecret(res.data.signingSecret);
      await this.rootStore.webFormSourcesStore.refresh();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const draft = toJS(this.form);
    const customFields = (draft.fieldMapping.customFields ?? []).filter(
      (row) => row.path.trim() !== "" || row.columnId !== "",
    );
    if (customFields.some((row) => row.path.trim() === "" || row.columnId === "")) {
      this.toastError("WebFormSourceModal.customFieldIncomplete");
      return;
    }

    this.setIsLoading(true);

    try {
      const mapping: WebFormFieldMapping = { ...draft.fieldMapping, customFields };
      delete mapping.phone;
      const form = { ...draft, fieldMapping: mapping };
      const sourceId = form.id;

      if (sourceId) {
        const updated = await updateWebFormSourceAction({
          id: sourceId,
          name: form.name,
          active: form.active,
          defaultLabels: form.defaultLabels,
          dedupeLeads: form.dedupeLeads,
          fieldMapping: form.fieldMapping,
        });

        if (!updated.ok) {
          toastZodErrorTree(updated.error);
          return;
        }

        await this.rootStore.webFormSourcesStore.refresh();
        this.close();
        return;
      }

      const created = await createWebFormSourceAction({
        name: form.name,
        slug: form.slug,
        active: form.active,
        defaultLabels: form.defaultLabels,
        dedupeLeads: form.dedupeLeads,
        fieldMapping: form.fieldMapping,
      });

      if (!created.ok) {
        toastZodErrorTree(created.error);
        return;
      }

      await this.rootStore.webFormSourcesStore.refresh();
      this.setRevealedSecret(created.data.signingSecret);
      this.onInitOrRefresh({ ...form, id: created.data.id });
    } finally {
      this.setIsLoading(false);
    }
  };
}
