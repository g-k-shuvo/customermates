"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { CSSProperties, KeyboardEvent } from "react";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { PlacedWeekActivity, WeekDirection } from "@/features/tasks/activity-week";

import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EntityType } from "@/generated/prisma";

import { ActivityKindIcon } from "@/components/activity/activity-kind-icon";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AppLink } from "@/components/shared/app-link";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import {
  MINUTES_PER_DAY,
  WEEK_SLOT_MINUTES,
  dropTargetForDueAt,
  dueAtForDropTarget,
  neighbourDropTarget,
  parseWeekDropTarget,
  weekDropTargetId,
} from "@/features/tasks/activity-week";

import { ActivityCompleteToggle } from "./activity-complete-toggle";
import { WeekCalendarDayList, WeekCalendarRow } from "./task-week-calendar-events";
import { getSystemTaskNameTranslationKey } from "./system-task.config";

const SLOT_HEIGHT_PX = 22;
const SLOTS_PER_DAY = MINUTES_PER_DAY / WEEK_SLOT_MINUTES;
const DAY_HEIGHT_PX = SLOTS_PER_DAY * SLOT_HEIGHT_PX;
const FIRST_VISIBLE_HOUR = 7;
const ARROW_DIRECTIONS: Record<string, WeekDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function useActivityName() {
  const t = useTranslations();

  return (activity: TaskDto) => {
    const nameKey = getSystemTaskNameTranslationKey(activity.type);

    return nameKey ? t(nameKey) : activity.name;
  };
}

function completionTarget(activity: TaskDto) {
  return {
    id: activity.id,
    name: activity.name,
    activityKind: activity.activityKind,
    dueAt: activity.dueAt,
    completedAt: activity.completedAt,
    hasLinkedRecords: activity.contacts.length + activity.organizations.length + activity.deals.length > 0,
  };
}

function useKeyboardMove(activity: TaskDto) {
  const { taskWeekStore: store } = useRootStore();

  return (event: KeyboardEvent) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!event.altKey || !direction || !store.isDraggable(activity)) return;

    const current = dropTargetForDueAt(activity.dueAt, store.weekStart);
    if (!current) return;

    event.preventDefault();
    const next = neighbourDropTarget(current, direction);
    runUserAction(() => store.moveTask(activity.id, dueAtForDropTarget(next, store.weekStart)));
  };
}

const WeekActivityCard = observer(function WeekActivityCard({
  activity,
  className,
  style,
  compact = false,
}: {
  activity: TaskDto;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const entityHref = useEntityHref();
  const activityName = useActivityName();
  const onKeyDown = useKeyboardMove(activity);
  const { taskWeekStore: store } = useRootStore();
  const draggable = store.isDraggable(activity);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: activity.id,
    disabled: !draggable,
    attributes: { role: "group", roleDescription: t("Activities.week.draggableActivity"), tabIndex: -1 },
  });
  const isCompleted = activity.completedAt !== null;
  const name = activityName(activity);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 items-start gap-1 overflow-hidden rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-foreground",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "z-20 opacity-80 shadow-lg",
        isCompleted && "opacity-60",
        store.pendingMoves.has(activity.id) && "animate-pulse",
        className,
      )}
      data-activity-id={activity.id}
      style={{ ...style, transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      <ActivityKindIcon className="mt-0.5 shrink-0 text-muted-foreground" kind={activity.activityKind} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppLink
          className={cn("truncate font-medium hover:underline", isCompleted && "line-through")}
          href={entityHref(EntityType.task, activity.id)}
          title={name}
          onKeyDown={onKeyDown}
        >
          {name}
        </AppLink>

        {!compact && activity.dueAt && (
          <span className="truncate text-muted-foreground">{intl.formatTime(activity.dueAt)}</span>
        )}
      </div>
    </div>
  );
});

const WeekSlot = observer(function WeekSlot({ dayIndex, slot }: { dayIndex: number; slot: number }) {
  const minutes = slot * WEEK_SLOT_MINUTES;
  const id = weekDropTargetId({ kind: "slot", dayIndex, minutes });
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn("border-b border-border/40", minutes % 60 === 30 && "border-dashed", isOver && "bg-primary/15")}
      data-week-target={id}
      style={{ height: SLOT_HEIGHT_PX }}
    />
  );
});

