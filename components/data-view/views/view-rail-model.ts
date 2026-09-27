import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

export type RailChip = { kind: "all"; isActive: boolean } | { kind: "view"; view: DataViewChipDto; isActive: boolean };

export type ViewMenuItemId =
  | "copyLink"
  | "delete"
  | "duplicate"
  | "edit"
  | "moveLeft"
  | "moveRight"
  | "share"
  | "unshare";

export type ViewMenuItem = {
  id: ViewMenuItemId;
  isDestructive: boolean;
  isDisabled: boolean;
};

export type ViewMenuContext = {
  index: number;
  total: number;
  shared?: boolean;
};

function byPosition(left: DataViewChipDto, right: DataViewChipDto): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function actionItem(id: ViewMenuItemId, overrides: Partial<ViewMenuItem> = {}): ViewMenuItem {
  return { id, isDestructive: false, isDisabled: false, ...overrides };
}

export function sortViewsByPosition(views: readonly DataViewChipDto[]): DataViewChipDto[] {
  return [...views].sort(byPosition);
}

export function isOwnView(view: DataViewChipDto): boolean {
  return view.sharedBy === undefined;
}

export function ownViewsByPosition(views: readonly DataViewChipDto[]): DataViewChipDto[] {
  return sortViewsByPosition(views.filter(isOwnView));
}

export function orderChips(views: readonly DataViewChipDto[], activeViewKey: string): RailChip[] {
  const sorted = [...ownViewsByPosition(views), ...sortViewsByPosition(views.filter((view) => !isOwnView(view)))];
  const activeKey = sorted.some((view) => view.id === activeViewKey) ? activeViewKey : ALL_VIEW_KEY;

  return [
    { isActive: activeKey === ALL_VIEW_KEY, kind: "all" },
    ...sorted.map((view): RailChip => ({ isActive: view.id === activeKey, kind: "view", view })),
  ];
}

export function viewMenuItems(ctx: ViewMenuContext): ViewMenuItem[] {
  return [
    actionItem("edit"),
    actionItem("duplicate"),
    actionItem("moveLeft", { isDisabled: ctx.index <= 0 }),
    actionItem("moveRight", { isDisabled: ctx.index >= ctx.total - 1 }),
    actionItem(ctx.shared ? "unshare" : "share"),
    actionItem("copyLink"),
    actionItem("delete", { isDestructive: true }),
  ];
}

export function colleagueViewMenuItems(): ViewMenuItem[] {
  return [actionItem("duplicate"), actionItem("copyLink")];
}

export function allViewMenuItems(): ViewMenuItem[] {
  return [actionItem("duplicate"), actionItem("copyLink")];
}
