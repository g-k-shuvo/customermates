import { AsyncLocalStorage } from "node:async_hooks";

export const AUTOMATION_MAX_CAUSATION_DEPTH = 1;

export type AutomationCausationContext = { automationId: string; runId: string; causationDepth: number };

const automationContextStorage = new AsyncLocalStorage<AutomationCausationContext>();

export function runInAutomationContext<T>(
  context: AutomationCausationContext | null,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!context) return Promise.resolve(fn());

  return automationContextStorage.run(context, () => Promise.resolve(fn()));
}

export function currentAutomationContext(): AutomationCausationContext | undefined {
  return automationContextStorage.getStore();
}

export function automationCausationDepth(): number {
  return currentAutomationContext()?.causationDepth ?? 0;
}

export function automationCausationExhausted(): boolean {
  return automationCausationDepth() >= AUTOMATION_MAX_CAUSATION_DEPTH;
}
