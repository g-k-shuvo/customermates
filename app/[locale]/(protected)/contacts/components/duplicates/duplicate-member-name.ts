import type { DuplicateMemberDto } from "@/features/duplicates/duplicate.schema";

import { EntityType } from "@/generated/prisma";

export function memberName(member: DuplicateMemberDto): string {
  return member.kind === EntityType.contact ? `${member.firstName} ${member.lastName}`.trim() : member.name;
}
