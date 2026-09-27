import { addDays, differenceInCalendarDays, startOfWeek } from "date-fns";

export const WEEK_DAY_COUNT = 7;
export const MINUTES_PER_DAY = 24 * 60;
export const WEEK_SLOT_MINUTES = 30;
export const DEFAULT_ACTIVITY_DURATION_MINUTES = 30;

export type WeekActivity = {
  id: string;
  dueAt: Date | null;
  durationMinutes: number | null;
};

export type PlacedWeekActivity<T> = {
  item: T;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
};

export type WeekLayout<T> = {
  allDay: T[][];
  timed: PlacedWeekActivity<T>[][];
};

export type WeekDropTarget =
  | { kind: "slot"; dayIndex: number; minutes: number }
  | { kind: "allDay"; dayIndex: number }
  | { kind: "unscheduled" };

export type WeekDirection = "up" | "down" | "left" | "right";

const SLOT_TARGET = /^slot:(\d+):(\d+)$/;
const ALL_DAY_TARGET = /^all-day:(\d+)$/;
const UNSCHEDULED_TARGET = "unscheduled";

export function startOfActivityWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function shiftActivityWeek(weekStart: Date, weeks: number): Date {
  return startOfActivityWeek(addDays(weekStart, weeks * WEEK_DAY_COUNT));
}

export function activityWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: WEEK_DAY_COUNT }, (_, index) => addDays(weekStart, index));
}

export function activityWeekRange(weekStart: Date): { from: Date; to: Date } {
  return { from: weekStart, to: addDays(weekStart, WEEK_DAY_COUNT) };
}

export function activityWeekDayIndex(date: Date, weekStart: Date): number | null {
  const index = differenceInCalendarDays(date, weekStart);

  return index >= 0 && index < WEEK_DAY_COUNT ? index : null;
}

export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function isAllDayActivity(dueAt: Date): boolean {
  return dueAt.getHours() === 0 && dueAt.getMinutes() === 0 && dueAt.getSeconds() === 0;
}

export function isWithinActivityWeek(dueAt: Date | null, weekStart: Date): boolean {
  if (!dueAt) return false;

  const { from, to } = activityWeekRange(weekStart);

  return dueAt.getTime() >= from.getTime() && dueAt.getTime() < to.getTime();
}

export function sameDueAt(left: Date | null, right: Date | null): boolean {
  if (!left || !right) return left === right;

  return left.getTime() === right.getTime();
}

function compareTimed<T extends WeekActivity>(left: PlacedWeekActivity<T>, right: PlacedWeekActivity<T>): number {
  if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes;
  if (left.endMinutes !== right.endMinutes) return right.endMinutes - left.endMinutes;

  return left.item.id < right.item.id ? -1 : left.item.id > right.item.id ? 1 : 0;
}

function assignLanes<T extends WeekActivity>(blocks: PlacedWeekActivity<T>[]): PlacedWeekActivity<T>[] {
  const sorted = [...blocks].sort(compareTimed);
  const placed: PlacedWeekActivity<T>[] = [];
  let cluster: PlacedWeekActivity<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const block of cluster) placed.push({ ...block, laneCount: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    if (block.startMinutes >= clusterEnd) closeCluster();

    const freeLane = laneEnds.findIndex((end) => end <= block.startMinutes);
    const lane = freeLane === -1 ? laneEnds.length : freeLane;

    laneEnds[lane] = block.endMinutes;
    cluster.push({ ...block, lane });
    clusterEnd = Math.max(clusterEnd, block.endMinutes);
  }

  closeCluster();

  return placed;
}

