import { getReconcileAutomationRunsInteractor, getSweepDueAutomationsInteractor } from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  const reconciled = await getReconcileAutomationRunsInteractor().invoke();
  const swept = await getSweepDueAutomationsInteractor().invoke();

  return Response.json({
    ok: true,
    ...(swept.ok ? swept.data : {}),
    settledRuns: reconciled.ok ? reconciled.data.settled : 0,
  });
}
