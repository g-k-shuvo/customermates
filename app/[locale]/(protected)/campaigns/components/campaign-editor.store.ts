import type { AudienceDefinition, AudiencePredicate, AudiencePreviewDto } from "@/features/audience/audience.schema";
import type { CampaignDto, CampaignRecipientsDto } from "@/features/campaigns/campaign.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { CampaignStatus } from "@/generated/prisma";

import {
  cancelCampaignAction,
  getCampaignAction,
  getCampaignOptionsAction,
  getCampaignRecipientsAction,
  previewAudienceAction,
  sendCampaignAction,
  updateCampaignAction,
} from "../actions";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type ConditionKind = "onList" | "notOnList" | "contactField" | "organizationField";

export type ConditionRow = { key: number; kind: ConditionKind; listId: string; columnId: string; values: string[] };

export type GroupMode = "anyOf" | "noneOf";

export type AudienceItem =
  | { key: number; type: "condition"; row: ConditionRow }
  | { key: number; type: "group"; mode: GroupMode; rows: ConditionRow[] };

export type CampaignOptions = {
  lists: { id: string; name: string; memberCount: number }[];
  contactColumns: CustomColumnDto[];
  organizationColumns: CustomColumnDto[];
  users: { id: string; name: string }[];
};

export const CAMPAIGN_POLL_MS = 3000;

let rowKey = 0;

function rowFrom(predicate: AudiencePredicate): ConditionRow {
  return {
    key: (rowKey += 1),
    kind: predicate.kind,
    listId: "listId" in predicate ? predicate.listId : "",
    columnId: "columnId" in predicate ? predicate.columnId : "",
    values: "values" in predicate ? predicate.values : [],
  };
}

function emptyRow(): ConditionRow {
  return { key: (rowKey += 1), kind: "onList", listId: "", columnId: "", values: [] };
}

function itemsFrom(audience: AudienceDefinition | null): AudienceItem[] {
  return (audience?.conditions ?? []).map(
    (condition): AudienceItem =>
      condition.kind === "anyOf" || condition.kind === "noneOf"
        ? { key: (rowKey += 1), type: "group", mode: condition.kind, rows: condition.conditions.map(rowFrom) }
        : { key: (rowKey += 1), type: "condition", row: rowFrom(condition) },
  );
}

function predicateOf(row: ConditionRow): AudiencePredicate[] {
  if (row.kind === "onList" || row.kind === "notOnList")
    return row.listId ? [{ kind: row.kind, listId: row.listId }] : [];

  return row.columnId && row.values.length > 0 ? [{ kind: row.kind, columnId: row.columnId, values: row.values }] : [];
}

function patchRow(row: ConditionRow, key: number, patch: Partial<Omit<ConditionRow, "key">>): ConditionRow {
  return row.key === key ? { ...row, ...patch } : row;
}

export class CampaignEditorStore {
  campaign: CampaignDto;
  name: string;
  subject: string;
  bodyMarkdown: string;
  bannerUrl: string;
  lawfulBasis: string;
  senderUserId: string | null;
  items: AudienceItem[];
  options: CampaignOptions = { lists: [], contactColumns: [], organizationColumns: [], users: [] };
  preview: AudiencePreviewDto | null = null;
  recipients: CampaignRecipientsDto | null = null;
  isBusy = false;

  constructor(initial: CampaignDto) {
    this.campaign = initial;
    this.name = initial.name;
    this.subject = initial.subject;
    this.bodyMarkdown = initial.bodyMarkdown;
    this.bannerUrl = initial.bannerUrl ?? "";
    this.lawfulBasis = initial.lawfulBasis ?? "";
    this.senderUserId = initial.senderUserId;
    this.items = itemsFrom(initial.audience);

    makeObservable(this, {
      campaign: observable.ref,
      name: observable,
      subject: observable,
      bodyMarkdown: observable,
      bannerUrl: observable,
      lawfulBasis: observable,
      senderUserId: observable,
      items: observable,
      options: observable.ref,
      preview: observable.ref,
      recipients: observable.ref,
      isBusy: observable,
      isDraft: computed,
      isSending: computed,
      definition: computed,
      setField: action,
      addCondition: action,
      addGroup: action,
      setGroupMode: action,
      removeGroup: action,
      updateCondition: action,
      removeCondition: action,
      setCampaign: action,
      setOptions: action,
      setPreview: action,
      setRecipients: action,
      setBusy: action,
    });
  }

  get isDraft(): boolean {
    return this.campaign.status === CampaignStatus.draft;
  }

