"use client";

import type { TasksPageTab } from "./tasks.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CalendarRange, List } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRootStore } from "@/core/stores/root-store.provider";

export const TasksViewTabs = observer(function TasksViewTabs() {
  const t = useTranslations();
  const { tasksStore } = useRootStore();

  return (
    <Tabs value={tasksStore.activeTab} onValueChange={(value) => tasksStore.setActiveTab(value as TasksPageTab)}>
      <TabsList variant="segmented">
        <TabsTrigger value="list">
          <Icon icon={List} size="sm" />

          <span className="hidden sm:inline">{t("Activities.tabs.list")}</span>
        </TabsTrigger>

        <TabsTrigger value="agenda">
          <Icon icon={CalendarRange} size="sm" />

          <span className="hidden sm:inline">{t("Activities.tabs.agenda")}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
});
