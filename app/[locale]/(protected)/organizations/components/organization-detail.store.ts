import type { CreateOrganizationData } from "@/features/organizations/upsert/create-organization.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { RootStore } from "@/core/stores/root.store";

import { Resource } from "@/generated/prisma";
import { toast } from "sonner";

import {
  deleteOrganizationAction,
  getOrganizationByIdAction,
  getOrganizationsAction,
  createOrganizationAction,
  updateOrganizationAction,
} from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";

const NAMESAKE_WARNING_DURATION_MS = 10_000;

function sameOrganizationName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function warnAboutNamesake(rootStore: RootStore, created: OrganizationDto): Promise<void> {
  const others = await getOrganizationsAction({ searchTerm: created.name, pagination: { page: 1, pageSize: 25 } });
  const namesake = others.items.some(
    (organization) => organization.id !== created.id && sameOrganizationName(organization.name, created.name),
  );

  if (namesake) {
    toast.warning(
      rootStore.localeStore.getTranslation("OrganizationModal.duplicateNameWarning", { name: created.name }),
      { duration: NAMESAKE_WARNING_DURATION_MS },
    );
  }
}

export class OrganizationDetailStore extends BaseCustomColumnEntityModalStore<
  CreateOrganizationData & { id?: string },
  OrganizationDto
> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        notes: null,
        contactIds: [],
        userIds: [],
        dealIds: [],
        taskIds: [],
        customFieldValues: [],
      },
      Resource.organizations,
      rootStore.organizationsStore,
      {
        getById: getOrganizationByIdAction,
        create: async (data) => {
          const result = await createOrganizationAction(data);
          if (result.ok) warnAboutNamesake(rootStore, result.data).catch(reportApplicationError);
          return result;
        },
        update: updateOrganizationAction,
        delete: deleteOrganizationAction,
      },
    );
  }

  protected initFormWithCustomFieldValues(entity?: OrganizationDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        contactIds: entity.contacts.map((contact) => contact.id),
        userIds: entity.users.map((user) => user.id),
        dealIds: entity.deals.map((deal) => deal.id),
        taskIds: entity.tasks.map((task) => task.id),
      };
    }

    return {
      ...baseData,
      name: "",
      notes: null,
      contactIds: [],
      userIds: [],
      dealIds: [],
      taskIds: [],
    };
  }

  protected buildRecentSearchItem(entity: OrganizationDto) {
    return { type: "organization" as const, id: entity.id, name: entity.name, pictureUrl: null };
  }
}
