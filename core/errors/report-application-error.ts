import * as Sentry from "@sentry/nextjs";

import { isClientTransportError } from "./client-transport-error";

type ApplicationErrorHandler = (error: unknown) => void;

let activeHandler: ApplicationErrorHandler | null = null;

let demoEnvironment = false;

export function setDemoEnvironment(isDemo: boolean): void {
  demoEnvironment = isDemo;
}

export function isDemoEnvironment(): boolean {
  return demoEnvironment;
}

export function registerApplicationErrorHandler(handler: ApplicationErrorHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function reportApplicationError(error: unknown): void {
  if (!isDemoEnvironment() && !isClientTransportError(error)) Sentry.captureException(error);

  activeHandler?.(error);
}

export function runUserAction(action: () => unknown): void {
  try {
    void Promise.resolve(action()).catch(reportApplicationError);
  } catch (error) {
    reportApplicationError(error);
  }
}
