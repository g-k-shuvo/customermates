"use client";

import type { ReactNode } from "react";
import type { ContactListDto } from "@/features/contact-lists/contact-list.schema";

import { ListChecks, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, BulkJobStatus, Resource } from "@/generated/prisma";

import { createContactListAction, deleteContactListAction, updateContactListAction } from "../actions";

import { ListFillFormStore } from "./list-fill-form.store";
import { JOB_POLL_MS, ListsPageStore } from "./lists-page.store";
import { ListsPageSkeleton } from "./lists-page-skeleton";

import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { cn } from "@/core/utils/cn";

export const ListsPageView = observer(({ initial }: { initial: ContactListDto[] }) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const { layoutStore, userStore } = rootStore;
  const [store] = useState(() => new ListsPageStore(initial));
  const [fillStore] = useState(() => new ListFillFormStore(rootStore));
  const [newName, setNewName] = useState("");
  const canWrite = userStore.can(Resource.contacts, Action.update);
  const title = t("ContactLists.title");

  useEffect(() => {
    layoutStore.setRuntimeIdentity({ scope: "entity", key: "lists", title, pictureUrl: null, avatarKind: null });

    return () => layoutStore.clearRuntimeIdentity("entity", "lists");
  }, [layoutStore, title]);

  useEffect(() => {
    void fillStore.loadFields().catch(reportApplicationError);
  }, [fillStore]);

  useEffect(() => {
    void store.loadMembers(1).catch(reportApplicationError);
  }, [store, store.selectedId]);

  useEffect(() => {
    if (!store.jobRunning) return;

    const timer = setInterval(() => void store.refreshJob().catch(reportApplicationError), JOB_POLL_MS);

    return () => clearInterval(timer);
  }, [store, store.jobRunning]);

  const create = () =>
    runUserAction(async () => {
      const name = newName.trim();
      if (!name) return;

      const result = await createContactListAction({ name });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      setNewName("");
      await store.reload();
      store.select(result.data.id);
    });

  const createForm = canWrite ? (
    <div className="flex items-end gap-2" data-list-create="">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="list-new-name">{t("ContactLists.newListName")}</Label>

        <Input
          id="list-new-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            create();
          }}
        />
      </div>

      <Button disabled={newName.trim().length === 0} id="list-create" type="button" onClick={create}>
        {t("ContactLists.create")}
      </Button>
    </div>
  ) : null;

  const pageState = store.pageState;
  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = <PageState background={<ListsPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.reload())}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "true-empty":
      body = (
        <PageState
          action={createForm}
          background={<ListsPageSkeleton />}
          description={t("ContactLists.emptyDescription")}
          icon={ListChecks}
          state="empty"
          title={t("ContactLists.emptyTitle")}
        />
      );
      break;
    case "content":
      body = (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="flex flex-col gap-3">
            {createForm}

            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-lists="">
              {store.lists?.map((list) => (
                <li key={list.id}>
                  <button
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted",
                      list.id === store.selectedId && "bg-muted font-medium",
                    )}
                    data-list-row={list.id}
                    type="button"
                    onClick={() => store.select(list.id)}
                  >
                    <span className="truncate">{list.name}</span>

                    <span className="shrink-0 tabular-nums text-muted-foreground">{list.memberCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {store.selected ? (
            <ListDetail
              key={store.selected.id}
              canWrite={canWrite}
              fillStore={fillStore}
              list={store.selected}
              store={store}
            />
          ) : null}
        </div>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      throw new Error(String(exhaustive));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-x-lg font-semibold">{title}</h1>

        <p className="text-sm text-muted-foreground">{t("ContactLists.subtitle")}</p>
      </div>

      {body}
    </div>
  );
});

type DetailProps = { list: ContactListDto; store: ListsPageStore; fillStore: ListFillFormStore; canWrite: boolean };

