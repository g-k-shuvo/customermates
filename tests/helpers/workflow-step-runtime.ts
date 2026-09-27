type RetriedStep<A extends unknown[], R> = ((...args: A) => Promise<R>) & {
  maxRetries?: number;
};

export type StepAttempts<R> = {
  attempts: number;
  failed: boolean;
  value: R | undefined;
};

const WORKFLOW_DEFAULT_MAX_RETRIES = 3;

export async function runStepLikeTheWorkflowRuntime<A extends unknown[], R>(
  step: RetriedStep<A, R>,
  ...args: A
): Promise<StepAttempts<R>> {
  const allowed = (step.maxRetries ?? WORKFLOW_DEFAULT_MAX_RETRIES) + 1;

  for (let attempt = 1; attempt <= allowed; attempt += 1) {
    try {
      return { attempts: attempt, failed: false, value: await step(...args) };
    } catch {
      if (attempt === allowed)
        return { attempts: attempt, failed: true, value: undefined };
    }
  }

  return { attempts: allowed, failed: true, value: undefined };
}
