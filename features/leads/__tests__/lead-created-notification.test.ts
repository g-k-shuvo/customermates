import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { BASE_URL: "https://crm.example" } }));
vi.mock("@/i18n/get-translator", () => ({ getTranslator: () => Promise.resolve((key: string) => key) }));
vi.mock("@/components/emails/base/email-layout-copy", () => ({ getEmailLayoutCopy: () => Promise.resolve({}) }));
vi.mock("@/components/emails/lead-created-notice", () => ({ default: () => null }));

import { LeadCreatedNotificationListener } from "../listener/lead-created-notification.listener";
import { DomainEvent } from "@/features/event/domain-events";

const LEAD_ID = "00000000-0000-4000-8000-000000000301";
const payload = { title: "Website enquiry", sourceOrigin: "webform", source: null, contact: null, organization: null };

function listener(owner: { email: string; displayLanguage: string } | null, admins: { email: string }[]) {
  const repo = {
    findLeadOwnerCompanyWide: vi.fn().mockResolvedValue(owner),
    findCompanyAdminsCompanyWide: vi.fn().mockResolvedValue(admins.map((a) => ({ ...a, displayLanguage: "system" }))),
  };
  const emailService = { send: vi.fn().mockResolvedValue(undefined) };
  const instance = new LeadCreatedNotificationListener(repo as never, emailService as never);
  const handler = instance.handlers[DomainEvent.LEAD_CREATED];
  if (!handler) throw new Error("listener does not handle lead.created");

  return { repo, emailService, handle: () => handler({ entityId: LEAD_ID, payload } as never) };
}

describe("lead created notification", () => {
  it("tells the owner", async () => {
    const { emailService, repo, handle } = listener({ email: "owner@example.com", displayLanguage: "system" }, []);

    await handle();

    expect(emailService.send.mock.calls.map(([mail]) => mail.to)).toEqual(["owner@example.com"]);
    expect(repo.findCompanyAdminsCompanyWide).not.toHaveBeenCalled();
  });

  it("tells every admin when nobody owns the lead, so a website lead is never missed", async () => {
    const { emailService, handle } = listener(null, [{ email: "a@example.com" }, { email: "b@example.com" }]);

    await handle();

    expect(emailService.send.mock.calls.map(([mail]) => mail.to)).toEqual(["a@example.com", "b@example.com"]);
    expect(emailService.send.mock.calls[0][0].react.props.leadLink).toBe(`https://crm.example/leads/${LEAD_ID}`);
  });
});