  get isSending(): boolean {
    return this.campaign.status === CampaignStatus.sending;
  }

  get definition(): AudienceDefinition | null {
    const conditions = this.items.flatMap((item): AudienceDefinition["conditions"] => {
      if (item.type === "condition") return predicateOf(item.row);

      const members = item.rows.flatMap(predicateOf);

      return members.length > 0 ? [{ kind: item.mode, conditions: members }] : [];
    });

    return conditions.length > 0 ? { conditions } : null;
  }

  setField = <K extends "name" | "subject" | "bodyMarkdown" | "bannerUrl" | "lawfulBasis" | "senderUserId">(
    key: K,
    value: CampaignEditorStore[K],
  ) => {
    (this as CampaignEditorStore)[key] = value;
  };

  addCondition = (groupKey?: number) => {
    this.items =
      groupKey === undefined
        ? [...this.items, { key: (rowKey += 1), type: "condition", row: emptyRow() }]
        : this.items.map((item) =>
            item.type === "group" && item.key === groupKey ? { ...item, rows: [...item.rows, emptyRow()] } : item,
          );
  };

  addGroup = (mode: GroupMode) => {
    this.items = [...this.items, { key: (rowKey += 1), type: "group", mode, rows: [emptyRow()] }];
  };

  setGroupMode = (groupKey: number, mode: GroupMode) => {
    this.items = this.items.map((item) => (item.type === "group" && item.key === groupKey ? { ...item, mode } : item));
  };

  removeGroup = (groupKey: number) => {
    this.items = this.items.filter((item) => item.key !== groupKey);
  };

  updateCondition = (key: number, patch: Partial<Omit<ConditionRow, "key">>) => {
    this.items = this.items.map((item) =>
      item.type === "condition"
        ? { ...item, row: patchRow(item.row, key, patch) }
        : { ...item, rows: item.rows.map((row) => patchRow(row, key, patch)) },
    );
  };

  removeCondition = (key: number) => {
    this.items = this.items.flatMap((item): AudienceItem[] => {
      if (item.type === "condition") return item.row.key === key ? [] : [item];

      const rows = item.rows.filter((row) => row.key !== key);

      return rows.length > 0 ? [{ ...item, rows }] : [];
    });
  };

  setCampaign = (campaign: CampaignDto) => {
    this.campaign = campaign;
  };

  setOptions = (options: CampaignOptions) => {
    this.options = options;
  };

  setPreview = (preview: AudiencePreviewDto | null) => {
    this.preview = preview;
  };

  setRecipients = (recipients: CampaignRecipientsDto | null) => {
    this.recipients = recipients;
  };

  setBusy = (busy: boolean) => {
    this.isBusy = busy;
  };

  loadOptions = async () => {
    this.setOptions(await getCampaignOptionsAction());
  };

  private async busy<T>(fn: () => Promise<T>): Promise<T> {
    this.setBusy(true);
    try {
      return await fn();
    } finally {
      this.setBusy(false);
    }
  }

  save = () =>
    this.busy(async () => {
      const result = await updateCampaignAction({
        id: this.campaign.id,
        name: this.name,
        subject: this.subject,
        bodyMarkdown: this.bodyMarkdown,
        bannerUrl: this.bannerUrl.trim() || null,
        audience: this.definition,
        lawfulBasis: this.lawfulBasis.trim() || null,
        senderUserId: this.senderUserId,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      this.setCampaign(result.data);
      return true;
    });

  runPreview = () =>
    this.busy(async () => {
      const definition = this.definition;
      if (!definition) return this.setPreview(null);

      const result = await previewAudienceAction(definition);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      this.setPreview(result.data);
    });

  send = async () => {
    if (!(await this.save())) return;

    await this.busy(async () => {
      const result = await sendCampaignAction(this.campaign.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      this.setCampaign(result.data);
    });
  };

  cancel = () =>
    this.busy(async () => {
      const result = await cancelCampaignAction(this.campaign.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      this.setCampaign(result.data);
      await this.loadRecipients(1);
    });

  refresh = async () => {
    const result = await getCampaignAction(this.campaign.id);
    if (result.ok) this.setCampaign(result.data);
    await this.loadRecipients(this.recipients?.page ?? 1);
  };

  loadRecipients = async (page: number) => {
    if (this.isDraft) return;

    const result = await getCampaignRecipientsAction({ id: this.campaign.id, page });
    if (result.ok) this.setRecipients(result.data);
  };
}
