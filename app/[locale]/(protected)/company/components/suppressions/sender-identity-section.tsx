"use client";

import type { SenderIdentityDto } from "@/features/messaging-send/sender/sender-identity.interactor";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Action, Resource } from "@/generated/prisma";

import { getSenderIdentityAction, saveSenderIdentityAction, verifySenderDomainAction } from "../../messaging-actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Draft = { fromName: string; fromAddress: string; replyTo: string; allowUserSenders: boolean };

const draftOf = (identity: SenderIdentityDto): Draft => ({
  fromName: identity.fromName,
  fromAddress: identity.fromAddress,
  replyTo: identity.replyTo ?? "",
  allowUserSenders: identity.allowUserSenders,
});

export const SenderIdentitySection = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { userStore } = useRootStore();
  const canEdit = userStore.can(Resource.company, Action.update);
  const [identity, setIdentity] = useState<SenderIdentityDto | null>(null);
  const [draft, setDraft] = useState<Draft>({ fromName: "", fromAddress: "", replyTo: "", allowUserSenders: false });
  const [busy, setBusy] = useState(false);

  const apply = (next: SenderIdentityDto) => {
    setIdentity(next);
    setDraft(draftOf(next));
  };

  useEffect(() => {
    runUserAction(async () => {
      const result = await getSenderIdentityAction();
      if (result.ok) apply(result.data);
    });
  }, []);

  const run = (work: () => Promise<void>) =>
    runUserAction(async () => {
      setBusy(true);
      try {
        await work();
      } finally {
        setBusy(false);
      }
    });

  const save = () =>
    run(async () => {
      const result = await saveSenderIdentityAction({
        fromName: draft.fromName.trim(),
        fromAddress: draft.fromAddress.trim(),
        replyTo: draft.replyTo.trim() || null,
        allowUserSenders: draft.allowUserSenders,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      apply(result.data);
      toast.success(t("SenderIdentity.saved"));
    });

  const verify = () =>
    run(async () => {
      const result = await verifySenderDomainAction();
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      apply(result.data);
      toast.success(t("SenderIdentity.verifiedToast"));
    });

  if (!identity) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(identity));
  const record = identity.verificationRecord;

  return (
    <section aria-labelledby="sender-identity-title" className="flex flex-col gap-3" data-sender-identity="">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium" id="sender-identity-title">
            {t("SenderIdentity.title")}
          </h2>

          {identity.configured && (
            <Badge data-sender-verified={identity.verified} variant={identity.verified ? "success" : "warning"}>
              {identity.verified ? t("SenderIdentity.verified") : t("SenderIdentity.unverified")}
            </Badge>
          )}
        </div>

        <p className="text-subdued text-xs">{t("SenderIdentity.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="sender-from-name">{t("SenderIdentity.fromName")}</Label>

          <Input
            disabled={!canEdit}
            id="sender-from-name"
            maxLength={120}
            value={draft.fromName}
            onChange={(event) => setDraft({ ...draft, fromName: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sender-from-address">{t("SenderIdentity.fromAddress")}</Label>

          <Input
            disabled={!canEdit}
            id="sender-from-address"
            type="email"
            value={draft.fromAddress}
            onChange={(event) => setDraft({ ...draft, fromAddress: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sender-reply-to">{t("SenderIdentity.replyTo")}</Label>

          <Input
            disabled={!canEdit}
            id="sender-reply-to"
            type="email"
            value={draft.replyTo}
            onChange={(event) => setDraft({ ...draft, replyTo: event.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={draft.allowUserSenders}
          disabled={!canEdit}
          id="sender-allow-users"
          onCheckedChange={(checked) => setDraft({ ...draft, allowUserSenders: checked === true })}
        />

        <Label htmlFor="sender-allow-users">{t("SenderIdentity.allowUserSenders")}</Label>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !dirty || !draft.fromName.trim() || !draft.fromAddress.trim()}
            size="sm"
            type="button"
            variant="secondary"
            onClick={save}
          >
            {t("SenderIdentity.save")}
          </Button>

          {identity.configured && !identity.verified && !dirty && (
            <Button disabled={busy} size="sm" type="button" onClick={verify}>
              {t("SenderIdentity.verify")}
            </Button>
          )}
        </div>
      )}

      {identity.configured && !identity.verified && record && (
        <div className="flex flex-col gap-1 rounded-md border border-dashed p-3 text-xs" data-sender-record="">
          <p>{t("SenderIdentity.recordIntro", { domain: identity.domain ?? "" })}</p>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono">
            <dt className="text-muted-foreground">{t("SenderIdentity.recordType")}</dt>

            <dd>{record.type}</dd>

            <dt className="text-muted-foreground">{t("SenderIdentity.recordName")}</dt>

            <dd className="break-all">{record.name}</dd>

            <dt className="text-muted-foreground">{t("SenderIdentity.recordValue")}</dt>

            <dd className="break-all" data-sender-record-value="">
              {record.value}
            </dd>
          </dl>

          <p className="text-muted-foreground">{t("SenderIdentity.refusedUntilVerified")}</p>
        </div>
      )}

      {identity.verified && identity.verifiedAt && (
        <p className="text-xs text-muted-foreground">
          {t("SenderIdentity.verifiedOn", {
            domain: identity.domain ?? "",
            date: intlStore.formatNumericalShortDate(identity.verifiedAt),
          })}
        </p>
      )}
    </section>
  );
});
