import type { ChipColor } from "@/constants/chip-colors";

import { LeadStatus } from "@/generated/prisma";

export const LEAD_STATUS_CHIP_COLOR: Record<LeadStatus, ChipColor> = {
  [LeadStatus.new]: "info",
  [LeadStatus.working]: "warning",
  [LeadStatus.qualified]: "success",
  [LeadStatus.unqualified]: "destructive",
  [LeadStatus.converted]: "success",
  [LeadStatus.archived]: "secondary",
};
