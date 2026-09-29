"use server";

import type { ContactMeetingsData } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { getGetContactMeetingsInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getContactMeetingsAction(input: ContactMeetingsData) {
  return serializeResult(getGetContactMeetingsInteractor().invoke(input));
}
