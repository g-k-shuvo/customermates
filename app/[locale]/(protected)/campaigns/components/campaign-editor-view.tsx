"use client";

import type { CampaignDto } from "@/features/campaigns/campaign.schema";

import { Send, Square, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, Resource } from "@/generated/prisma";

import { deleteCampaignAction } from "../actions";

import { AudienceEditor } from "./audience-editor";
import { CAMPAIGN_POLL_MS, CampaignEditorStore } from "./campaign-editor.store";
import { CampaignStatusBadge } from "./campaign-status-badge";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { MERGE_FIELDS } from "@/features/messaging-send/render/merge-fields";
import { useRouter } from "@/i18n/navigation";

const COMPANY_SENDER = "__company__";

export const CampaignEditorView = observer(({ initial }: { initial: CampaignDto }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const { layoutStore, userStore } = useRootStore();
  const [store] = useState(() => new CampaignEditorStore(initial));
  const [confirm, setConfirm] = useState<"send" | "delete" | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const canWrite = userStore.can(Resource.campaigns, Action.update);
  const editable = canWrite && store.isDraft;
  const campaign = store.campaign;

  useEffect(() => {
    layoutStore.setRuntimeIdentity({
      scope: "entity",
      key: "campaign",
      title: campaign.name,
      pictureUrl: null,
      avatarKind: null,
    });

    return () => layoutStore.clearRuntimeIdentity("entity", "campaign");
  }, [layoutStore, campaign.name]);

  useEffect(() => {
    void store.loadOptions().catch(reportApplicationError);
    void store.loadRecipients(1).catch(reportApplicationError);
  }, [store]);

  useEffect(() => {
    if (!store.isSending) return;

    const timer = setInterval(() => void store.refresh().catch(reportApplicationError), CAMPAIGN_POLL_MS);

    return () => clearInterval(timer);
  }, [store, store.isSending]);

  const insertField = (field: string) => {
    const element = bodyRef.current;
    const start = element?.selectionStart ?? store.bodyMarkdown.length;
    const end = element?.selectionEnd ?? store.bodyMarkdown.length;
    store.setField(
      "bodyMarkdown",
      `${store.bodyMarkdown.slice(0, start)}{{ ${field} }}${store.bodyMarkdown.slice(end)}`,
    );
  };

  const send = () =>
    runUserAction(async () => {
      if (confirm !== "send") {
        setConfirm("send");
        return;
      }

      setConfirm(null);
      await store.send();
    });

  const remove = () =>
    runUserAction(async () => {
      if (confirm !== "delete") {
        setConfirm("delete");
        return;
      }

      const result = await deleteCampaignAction(campaign.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      router.push("/campaigns");
    });

  const recipients = store.recipients;
  const lastPage = recipients ? Math.max(1, Math.ceil(recipients.total / recipients.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" data-campaign-editor={campaign.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <AppLink className="text-sm text-muted-foreground" href="/campaigns">
            {t("Campaigns.back")}
          </AppLink>

          <div className="flex items-center gap-2">
            <h1 className="text-x-lg font-semibold">{campaign.name}</h1>

            <CampaignStatusBadge status={campaign.status} />
          </div>
        </div>

        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            {store.isDraft ? (
              <>
                <Button id="campaign-delete" size="sm" type="button" variant="ghost" onClick={remove}>
                  <Trash2 className="size-4" />

                  {confirm === "delete" ? t("Campaigns.confirmDelete") : t("Campaigns.delete")}
                </Button>

                <Button
                  disabled={store.isBusy}
                  id="campaign-save"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => runUserAction(() => store.save())}
                >
                  {t("Common.actions.save")}
                </Button>

                <Button disabled={store.isBusy} id="campaign-send" size="sm" type="button" onClick={send}>
                  <Send className="size-4" />

                  {confirm === "send" ? t("Campaigns.confirmSend") : t("Campaigns.send")}
                </Button>
              </>
            ) : null}

            {store.isSending ? (
              <Button
                disabled={store.isBusy}
                id="campaign-cancel"
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => runUserAction(() => store.cancel())}
              >
                <Square className="size-4" />

                {t("Campaigns.cancel")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!store.isDraft ? (
        <p className="text-sm" data-campaign-progress="">
          {t("Campaigns.progress", {
            sent: intlStore.formatNumber(campaign.sentCount),
            suppressed: intlStore.formatNumber(campaign.suppressedCount),
            failed: intlStore.formatNumber(campaign.failedCount),
            pending: intlStore.formatNumber(campaign.pendingCount),
          })}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-name">{t("Campaigns.fields.name")}</Label>

            <Input
              disabled={!editable}
              id="campaign-name"
              value={store.name}
              onChange={(event) => store.setField("name", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-sender">{t("Campaigns.fields.sender")}</Label>

            <Select
              disabled={!editable}
              value={store.senderUserId ?? COMPANY_SENDER}
              onValueChange={(value) => store.setField("senderUserId", value === COMPANY_SENDER ? null : value)}
            >
              <SelectTrigger id="campaign-sender">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value={COMPANY_SENDER}>{t("Campaigns.fields.companySender")}</SelectItem>

                {store.options.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-subject">{t("Campaigns.fields.subject")}</Label>

          <Input
            disabled={!editable}
            id="campaign-subject"
            value={store.subject}
            onChange={(event) => store.setField("subject", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-banner">{t("EmailContent.bannerLabel")}</Label>

          <Input
            disabled={!editable}
            id="campaign-banner"
            inputMode="url"
            placeholder={t("EmailContent.bannerPlaceholder")}
            value={store.bannerUrl}
            onChange={(event) => store.setField("bannerUrl", event.target.value)}
          />

          <p className="text-xs text-muted-foreground">{t("EmailContent.bannerHint")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-body">{t("Campaigns.fields.body")}</Label>

          <Textarea
            ref={bodyRef}
            disabled={!editable}
            id="campaign-body"
            rows={10}
            value={store.bodyMarkdown}
            onChange={(event) => store.setField("bodyMarkdown", event.target.value)}
          />

          {editable ? (
            <div className="flex flex-wrap items-center gap-1" data-merge-fields="">
              <span className="text-xs text-muted-foreground">{t("MessageTemplates.insertField")}</span>

              {MERGE_FIELDS.map((field) => (
                <Button key={field} size="sm" type="button" variant="secondary" onClick={() => insertField(field)}>
                  {field}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <AudienceEditor disabled={!editable} store={store} />

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4" data-campaign-compliance="">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{t("Campaigns.compliance.title")}</h2>

          <p className="text-xs text-muted-foreground">{t("Campaigns.compliance.help")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-lawful-basis">{t("Campaigns.compliance.lawfulBasis")}</Label>

          <Textarea
            disabled={!editable}
            id="campaign-lawful-basis"
            placeholder={t("Campaigns.compliance.lawfulBasisPlaceholder")}
            rows={3}
            value={store.lawfulBasis}
            onChange={(event) => store.setField("lawfulBasis", event.target.value)}
          />
        </div>
      </section>

      {recipients && recipients.items.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {t("Campaigns.recipients", { count: intlStore.formatNumber(recipients.total) })}
          </h2>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table data-campaign-recipients="">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Campaigns.columns.email")}</TableHead>

                  <TableHead>{t("Campaigns.columns.status")}</TableHead>

                  <TableHead>{t("Campaigns.columns.updated")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {recipients.items.map((recipient) => (
                  <TableRow key={recipient.contactId}>
                    <TableCell>
                      <AppLink href={`/contacts/${recipient.contactId}`}>
                        {recipient.email || t("Campaigns.redacted")}
                      </AppLink>
                    </TableCell>

                    <TableCell>{t(`Campaigns.recipientStatus.${recipient.status}`)}</TableCell>

                    <TableCell>{intlStore.formatNumericalShortDateTime(recipient.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {lastPage > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                {t("Campaigns.page", { page: recipients.page, pages: lastPage })}
              </span>

              <Button
                disabled={recipients.page <= 1}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.loadRecipients(recipients.page - 1))}
              >
                {t("Campaigns.previous")}
              </Button>

              <Button
                disabled={recipients.page >= lastPage}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.loadRecipients(recipients.page + 1))}
              >
                {t("Campaigns.next")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
});
