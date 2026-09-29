"use client";

import type { MessageTemplateDto } from "@/features/message-templates/message-template.schema";
import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { ArrowLeft, FileText, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Action, EntityType, MessageKind, Resource } from "@/generated/prisma";

import { deleteMessageTemplateAction } from "../../templates/actions";

import { MessageTemplateEditorStore } from "./message-template-editor.store";
import { MessageTemplatesPageSkeleton } from "./message-templates-page-skeleton";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { RelationFieldEditor } from "@/components/data-view/custom-columns/relation-field-editor";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { MERGE_FIELDS } from "@/features/messaging-send/render/merge-fields";

const BODY_ID = "bodyMarkdown";
const PREVIEW_DELAY_MS = 400;
const PREVIEW_TARGETS: RelationTargetEntityType[] = [EntityType.deal, EntityType.contact, EntityType.organization];

type Props = { initialTemplates: MessageTemplateDto[] };

export const MessageTemplatesPageView = observer(({ initialTemplates }: Props) => {
  const t = useTranslations();
  const formId = useId();
  const rootStore = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { singular } = useEntityTerminology();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [editing, setEditing] = useState(initialTemplates.length > 0);
  const onSaved = useRef<(saved: MessageTemplateDto) => void>(() => undefined);
  onSaved.current = (saved) => {
    setTemplates((current) =>
      [...current.filter((entry) => entry.id !== saved.id), saved].sort((left, right) =>
        intlStore.collator.compare(left.name, right.name),
      ),
    );
    setSelectedId(saved.id);
    toast.success(t("MessageTemplates.saved"));
  };
  const [store] = useState(() => new MessageTemplateEditorStore(rootStore, (saved) => onSaved.current(saved)));
  const canWrite = rootStore.userStore.can(Resource.automations, Action.update);
  const previewKey = `${store.form.subject}\u0000${store.form.bodyMarkdown}\u0000${store.form.bannerUrl}\u0000${store.form.previewEntityType}\u0000${store.form.previewRecordId}`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const template = templates.find((entry) => entry.id === selectedId) ?? null;
    if (editing) store.open(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopen only when the selection changes, not after every save
  }, [selectedId, editing]);

  useEffect(() => {
    if (!editing) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runUserAction(store.refreshPreview), PREVIEW_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [store, previewKey, editing]);

  const startNew = () => {
    setSelectedId(null);
    setEditing(true);
    store.open(null);
  };

  const remove = () => {
    const id = store.templateId;
    if (!id) return;

    showDeleteConfirmation(async () => {
      const result = await deleteMessageTemplateAction(id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      const rest = templates.filter((entry) => entry.id !== id);
      setTemplates(rest);
      setSelectedId(rest[0]?.id ?? null);
      setEditing(rest.length > 0);
      return true;
    }, store.form.name);
  };

  const insertField = (field: string) => {
    const textarea = document.getElementById(BODY_ID) as HTMLTextAreaElement | null;
    const start = textarea?.selectionStart ?? store.form.bodyMarkdown.length;
    const end = textarea?.selectionEnd ?? start;
    store.insertField(field, start, end);
    requestAnimationFrame(() => textarea?.focus());
  };

  const kindItems = [
    { value: MessageKind.transactional, label: t("MessageTemplates.kind.transactional") },
    { value: MessageKind.marketing, label: t("MessageTemplates.kind.marketing") },
  ];
  const targetItems = PREVIEW_TARGETS.map((entityType) => ({ value: entityType, label: singular(entityType) }));
  const preview = store.preview;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <AppLink className="flex w-fit items-center gap-1 text-sm text-muted-foreground" href="/automations">
        <ArrowLeft aria-hidden className="size-4" />

        {t("Automations.title")}
      </AppLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{t("MessageTemplates.title")}</h1>

          <p className="max-w-2xl text-sm text-muted-foreground">{t("MessageTemplates.description")}</p>
        </div>

        {canWrite && (
          <Button id="message-templates-add" size="sm" onClick={startNew}>
            <Plus aria-hidden className="size-4" />

            {t("MessageTemplates.create")}
          </Button>
        )}
      </div>

      {!editing ? (
        <PageState
          action={
            canWrite ? (
              <Button size="sm" onClick={startNew}>
                {t("MessageTemplates.create")}
              </Button>
            ) : undefined
          }
          background={<MessageTemplatesPageSkeleton />}
          description={t("MessageTemplates.emptyDescription")}
          icon={FileText}
          state="empty"
          title={t("MessageTemplates.emptyTitle")}
        />
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]">
          <ul aria-label={t("MessageTemplates.listLabel")} className="flex flex-col gap-1" data-message-templates="">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  aria-current={template.id === selectedId ? "true" : undefined}
                  className="flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent aria-[current=true]:border-primary aria-[current=true]:bg-accent"
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                >
                  <span className="w-full truncate font-medium">{template.name}</span>

                  <Badge variant={template.kind === MessageKind.marketing ? "info" : "secondary"}>
                    {template.kind === MessageKind.marketing
                      ? t("MessageTemplates.kind.marketing")
                      : t("MessageTemplates.kind.transactional")}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>

          <AppForm
            className="flex flex-col gap-3"
            id={formId}
            store={store}
            onSubmit={(event) => store.onSubmit(event)}
          >
            <FormInput required id="name" label={t("MessageTemplates.fields.name")} maxLength={120} />

            <FormSelect
              required
              description={
                store.form.kind === MessageKind.marketing
                  ? t("MessageTemplates.kind.marketingHint")
                  : t("MessageTemplates.kind.transactionalHint")
              }
              id="kind"
              items={kindItems}
              label={t("MessageTemplates.fields.kind")}
            />

            <FormInput required id="subject" label={t("MessageTemplates.fields.subject")} maxLength={300} />

            <FormInput
              description={t("EmailContent.bannerHint")}
              id="bannerUrl"
              inputMode="url"
              label={t("EmailContent.bannerLabel")}
              maxLength={2048}
              placeholder={t("EmailContent.bannerPlaceholder")}
            />

            <FormTextarea required id={BODY_ID} label={t("MessageTemplates.fields.body")} rows={12} />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t("MessageTemplates.insertField")}</span>

              <div className="flex flex-wrap gap-1" data-merge-fields="">
                {MERGE_FIELDS.map((field) => (
                  <Button
                    key={field}
                    disabled={!canWrite}
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => insertField(field)}
                  >
                    {field}
                  </Button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">{t("MessageTemplates.fallbackHint")}</p>
            </div>

            {canWrite && (
              <div className="flex flex-wrap justify-end gap-2">
                {store.templateId && (
                  <Button size="sm" type="button" variant="secondary" onClick={remove}>
                    {t("Common.actions.delete")}
                  </Button>
                )}

                <Button disabled={store.isLoading || !store.hasUnsavedChanges} size="sm" type="submit">
                  {t("Common.actions.save")}
                </Button>
              </div>
            )}
          </AppForm>

          <section aria-labelledby="template-preview-title" className="flex min-h-0 flex-col gap-3">
            <h2 className="text-sm font-semibold" id="template-preview-title">
              {t("MessageTemplates.preview.title")}
            </h2>

            <AppForm className="grid grid-cols-1 gap-2 sm:grid-cols-2" store={store}>
              <FormSelect id="previewEntityType" items={targetItems} label={t("MessageTemplates.preview.recordType")} />

              <RelationFieldEditor
                id="previewRecordId"
                label={t("MessageTemplates.preview.record")}
                targetEntityType={store.form.previewEntityType}
                value={store.form.previewRecordId || undefined}
              />
            </AppForm>

            {preview.status === "refused" ? (
              <p
                className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
                data-template-preview-refused=""
              >
                {preview.message}
              </p>
            ) : preview.status === "ready" ? (
              <div className="flex min-h-0 flex-col gap-2 rounded-md border p-3" data-template-preview="">
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("MessageTemplates.preview.subject")} </span>

                  <span className="font-medium" data-template-preview-subject="">
                    {preview.preview.subject}
                  </span>
                </p>

                <iframe
                  className="min-h-72 w-full rounded border bg-white"
                  sandbox=""
                  srcDoc={preview.preview.html}
                  title={t("MessageTemplates.preview.title")}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("MessageTemplates.preview.empty")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
});