export function layoutActivityWeek<T extends WeekActivity>(items: readonly T[], weekStart: Date): WeekLayout<T> {
  const allDay: T[][] = Array.from({ length: WEEK_DAY_COUNT }, () => []);
  const timed: PlacedWeekActivity<T>[][] = Array.from({ length: WEEK_DAY_COUNT }, () => []);

  for (const item of items) {
    if (!item.dueAt) continue;

    const dayIndex = activityWeekDayIndex(item.dueAt, weekStart);

    if (dayIndex === null) continue;

    if (isAllDayActivity(item.dueAt)) {
      allDay[dayIndex].push(item);
      continue;
    }

    const startMinutes = minutesIntoDay(item.dueAt);
    const duration = Math.max(item.durationMinutes ?? DEFAULT_ACTIVITY_DURATION_MINUTES, WEEK_SLOT_MINUTES);

    timed[dayIndex].push({
      item,
      dayIndex,
      startMinutes,
      endMinutes: Math.min(MINUTES_PER_DAY, startMinutes + duration),
      lane: 0,
      laneCount: 1,
    });
  }

  return { allDay, timed: timed.map(assignLanes) };
}

export function activityEndsAt(item: WeekActivity): Date | null {
  if (!item.dueAt) return null;

  return new Date(item.dueAt.getTime() + (item.durationMinutes ?? DEFAULT_ACTIVITY_DURATION_MINUTES) * 60_000);
}

export function weekDropTargetId(target: WeekDropTarget): string {
  switch (target.kind) {
    case "slot":
      return `slot:${target.dayIndex}:${target.minutes}`;
    case "allDay":
      return `all-day:${target.dayIndex}`;
    case "unscheduled":
      return UNSCHEDULED_TARGET;
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

function isDayIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < WEEK_DAY_COUNT;
}

function isSlotStart(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY && value % WEEK_SLOT_MINUTES === 0;
}

export function parseWeekDropTarget(id: string): WeekDropTarget | null {
  if (id === UNSCHEDULED_TARGET) return { kind: "unscheduled" };

  const slot = SLOT_TARGET.exec(id);

  if (slot) {
    const dayIndex = Number(slot[1]);
    const minutes = Number(slot[2]);

    return isDayIndex(dayIndex) && isSlotStart(minutes) ? { kind: "slot", dayIndex, minutes } : null;
  }

  const allDay = ALL_DAY_TARGET.exec(id);

  if (allDay) {
    const dayIndex = Number(allDay[1]);

    return isDayIndex(dayIndex) ? { kind: "allDay", dayIndex } : null;
  }

  return null;
}

export function dueAtForDropTarget(target: WeekDropTarget, weekStart: Date): Date | null {
  if (target.kind === "unscheduled") return null;

  const day = addDays(weekStart, target.dayIndex);
  const minutes = target.kind === "slot" ? target.minutes : 0;

  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}

export function dropTargetForDueAt(dueAt: Date | null, weekStart: Date): WeekDropTarget | null {
  if (!dueAt) return { kind: "unscheduled" };

  const dayIndex = activityWeekDayIndex(dueAt, weekStart);

  if (dayIndex === null) return null;
  if (isAllDayActivity(dueAt)) return { kind: "allDay", dayIndex };

  const minutes = minutesIntoDay(dueAt);

  return { kind: "slot", dayIndex, minutes: minutes - (minutes % WEEK_SLOT_MINUTES) };
}

export function neighbourDropTarget(target: WeekDropTarget, direction: WeekDirection): WeekDropTarget {
  switch (target.kind) {
    case "unscheduled":
      return direction === "down" ? { kind: "allDay", dayIndex: 0 } : target;
    case "allDay": {
      if (direction === "up") return { kind: "unscheduled" };
      if (direction === "down") return { kind: "slot", dayIndex: target.dayIndex, minutes: 0 };

      const dayIndex = target.dayIndex + (direction === "left" ? -1 : 1);

      return isDayIndex(dayIndex) ? { kind: "allDay", dayIndex } : target;
    }
    case "slot": {
      if (direction === "up") {
        return target.minutes === 0
          ? { kind: "allDay", dayIndex: target.dayIndex }
          : { ...target, minutes: target.minutes - WEEK_SLOT_MINUTES };
      }

      if (direction === "down") {
        const minutes = target.minutes + WEEK_SLOT_MINUTES;

        return minutes < MINUTES_PER_DAY ? { ...target, minutes } : target;
      }

      const dayIndex = target.dayIndex + (direction === "left" ? -1 : 1);

      return isDayIndex(dayIndex) ? { ...target, dayIndex } : target;
    }
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}