const WeekAllDayCell = observer(function WeekAllDayCell({ dayIndex, items }: { dayIndex: number; items: TaskDto[] }) {
  const id = weekDropTargetId({ kind: "allDay", dayIndex });
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn("flex min-h-10 min-w-0 flex-col gap-1 border-l border-border/60 p-1", isOver && "bg-primary/15")}
      data-week-target={id}
    >
      {items.map((item) => (
        <WeekActivityCard key={item.id} compact activity={item} />
      ))}
    </div>
  );
});

const WeekDayColumn = observer(function WeekDayColumn({
  dayIndex,
  placed,
}: {
  dayIndex: number;
  placed: PlacedWeekActivity<TaskDto>[];
}) {
  return (
    <div className="relative min-w-0 border-l border-border/60" style={{ height: DAY_HEIGHT_PX }}>
      {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
        <WeekSlot key={slot} dayIndex={dayIndex} slot={slot} />
      ))}

      {placed.map((entry) => (
        <WeekActivityCard
          key={entry.item.id}
          activity={entry.item}
          className="absolute"
          compact={entry.endMinutes - entry.startMinutes <= WEEK_SLOT_MINUTES}
          style={{
            top: (entry.startMinutes / WEEK_SLOT_MINUTES) * SLOT_HEIGHT_PX,
            height: Math.max(
              ((entry.endMinutes - entry.startMinutes) / WEEK_SLOT_MINUTES) * SLOT_HEIGHT_PX - 2,
              SLOT_HEIGHT_PX - 2,
            ),
            left: `calc(${(entry.lane / entry.laneCount) * 100}% + 2px)`,
            width: `calc(${100 / entry.laneCount}% - 4px)`,
          }}
        />
      ))}
    </div>
  );
});

const WeekTray = observer(function WeekTray() {
  const t = useTranslations();
  const { taskWeekStore: store } = useRootStore();
  const { setNodeRef, isOver } = useDroppable({ id: weekDropTargetId({ kind: "unscheduled" }) });

  return (
    <section
      ref={setNodeRef}
      aria-label={t("Activities.week.unscheduled")}
      className={cn("flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3", isOver && "bg-primary/10")}
    >
      <h3 className="text-sm font-medium">{t("Activities.week.unscheduledCount", { count: store.trayCount })}</h3>

      {store.trayItems.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {store.trayItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <ActivityCompleteToggle activity={completionTarget(item)} />

              <WeekActivityCard compact activity={item} className="flex-1" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("Activities.week.noUnscheduled")}</p>
      )}
    </section>
  );
});

