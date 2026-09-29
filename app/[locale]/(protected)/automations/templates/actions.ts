"use server";

import type {
  CreateMessageTemplateData,
  PreviewMessageTemplateData,
  UpdateMessageTemplateData,
} from "@/features/message-templates/message-template.schema";

import {
  getCreateMessageTemplateInteractor,
  getDeleteMessageTemplateInteractor,
  getGetMessageTemplatesInteractor,
  getPreviewMessageTemplateInteractor,
  getUpdateMessageTemplateInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getMessageTemplatesAction() {
  return serializeResult(getGetMessageTemplatesInteractor().invoke());
}

export async function createMessageTemplateAction(data: CreateMessageTemplateData) {
  return serializeResult(getCreateMessageTemplateInteractor().invoke(data));
}

export async function updateMessageTemplateAction(data: UpdateMessageTemplateData) {
  return serializeResult(getUpdateMessageTemplateInteractor().invoke(data));
}

export async function deleteMessageTemplateAction(id: string) {
  return serializeResult(getDeleteMessageTemplateInteractor().invoke({ id }));
}

export async function previewMessageTemplateAction(data: PreviewMessageTemplateData) {
  return serializeResult(getPreviewMessageTemplateInteractor().invoke(data));
}
