export type TaskCompletionWrite = {
  completedAt: Date | null;
  completedById: string | null;
};

export function completeTransition(completedAt: Date, completedById: string): TaskCompletionWrite {
  return { completedAt, completedById };
}

export function uncompleteTransition(): TaskCompletionWrite {
  return { completedAt: null, completedById: null };
}