const WeekDayList = observer(function WeekDayList() {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const { taskWeekStore: store } = useRootStore();
  const dayIndex = store.selectedDayIndex;
  const allDay = store.layout.allDay[dayIndex] ?? [];
  const timed = store.layout.timed[dayIndex] ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div aria-label={t("Activities.week.pickDay")} className="grid grid-cols-7 gap-1" role="group">
        {store.days.map((day, index) => (
          <Button
            key={day.toISOString()}
            aria-pressed={index === dayIndex}
            className="flex h-auto flex-col px-0 py-1.5"
            size="sm"
            variant={index === dayIndex ? "default" : "secondary"}
            onClick={() => store.selectDay(index)}
          >
            <span className="text-[10px] uppercase">{intl.formatWeekday(day)}</span>

            <span className="text-sm font-semibold">{intl.formatDayOfMonth(day)}</span>
          </Button>
        ))}
      </div>

      <WeekCalendarDayList />

      {allDay.length + timed.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Activities.week.emptyDay")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {allDay.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <ActivityCompleteToggle activity={completionTarget(item)} />

              <span className="w-16 shrink-0 text-xs text-muted-foreground">{t("Activities.week.allDay")}</span>

              <WeekActivityCard compact activity={item} className="flex-1" />
            </li>
          ))}

          {timed.map((entry) => (
            <li key={entry.item.id} className="flex items-center gap-2">
              <ActivityCompleteToggle activity={completionTarget(entry.item)} />

              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                {entry.item.dueAt ? intl.formatTime(entry.item.dueAt) : ""}
              </span>

              <WeekActivityCard compact activity={entry.item} className="flex-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export const TaskWeekView = observer(function TaskWeekView() {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const { taskWeekStore: store } = useRootStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => store.connect(), [store]);

  useEffect(() => {
    if (store.status === "ready" && scrollRef.current && scrollRef.current.scrollTop === 0)
      scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * 2 * SLOT_HEIGHT_PX;
  }, [store.status]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const target = parseWeekDropTarget(String(over.id));
    if (!target) return;

    runUserAction(() => store.moveTask(String(active.id), dueAtForDropTarget(target, store.weekStart)));
  };

  const today = new Date();

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label={t("Activities.week.previousWeek")}
          size="icon"
          variant="secondary"
          onClick={() => runUserAction(() => store.goToPreviousWeek())}
        >
          <Icon icon={ChevronLeft} size="sm" />
        </Button>

        <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.goToToday())}>
          {t("Activities.week.today")}
        </Button>

        <Button
          aria-label={t("Activities.week.nextWeek")}
          size="icon"
          variant="secondary"
          onClick={() => runUserAction(() => store.goToNextWeek())}
        >
          <Icon icon={ChevronRight} size="sm" />
        </Button>

        <h2 aria-live="polite" className="text-sm font-semibold">
          {intl.formatDateRange(store.weekStart, store.weekEnd)}
        </h2>

        {store.canFilterMine && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Switch
              checked={store.onlyMine}
              onCheckedChange={(checked) => runUserAction(() => store.setOnlyMine(checked))}
            />

            {t("Activities.week.onlyMine")}
          </label>
        )}
      </div>

      {store.canReschedule && (
        <p className="hidden text-xs text-muted-foreground sm:block">{t("Activities.week.moveHint")}</p>
      )}

      {store.truncated && <p className="text-xs text-muted-foreground">{t("Activities.week.truncated")}</p>}

      {store.status === "error" ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border/60 p-4">
          <p className="text-sm">{t("Activities.week.loadError")}</p>

          <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.load())}>
            {t("Activities.week.retry")}
          </Button>
        </div>
      ) : (
        <DndContext collisionDetection={pointerWithin} id="task-week" sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="sm:hidden">
            <WeekDayList />
          </div>

          <div
            aria-busy={store.status === "loading" || store.isRefreshing}
            aria-label={t("Activities.week.gridLabel")}
            className={cn(
              "hidden flex-col overflow-hidden rounded-lg border border-border/60 bg-card sm:flex",
              store.status === "loading" && "opacity-60",
            )}
            role="region"
          >
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/60">
              <div />

              {store.days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-l border-border/60 px-2 py-1.5 text-xs",
                    day.toDateString() === today.toDateString() && "font-semibold text-primary",
                  )}
                >
                  {intl.formatWeekdayDate(day)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/60">
              <div className="px-1 py-1.5 text-[10px] text-muted-foreground">{t("Activities.week.allDay")}</div>

              {store.days.map((day, dayIndex) => (
                <WeekAllDayCell key={day.toISOString()} dayIndex={dayIndex} items={store.layout.allDay[dayIndex]} />
              ))}
            </div>

            <WeekCalendarRow />

            <div ref={scrollRef} className="max-h-[65svh] overflow-y-auto">
              <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
                <div className="relative" style={{ height: DAY_HEIGHT_PX }}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      key={hour}
                      className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                      style={{ top: hour * 2 * SLOT_HEIGHT_PX }}
                    >
                      {hour === 0 ? "" : intl.formatTime(new Date(2000, 0, 3, hour))}
                    </span>
                  ))}
                </div>

                {store.days.map((day, dayIndex) => (
                  <WeekDayColumn key={day.toISOString()} dayIndex={dayIndex} placed={store.layout.timed[dayIndex]} />
                ))}
              </div>
            </div>
          </div>

          <WeekTray />
        </DndContext>
      )}
    </div>
  );
});
