export const AUTOMATION_SCHEDULE_MIN_INTERVAL_MINUTES = 15;

const FIELD_BOUNDS: ReadonlyArray<{ min: number; max: number }> = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
];

function expandField(field: string, index: number): number[] | null {
  const bounds = FIELD_BOUNDS[index];
  if (!bounds) return null;

  const values = new Set<number>();

  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    if (range === undefined) return null;

    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;

    let start = bounds.min;
    let end = bounds.max;

    if (range !== "*") {
      const [fromText, toText] = range.split("-");
      const from = Number(fromText);
      if (!Number.isInteger(from)) return null;

      start = from;
      end = toText === undefined ? from : Number(toText);
      if (!Number.isInteger(end)) return null;
    }

    if (start < bounds.min || end > bounds.max || start > end) return null;

    for (let value = start; value <= end; value += step) values.add(value);
  }

  return values.size > 0 ? [...values].sort((left, right) => left - right) : null;
}

export function parseAutomationSchedule(expression: string): number[][] | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const expanded = fields.map((field, index) => expandField(field, index));

  return expanded.every((values): values is number[] => values !== null) ? expanded : null;
}

export function scheduleIntervalMinutes(minutes: readonly number[], hours: readonly number[]): number {
  const firings: number[] = [];
  for (const hour of hours) for (const minute of minutes) firings.push(hour * 60 + minute);
  if (firings.length < 2) return Number.POSITIVE_INFINITY;

  firings.sort((left, right) => left - right);

  let smallest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < firings.length; index += 1) {
    const current = firings[index];
    const previous = index === 0 ? firings[firings.length - 1] - 24 * 60 : firings[index - 1];
    smallest = Math.min(smallest, current - previous);
  }

  return smallest;
}

export function isSupportedAutomationSchedule(expression: string): boolean {
  const parsed = parseAutomationSchedule(expression);
  if (!parsed) return false;

  const [minutes = [], hours = []] = parsed;
  const interval = scheduleIntervalMinutes(minutes, hours);

  return interval >= AUTOMATION_SCHEDULE_MIN_INTERVAL_MINUTES;
}
