import type { RootStore } from "@/core/stores/root.store";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { CreateTaskData } from "@/features/tasks/upsert/create-task.interactor";
import type { UpdateTaskData } from "@/features/tasks/upsert/update-task.interactor";

import { computed, makeObservable } from "mobx";
import { Resource, TaskType } from "@/generated/prisma";

import { deleteTaskAction, getTaskByIdAction, createTaskAction, updateTaskAction } from "../actions";

import { getSystemTaskAlertConfig, getSystemTaskNameTranslationKey } from "./system-task.config";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

type TaskFormData = Omit<CreateTaskData, "name" | "dueAt"> & { name?: string; id?: string; dueAt?: string };

function toCreateTaskData(data: TaskFormData): CreateTaskData {
  return {
    ...data,
    name: data.name ?? "",
    activityKind: data.activityKind || undefined,
    dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
    durationMinutes: data.durationMinutes ?? undefined,
  };
}

function toUpdateTaskData(data: TaskFormData & { id: string }): UpdateTaskData {
  return {
    ...data,
    id: data.id,
    activityKind: data.activityKind || null,
    dueAt: data.dueAt ? new Date(data.dueAt) : null,
    durationMinutes: data.durationMinutes ?? null,
  };
}

export class TaskDetailStore extends BaseCustomColumnEntityModalStore<TaskFormData, TaskDto> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        notes: null,
        userIds: [],
        contactIds: [],
        organizationIds: [],
        dealIds: [],
        serviceIds: [],
        customFieldValues: [],
      },
      Resource.tasks,
      rootStore.tasksStore,
      {
        getById: getTaskByIdAction,
        create: (data: TaskFormData) => createTaskAction(toCreateTaskData(data)),
        update: (data: TaskFormData & { id: string }) => updateTaskAction(toUpdateTaskData(data)),
        delete: deleteTaskAction,
      },
    );

    makeObservable(this, {
      isCustomTask: computed,
      systemTaskAlertConfig: computed,
      systemTaskDisplayName: computed,
    });
  }

  get isCustomTask(): boolean {
    return this.fetchedEntity?.type === TaskType.custom;
  }

  get systemTaskAlertConfig() {
    return getSystemTaskAlertConfig(this.fetchedEntity?.type);
  }

  get systemTaskDisplayName(): string {
    const nameTranslationKey = getSystemTaskNameTranslationKey(this.fetchedEntity?.type);

    return nameTranslationKey ? this.t(nameTranslationKey) : (this.fetchedEntity?.name ?? "");
  }

  protected initFormWithCustomFieldValues(entity?: TaskDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        activityKind: entity.activityKind ?? undefined,
        dueAt: entity.dueAt ? entity.dueAt.toISOString() : undefined,
        durationMinutes: entity.durationMinutes ?? undefined,
        userIds: entity.users.map((user) => user.id),
        contactIds: entity.contacts.map((contact) => contact.id),
        organizationIds: entity.organizations.map((organization) => organization.id),
        dealIds: entity.deals.map((deal) => deal.id),
        serviceIds: entity.services.map((service) => service.id),
        name: entity.type === TaskType.custom ? (entity.name ?? "") : undefined,
      };
    }

    return {
      ...baseData,
      name: "",
      notes: null,
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
    };
  }
}
