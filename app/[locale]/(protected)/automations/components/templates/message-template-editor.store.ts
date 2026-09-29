import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type {
  MessageTemplateDto,
  MessageTemplatePreviewDto,
} from "@/features/message-templates/message-template.schema";
import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { action, makeObservable, observable } from "mobx";
import { EntityType, MessageKind, Resource } from "@/generated/prisma";

import {
  createMessageTemplateAction,
  previewMessageTemplateAction,
  updateMessageTemplateAction,
} from "../../templates/actions";

import { BaseFormStore } from "@/core/base/base-form.store";

type TemplateForm = {
  name: string;
  kind: MessageKind;
  subject: string;
  bodyMarkdown: string;
  bannerUrl: string;
  previewEntityType: RelationTargetEntityType;
  previewRecordId: string;
};

export type PreviewState =
  | { status: "idle" }
  | { status: "ready"; preview: MessageTemplatePreviewDto }
  | { status: "refused"; message: string };

const EMPTY: TemplateForm = {
  name: "",
  kind: MessageKind.transactional,
  subject: "",
  bodyMarkdown: "",
  bannerUrl: "",
  previewEntityType: EntityType.deal,
  previewRecordId: "",
};

function firstMessage(tree: unknown): string {
  const node = tree as { errors?: string[]; properties?: Record<string, unknown> };
  if (node?.errors?.[0]) return node.errors[0];

  for (const child of Object.values(node?.properties ?? {})) {
    const message = firstMessage(child);
    if (message) return message;
  }

  return "";
}

export class MessageTemplateEditorStore extends BaseFormStore<TemplateForm> {
  templateId: string | null = null;
  preview: PreviewState = { status: "idle" };

  constructor(
    rootStore: RootStore,
    private readonly onSaved: (template: MessageTemplateDto) => void,
  ) {
    super(rootStore, EMPTY, Resource.automations);

    makeObservable(this, { templateId: observable, preview: observable.ref, open: action, setPreview: action });
  }

  open = (template: MessageTemplateDto | null) => {
    this.templateId = template?.id ?? null;
    this.form = { ...EMPTY };
    this.onInitOrRefresh(
      template
        ? {
            ...EMPTY,
            name: template.name,
            kind: template.kind,
            subject: template.subject,
            bodyMarkdown: template.bodyMarkdown,
            bannerUrl: template.bannerUrl ?? "",
          }
        : EMPTY,
    );
    this.preview = { status: "idle" };
  };

  setPreview = (preview: PreviewState) => {
    this.preview = preview;
  };

  insertField = (field: string, selectionStart: number, selectionEnd: number) => {
    const body = this.form.bodyMarkdown;
    this.onChange("bodyMarkdown", `${body.slice(0, selectionStart)}{{ ${field} }}${body.slice(selectionEnd)}`);
  };

  refreshPreview = async () => {
    if (this.form.subject.trim() === "" && this.form.bodyMarkdown.trim() === "") {
      this.setPreview({ status: "idle" });
      return;
    }

    const result = await previewMessageTemplateAction({
      subject: this.form.subject,
      bodyMarkdown: this.form.bodyMarkdown,
      bannerUrl: this.form.bannerUrl.trim() || null,
      record: this.form.previewRecordId
        ? { entityType: this.form.previewEntityType, entityId: this.form.previewRecordId }
        : null,
    });

    this.setPreview(
      result.ok
        ? { status: "ready", preview: result.data }
        : { status: "refused", message: firstMessage(result.error) },
    );
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);
    try {
      const fields = {
        name: this.form.name,
        kind: this.form.kind,
        subject: this.form.subject,
        bodyMarkdown: this.form.bodyMarkdown,
        bannerUrl: this.form.bannerUrl.trim() || null,
      };
      const result = this.templateId
        ? await updateMessageTemplateAction({ id: this.templateId, ...fields })
        : await createMessageTemplateAction(fields);

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      this.open(result.data);
      this.onSaved(result.data);
    } finally {
      this.setIsLoading(false);
    }
  };
}
