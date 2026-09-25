import { parseAutomationSchedule } from "./automation-schedule";

const LOOKAHEAD_DAYS = 366;

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return (asUtc - instant.getTime()) / 60000;
}

function zonedFields(instant: Date, timeZone: string | null) {
  if (!timeZone) {
    return {
      minute: instant.getUTCMinutes(),
      hour: instant.getUTCHours(),
      day: instant.getUTCDate(),
      month: instant.getUTCMonth() + 1,
      weekday: instant.getUTCDay(),
    };
  }

  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant, timeZone) * 60000);

  return {
    minute: shifted.getUTCMinutes(),
    hour: shifted.getUTCHours(),
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    weekday: shifted.getUTCDay(),
  };
}

export function nextAutomationRunAt(expression: string, timeZone: string | null, after: Date): Date | null {
  const parsed = parseAutomationSchedule(expression);
  if (!parsed) return null;

  const [minutes = [], hours = [], days = [], months = [], weekdays = []] = parsed;
  const start = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  const limit = start.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

  let candidate = start.getTime();

  while (candidate <= limit) {
    const instant = new Date(candidate);
    const fields = zonedFields(instant, timeZone);
    const dayMatches =
      months.includes(fields.month) && (days.includes(fields.day) || weekdays.includes(fields.weekday));

    if (!dayMatches) {
      candidate += (24 - fields.hour) * 60 * 60 * 1000 - fields.minute * 60000;
      continue;
    }

    if (!hours.includes(fields.hour)) {
      candidate += (60 - fields.minute) * 60000;
      continue;
    }

    if (minutes.includes(fields.minute)) return instant;

    candidate += 60000;
  }

  return null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });

    return true;
  } catch {
    return false;
  }
}
