"use client";

import type { ReactNode } from "react";
import type { LeadAssignmentRuleDto } from "@/features/lead-assignment/lead-assignment.schema";

import { Plus, Route, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, LeadAssignmentStrategy, Resource } from "@/generated/prisma";

import {
  deleteLeadAssignmentRuleAction,
  getLeadAssignmentOptionsAction,
  getLeadAssignmentRulesAction,
} from "../actions";

import { LeadAssignmentRuleFormStore } from "./lead-assignment-rule-form.store";

import { ListsPageSkeleton } from "@/app/[locale]/(protected)/lists/components/lists-page-skeleton";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormSelect } from "@/components/forms/form-select";
import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type UserOption = { id: string; name: string };

export const LeadAssignmentPageView = observer(({ initial }: { initial: LeadAssignmentRuleDto[] }) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const { layoutStore, userStore } = rootStore;
  const [rules, setRules] = useState(initial);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [form] = useState(() => new LeadAssignmentRuleFormStore(rootStore));
  const canWrite = userStore.can(Resource.company, Action.update);
  const title = t("LeadAssignment.title");

  useEffect(() => {
    layoutStore.setRuntimeIdentity({
      scope: "entity",
      key: "lead-assignment",
      title,
      pictureUrl: null,
      avatarKind: null,
    });

    return () => layoutStore.clearRuntimeIdentity("entity", "lead-assignment");
  }, [layoutStore, title]);

  useEffect(() => {
    void getLeadAssignmentOptionsAction()
      .then((options) => {
        setUsers(options.users);
        form.setFields(options.filterableFields, options.customColumns);
      })
      .catch(reportApplicationError);
  }, [form]);

  const reload = async () => {
    const result = await getLeadAssignmentRulesAction();
    if (result.ok) setRules(result.data);
  };

  const open = (rule: LeadAssignmentRuleDto | null) => {
    form.edit(rule, rules.length);
    setEditing(true);
  };

  const save = () =>
    runUserAction(async () => {
      if (!(await form.save())) return;

      setEditing(false);
      await reload();
    });

  const remove = (rule: LeadAssignmentRuleDto) =>
    runUserAction(async () => {
      const result = await deleteLeadAssignmentRuleAction(rule.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      await reload();
    });

  const userName = (id: string) => users.find((user) => user.id === id)?.name ?? id;
  const strategyLabel = (strategy: LeadAssignmentStrategy) =>
    strategy === LeadAssignmentStrategy.specificUser
      ? t("LeadAssignment.strategies.specificUser")
      : t("LeadAssignment.strategies.roundRobin");

  let list: ReactNode;
  if (rules.length === 0) {
    list = (
      <PageState
        background={<ListsPageSkeleton />}
        description={t("LeadAssignment.emptyDescription")}
        icon={Route}
        state="empty"
        title={t("LeadAssignment.emptyTitle")}
      />
    );
  } else {
    list = (
      <ol
        className="flex flex-col divide-y divide-border rounded-xl border border-border"
        data-lead-assignment-rules=""
      >
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-rule={rule.id}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{rule.name}</span>

              <span className="text-xs text-muted-foreground">
                {t("LeadAssignment.summary", {
                  strategy: strategyLabel(rule.strategy),
                  users: rule.userIds.map(userName).join(", "),
                  conditions: rule.conditions.length,
                })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!rule.enabled ? (
                <span className="text-xs text-muted-foreground">{t("LeadAssignment.disabled")}</span>
              ) : null}

              {canWrite ? (
                <>
                  <Button size="sm" type="button" variant="secondary" onClick={() => open(rule)}>
                    {t("LeadAssignment.edit")}
                  </Button>

                  <Button
                    aria-label={t("LeadAssignment.delete")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => remove(rule)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <AppLink className="text-sm text-muted-foreground" href="/leads">
            {t("LeadAssignment.back")}
          </AppLink>

          <h1 className="text-x-lg font-semibold">{title}</h1>

          <p className="text-sm text-muted-foreground">{t("LeadAssignment.subtitle")}</p>
        </div>

        {canWrite && !editing ? (
          <Button id="lead-assignment-add" type="button" onClick={() => open(null)}>
            <Plus className="size-4" />

            {t("LeadAssignment.add")}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border p-4" data-lead-assignment-form="">
          <AppForm store={form}>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <FormInput id="name" label={t("LeadAssignment.fields.name")} />

              <FormInput id="position" label={t("LeadAssignment.fields.position")} type="number" />
            </div>

            <FormSelect
              id="strategy"
              items={[
                { value: LeadAssignmentStrategy.roundRobin, label: t("LeadAssignment.strategies.roundRobin") },
                { value: LeadAssignmentStrategy.specificUser, label: t("LeadAssignment.strategies.specificUser") },
              ]}
              label={t("LeadAssignment.fields.strategy")}
            />

            <div className="flex flex-col gap-1.5">
              <FormLabel>{t("LeadAssignment.fields.users")}</FormLabel>

              <div className="grid gap-2 sm:grid-cols-2" data-lead-assignment-users="">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={form.form.userIds.includes(user.id)}
                      id={`lead-assignment-user-${user.id}`}
                      onCheckedChange={() => form.toggleUser(user.id)}
                    />

                    <Label htmlFor={`lead-assignment-user-${user.id}`}>{user.name}</Label>
                  </div>
                ))}
              </div>
            </div>

            {form.filterableFields.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <FormLabel>{t("LeadAssignment.fields.conditions")}</FormLabel>

                <FilterAccordion
                  baseId="conditions"
                  customColumns={form.customColumns}
                  filterableFields={form.filterableFields}
                  filters={form.form.conditions}
                  variant="grouped"
                />

                <p className="text-xs text-muted-foreground">{t("LeadAssignment.conditionsHelp")}</p>
              </div>
            ) : null}
          </AppForm>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} id="lead-assignment-enabled" onCheckedChange={form.setEnabled} />

              <Label htmlFor="lead-assignment-enabled">{t("LeadAssignment.fields.enabled")}</Label>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                {t("Common.actions.cancel")}
              </Button>

              <Button disabled={form.isLoading} id="lead-assignment-save" type="button" onClick={save}>
                {t("Common.actions.save")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {list}
    </div>
  );
});
