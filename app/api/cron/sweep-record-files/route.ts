import {
  getRedactCampaignRecipientsInteractor,
  getSweepMailAttachmentsInteractor,
  getSweepRecordFilesInteractor,
} from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });

  const result = await getSweepRecordFilesInteractor().invoke();
  const mail = await getSweepMailAttachmentsInteractor().invoke();
  const campaigns = await getRedactCampaignRecipientsInteractor().invoke();

  if (!result.ok) return Response.json({ ok: false });

  return Response.json({
    ...result.data,
    mailAttachmentsRemoved: mail.ok ? mail.data.removed : 0,
    campaignRecipientsRedacted: campaigns.ok ? campaigns.data.redacted : 0,
  });
}