const ListDetail = observer(({ list, store, fillStore, canWrite }: DetailProps) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = store.members;
  const job = store.job;

  const jobStatusLabel = (status: BulkJobStatus, values: { processed: string; total: string }) => {
    switch (status) {
      case BulkJobStatus.running:
        return t("ContactLists.jobStatus.running", values);
      case BulkJobStatus.completed:
        return t("ContactLists.jobStatus.completed", values);
      case BulkJobStatus.failed:
        return t("ContactLists.jobStatus.failed", values);
      case BulkJobStatus.cancelled:
        return t("ContactLists.jobStatus.cancelled", values);
    }
  };

  const save = () =>
    runUserAction(async () => {
      const result = await updateContactListAction({ id: list.id, name, description: description.trim() || null });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      await store.reload();
    });

  const remove = () =>
    runUserAction(async () => {
      if (!confirmDelete) {
        setConfirmDelete(true);
        return;
      }

      const result = await deleteContactListAction(list.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      await store.reload();
    });

  const fill = () =>
    runUserAction(async () => {
      const started = await fillStore.start(list.id);
      if (started) store.setJob(started);
    });

  const enterSaves = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    save();
  };

  return (
    <div className="flex flex-col gap-4" data-list-detail={list.id}>
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-name">{t("ContactLists.name")}</Label>

            <Input
              disabled={!canWrite}
              id="list-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={enterSaves}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-description">{t("ContactLists.description")}</Label>

            <Input
              disabled={!canWrite}
              id="list-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={enterSaves}
            />
          </div>
        </div>

        {canWrite ? (
          <div className="flex justify-between gap-2">
            <Button id="list-delete" size="sm" type="button" variant="ghost" onClick={remove}>
              <Trash2 className="size-4" />

              {confirmDelete ? t("ContactLists.confirmDelete") : t("ContactLists.delete")}
            </Button>

            <Button
              disabled={name.trim().length === 0}
              id="list-save"
              size="sm"
              type="button"
              variant="secondary"
              onClick={save}
            >
              {t("Common.actions.save")}
            </Button>
          </div>
        ) : null}
      </section>

      {canWrite ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border p-4" data-list-fill="">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{t("ContactLists.fillTitle")}</h2>

            <p className="text-xs text-muted-foreground">{t("ContactLists.fillHelp")}</p>
          </div>

          <AppForm store={fillStore}>
            <FormInput id="searchTerm" label={t("ContactLists.searchTerm")} />

            {fillStore.filterableFields.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <FormLabel>{t("ContactLists.filters")}</FormLabel>

                <FilterAccordion
                  baseId="filters"
                  customColumns={fillStore.customColumns}
                  filterableFields={fillStore.filterableFields}
                  filters={fillStore.form.filters}
                  variant="grouped"
                />
              </div>
            ) : null}
          </AppForm>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground" data-list-job="">
              {job
                ? jobStatusLabel(job.status, {
                    processed: intlStore.formatNumber(job.processed),
                    total: intlStore.formatNumber(job.finalTotal ?? job.expectedTotal ?? 0),
                  })
                : null}
            </span>

            <Button
              disabled={store.jobRunning || fillStore.isLoading}
              id="list-fill"
              size="sm"
              type="button"
              onClick={fill}
            >
              {t("ContactLists.fill")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("ContactLists.members", { count: intlStore.formatNumber(list.memberCount) })}
        </h2>

        {members && members.items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table data-list-members="">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ContactLists.columns.name")}</TableHead>

                  <TableHead>{t("ContactLists.columns.email")}</TableHead>

                  <TableHead>{t("ContactLists.columns.added")}</TableHead>

                  {canWrite ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>

              <TableBody>
                {members.items.map((member) => (
                  <TableRow key={member.contactId}>
                    <TableCell>
                      <AppLink href={`/contacts/${member.contactId}`}>
                        {`${member.firstName} ${member.lastName}`.trim()}
                      </AppLink>
                    </TableCell>

                    <TableCell className="text-muted-foreground">{member.email ?? t("ContactLists.noEmail")}</TableCell>

                    <TableCell>{intlStore.formatNumericalShortDate(member.addedAt)}</TableCell>

                    {canWrite ? (
                      <TableCell>
                        <Button
                          aria-label={t("ContactLists.removeMember")}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={() => runUserAction(() => store.removeMember(member.contactId))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ContactLists.noMembers")}</p>
        )}

        {members && store.lastMemberPage > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">
              {t("ContactLists.page", { page: members.page, pages: store.lastMemberPage })}
            </span>

            <Button
              disabled={members.page <= 1}
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => store.loadMembers(members.page - 1))}
            >
              {t("ContactLists.previous")}
            </Button>

            <Button
              disabled={members.page >= store.lastMemberPage}
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => store.loadMembers(members.page + 1))}
            >
              {t("ContactLists.next")}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
});
