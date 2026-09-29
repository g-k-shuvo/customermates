import type { GetMailboxThreadsData, MailView } from "../mailbox.schema";

export type MailboxThreadFilter = {
  search: string | null;
  folder: string | null;
  view?: MailView;
  labelId?: string | null;
};

function presentText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function toMailboxThreadFilter(data: GetMailboxThreadsData): MailboxThreadFilter {
  return {
    search: presentText(data.query),
    folder: presentText(data.folder),
    view: data.view ?? "inbox",
    labelId: data.labelId ?? null,
  };
}
