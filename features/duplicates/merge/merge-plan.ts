export type MergeIdentifier = {
  id: string;
  provider: string;
  channelClass: string;
  value: string;
  messagingId: string | null;
  displayName: string | null;
  profileUrl: string | null;
};

export type MergeMember = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  notes: unknown;
  createdAt: string;
  identifiers: MergeIdentifier[];
  organizationIds: string[];
  userIds: string[];
  dealIds: string[];
  taskIds: string[];
  customFieldValues: Array<{ columnId: string; value: string }>;
  leadIds: string[];
  fileIds: string[];
  documentIds: string[];
  refIds: string[];
};

export type MergePicks = {
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, string>;
};

export type WinnerUpdate = {
  firstName: string;
  lastName: string;
  notes: unknown;
  customFieldValues: Array<{ columnId: string; value: string | null }>;
};

export type MergeSnapshot = { version: 1; winner: MergeMember; losers: MergeMember[] };

type NoteDocument = { type: "doc"; content: unknown[] };

function isNonEmptyDocument(value: unknown): value is NoteDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content) &&
    (value as NoteDocument).content.length > 0
  );
}

export function concatNotes(notes: readonly unknown[]): unknown {
  const documents = notes.filter(isNonEmptyDocument);
  if (documents.length === 0) return notes[0] ?? null;
  if (documents.length === 1) return documents[0];

  return {
    type: "doc",
    content: documents.flatMap((document, index) =>
      index === 0 ? document.content : [{ type: "horizontalRule" }, ...document.content],
    ),
  };
}

export function mergeSourcesAreMembers(members: readonly MergeMember[], picks: MergePicks): boolean {
  const ids = new Set(members.map((member) => member.id));
  const sources = [picks.firstName, picks.lastName, ...Object.values(picks.customFields ?? {})];

  return sources.every((source) => source === undefined || ids.has(source));
}

type WithCustomFields = { id: string; customFieldValues: Array<{ columnId: string; value: string }> };

function mergedCustomFields<M extends WithCustomFields>(
  members: readonly M[],
  picks: Record<string, string> | undefined,
): Array<{ columnId: string; value: string | null }> {
  const byId = new Map(members.map((member) => [member.id, member]));
  const valueOf = (member: M | undefined, columnId: string) =>
    member?.customFieldValues.find((entry) => entry.columnId === columnId)?.value ?? null;
  const columnIds = [...new Set(members.flatMap((member) => member.customFieldValues.map((entry) => entry.columnId)))];

  return columnIds.map((columnId) => {
    const picked = picks?.[columnId];
    const value = picked
      ? valueOf(byId.get(picked), columnId)
      : (members
          .map((member) => valueOf(member, columnId))
          .find((candidate) => candidate !== null && candidate !== "") ?? null);

    return { columnId, value };
  });
}

export function planWinnerUpdate(winner: MergeMember, losers: readonly MergeMember[], picks: MergePicks): WinnerUpdate {
  const members = [winner, ...losers];
  const byId = new Map(members.map((member) => [member.id, member]));
  const source = (id: string | undefined) => (id ? (byId.get(id) ?? winner) : winner);

  return {
    firstName: source(picks.firstName).firstName,
    lastName: source(picks.lastName).lastName,
    notes: concatNotes(members.map((member) => member.notes)),
    customFieldValues: mergedCustomFields(members, picks.customFields),
  };
}

export type OrganizationMergeMember = {
  id: string;
  name: string;
  notes: unknown;
  createdAt: string;
  contactIds: string[];
  dealIds: string[];
  userIds: string[];
  taskIds: string[];
  customFieldValues: Array<{ columnId: string; value: string }>;
  leadIds: string[];
  fileIds: string[];
  documentIds: string[];
  refIds: string[];
};

export type OrganizationPicks = { name?: string; customFields?: Record<string, string> };

export type OrganizationUpdate = {
  name: string;
  notes: unknown;
  customFieldValues: Array<{ columnId: string; value: string | null }>;
};

export type OrganizationMergeSnapshot = {
  version: 1;
  winner: OrganizationMergeMember;
  losers: OrganizationMergeMember[];
};

export function planOrganizationUpdate(
  winner: OrganizationMergeMember,
  losers: readonly OrganizationMergeMember[],
  picks: OrganizationPicks,
): OrganizationUpdate {
  const members = [winner, ...losers];
  const source = members.find((member) => member.id === picks.name) ?? winner;

  return {
    name: source.name,
    notes: concatNotes(members.map((member) => member.notes)),
    customFieldValues: mergedCustomFields(members, picks.customFields),
  };
}

export function organizationSourcesAreMembers(
  members: readonly OrganizationMergeMember[],
  picks: OrganizationPicks,
): boolean {
  const ids = new Set(members.map((member) => member.id));

  return [picks.name, ...Object.values(picks.customFields ?? {})].every(
    (source) => source === undefined || ids.has(source),
  );
}
