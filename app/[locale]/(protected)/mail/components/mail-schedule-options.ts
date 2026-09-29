import { addDays, addHours, nextMonday, setHours, startOfDay } from "date-fns";

export const FOLLOW_UP_OPTIONS = ["tomorrow", "threeDays", "week"] as const;

export type FollowUpOption = (typeof FOLLOW_UP_OPTIONS)[number];

export const SEND_LATER_OPTIONS = ["inHour", "tomorrowMorning", "mondayMorning"] as const;

export type SendLaterOption = (typeof SEND_LATER_OPTIONS)[number];

const MORNING_HOUR = 8;

function morningOf(day: Date): Date {
  return setHours(startOfDay(day), MORNING_HOUR);
}

export function followUpDateFor(option: FollowUpOption, now: Date): Date {
  switch (option) {
    case "tomorrow":
      return morningOf(addDays(now, 1));
    case "threeDays":
      return morningOf(addDays(now, 3));
    case "week":
      return morningOf(addDays(now, 7));
  }
}

export function sendLaterDateFor(option: SendLaterOption, now: Date): Date {
  switch (option) {
    case "inHour":
      return addHours(now, 1);
    case "tomorrowMorning":
      return morningOf(addDays(now, 1));
    case "mondayMorning":
      return morningOf(nextMonday(now));
  }
}

export function isFollowUpDue(followUpAt: Date | null, now: Date): boolean {
  return followUpAt !== null && followUpAt.getTime() <= now.getTime();
}
