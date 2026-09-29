"use client";

import type { KeyboardEvent } from "react";
import type { SuppressionListDto } from "@/features/messaging-send/suppression/manage-suppressions.interactor";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { MailX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Action, Resource, SuppressionReason } from "@/generated/prisma";

import { addSuppressionAction, getSuppressionsAction, removeSuppressionAction } from "../../messaging-actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type State = { status: "loading" } | { status: "ready"; list: SuppressionListDto } | { status: "error" };

export const SuppressionListSection = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { userStore } = useRootStore();
  const canEdit = userStore.can(Resource.company, Action.update);
  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (term: string) => {
    const result = await getSuppressionsAction(term ? { search: term } : {});
    setState(result.ok ? { status: "ready", list: result.data } : { status: "error" });
  }, []);

  useEffect(() => {
    runUserAction(() => load(""));
  }, [load]);

  const reasonLabel = (reason: SuppressionReason) => {
    switch (reason) {
      case SuppressionReason.unsubscribed:
        return t("Suppressions.reason.unsubscribed");
      case SuppressionReason.bounced:
        return t("Suppressions.reason.bounced");
      case SuppressionReason.complained:
        return t("Suppressions.reason.complained");
      case SuppressionReason.manual:
        return t("Suppressions.reason.manual");
    }
  };

  const add = () =>
    runUserAction(async () => {
      if (!address.trim()) return;

      setBusy(true);
      try {
        const result = await addSuppressionAction({ address: address.trim() });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        setAddress("");
        toast.success(t("Suppressions.added"));
        await load(search);
      } finally {
        setBusy(false);
      }
    });

  const remove = (id: string) =>
    runUserAction(async () => {
      const result = await removeSuppressionAction(id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      await load(search);
    });

  const onKey = (action: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    action();
  };

  return (
    <section aria-labelledby="suppressions-title" className="flex flex-col gap-3" data-suppression-list="">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium" id="suppressions-title">
          {t("Suppressions.title")}
        </h2>

        <p className="text-subdued text-xs">{t("Suppressions.description")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t("Suppressions.search")}
          className="max-w-64"
          id="suppressions-search"
          placeholder={t("Suppressions.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onKey(() => runUserAction(() => load(search)))}
        />

        {canEdit && (
          <>
            <Input
              aria-label={t("Suppressions.addressLabel")}
              className="max-w-64"
              id="suppressions-add-address"
              placeholder={t("Suppressions.addressLabel")}
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={onKey(add)}
            />

            <Button disabled={busy || !address.trim()} size="sm" type="button" variant="secondary" onClick={add}>
              {t("Suppressions.add")}
            </Button>
          </>
        )}
      </div>

      {state.status === "loading" && <p className="text-sm text-muted-foreground">{t("PageState.loading")}</p>}

      {state.status === "error" && <p className="text-sm text-destructive">{t("Suppressions.loadError")}</p>}

      {state.status === "ready" &&
        (state.list.items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailX aria-hidden className="size-4" />

            {t("Suppressions.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border" data-suppressions="">
            {state.list.items.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                data-suppression={entry.address}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{entry.address}</span>

                <Badge variant={entry.reason === SuppressionReason.manual ? "secondary" : "warning"}>
                  {reasonLabel(entry.reason)}
                </Badge>

                <span className="text-xs text-muted-foreground">
                  {intlStore.formatNumericalShortDate(entry.createdAt)}
                </span>

                {canEdit && (
                  <IconButton
                    icon={Trash2}
                    label={t("Suppressions.remove", { address: entry.address })}
                    type="button"
                    onClick={() => remove(entry.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        ))}

      {state.status === "ready" && state.list.total > state.list.items.length && (
        <p className="text-xs text-muted-foreground">
          {t("Suppressions.more", { shown: state.list.items.length, total: state.list.total })}
        </p>
      )}
    </section>
  );
});
