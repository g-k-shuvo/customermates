import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { WebFormFieldMapping } from "@/features/webform/ingest/field-mapping";
import type { WebFormSourceDto } from "@/features/webform/webform-source.schema";

import { action, makeObservable, observable, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import {
  createWebFormSourceAction,
  deleteWebFormSourceAction,
  rotateWebFormSecretAction,
  updateWebFormSourceAction,
} from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type WebFormSourceFormData = {
  id?: string;
  name: string;
  slug: string;
  active: boolean;
  defaultLabels: string[];
  fieldMapping: WebFormFieldMapping;
};

export const EMPTY_WEB_FORM_SOURCE: WebFormSourceFormData = {
  name: "",
  slug: "",
  active: true,
  defaultLabels: [],
  fieldMapping: {},
};

export class WebFormSourceModalStore extends BaseModalStore<WebFormSourceFormData> {
  revealedSecret: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_WEB_FORM_SOURCE, Resource.leads);

    makeObservable(this, {
      revealedSecret: observable,

      setRevealedSecret: action,
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

  openForSource = (source: WebFormSourceDto) => {
    this.setRevealedSecret(null);
    this.openWith({
      id: source.id,
      name: source.name,
      slug: source.slug,
      active: source.active,
      defaultLabels: [...source.defaultLabels],
      fieldMapping: { ...source.fieldMapping },
    });
  };

  openForCreate = () => {
    this.setRevealedSecret(null);
    this.openWith(EMPTY_WEB_FORM_SOURCE);
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
    this.setIsLoading(true);

    try {
      const form = toJS(this.form);
      const sourceId = form.id;

      if (sourceId) {
        const updated = await updateWebFormSourceAction({
          id: sourceId,
          name: form.name,
          active: form.active,
          defaultLabels: form.defaultLabels,
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
