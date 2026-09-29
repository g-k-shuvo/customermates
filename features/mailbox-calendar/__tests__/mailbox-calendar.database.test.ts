import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CalendarFetch } from "../calendar-providers";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { parseSecretBoxKey } from "@/features/mailbox/credentials/secret-box";
import { MailboxCredentialAuth } from "@/features/mailbox/oauth/mailbox-credential-auth";
import { mailboxOAuthSettingsFrom } from "@/features/mailbox/oauth/mailbox-oauth-providers";
import { openMailboxTokenBundle, sealMailboxTokenBundle } from "@/features/mailbox/oauth/mailbox-oauth-tokens";

import { MailboxCalendarSync } from "../mailbox-calendar-sync";
import { PrismaMailboxCalendarRepo } from "../prisma-mailbox-calendar.repository";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const KEY = parseSecretBoxKey(Buffer.alloc(32, 4).toString("base64"));
const NOW = new Date("2026-10-01T09:00:00Z");
const SETTINGS = mailboxOAuthSettingsFrom({
  MAILBOX_GOOGLE_CLIENT_ID: "g",
  MAILBOX_GOOGLE_CLIENT_SECRET: "gs",
  MAILBOX_MICROSOFT_CLIENT_ID: "m",
  MAILBOX_MICROSOFT_CLIENT_SECRET: "ms",
  BASE_URL: "https://crm.example.com",
});

const companyId = randomUUID();
const owner = createMockUser({ id: randomUUID(), companyId, email: `o-${randomUUID()}@x.test` });
const colleague = createMockUser({ id: randomUUID(), companyId, email: `c-${randomUUID()}@x.test` });
const googleAccount = randomUUID();
const microsoftAccount = randomUUID();
const contactId = randomUUID();

async function prismaClient() {
  const { prisma } = await import("@/prisma/db");

  return prisma;
}

function page(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function googleEvent(id: string, attendee: string, start: string) {
  return {
    id,
    summary: `Meeting ${id}`,
    start: { dateTime: start },
    end: { dateTime: new Date(Date.parse(start) + 3_600_000).toISOString() },
    attendees: [{ email: attendee }],
  };
}

function syncFor(fetcher: CalendarFetch, tokenFetcher: CalendarFetch = vi.fn()) {
  const repo = new PrismaMailboxCalendarRepo();
  const auth = new MailboxCredentialAuth(KEY, SETTINGS, repo, tokenFetcher, () => NOW);

  return { repo, sync: new MailboxCalendarSync(repo, auth, fetcher, () => NOW) };
}

describeDatabase("mailbox calendar sync", () => {
  beforeAll(async () => {
    const prisma = await prismaClient();

    await runWithTenant(owner, async () => {
      await prisma.company.create({ data: { id: companyId, updatedAt: new Date() } });
      for (const user of [owner, colleague]) {
        await prisma.user.create({
          data: { id: user.id, companyId, email: user.email, firstName: "T", lastName: "U" },
        });
      }
      for (const [id, provider] of [
        [googleAccount, "google"],
        [microsoftAccount, "microsoft"],
      ] as const) {
        await prisma.connectedAccount.create({
          data: {
            id,
            companyId,
            userId: owner.id,
            unipileAccountId: `imap:${id}`,
            provider: "mail",
            status: "ok",
            hasMessaging: true,
            emailAddress: `${provider}@owner.example`,
          },
        });
        await prisma.mailboxCredential.create({
          data: {
            companyId,
            connectedAccountId: id,
            imapHost: "imap.example.test",
            imapPort: 993,
            username: `${provider}@owner.example`,
            oauthProvider: provider,
            calendarSyncEnabled: true,
            sealedSecret: sealMailboxTokenBundle(KEY, {
              refreshToken: `${provider}-rt`,
              accessToken: `${provider}-mail-token`,
              expiresAt: "2026-10-01T10:00:00.000Z",
            }),
          },
        });
      }
      await prisma.contact.create({ data: { id: contactId, companyId, firstName: "Anna", lastName: "Buyer" } });
      await prisma.contactIdentifier.create({
        data: { companyId, contactId, provider: "mail", channelClass: "email", value: "anna@buyer.example" },
      });
    });
  }, 60_000);

  afterAll(async () => {
    const prisma = await prismaClient();
    await runWithTenant(owner, () => prisma.company.delete({ where: { id: companyId } }));
  }, 60_000);

  it("stores a first sync, links attendees to contacts and keeps the sync token", async () => {
    const fetcher = vi.fn<CalendarFetch>().mockResolvedValueOnce(
      page({
        items: [
          googleEvent("g1", "Anna@buyer.example", "2026-10-02T09:00:00Z"),
          googleEvent("g2", "someone@else.example", "2026-10-03T09:00:00Z"),
        ],
        nextSyncToken: "sync-1",
      }),
    );
    const { sync, repo } = syncFor(fetcher);

    const result = await runWithTenant(owner, () => sync.run(googleAccount, 5));
    const mine = await runWithTenant(owner, () =>
      repo.listEvents(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z")),
    );
    const meetings = await runWithTenant(owner, () => repo.listContactEvents(contactId, 10));

    expect(result).toEqual({
      ok: true,
      outcome: { connectedAccountId: googleAccount, stored: 2, removed: 0, complete: true },
    });
    expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: "Bearer google-mail-token" });
    expect(mine.map((event) => event.title)).toEqual(["Meeting g1", "Meeting g2"]);
    expect(meetings.map((event) => event.title)).toEqual(["Meeting g1"]);
    expect((await runWithTenant(owner, () => repo.findCalendarMailbox(googleAccount)))?.calendarSyncCursor).toBe(
      "sync:sync-1",
    );
  });

  it("applies an incremental change set and removes cancelled events", async () => {
    const fetcher = vi
      .fn<CalendarFetch>()
      .mockResolvedValueOnce(page({ items: [{ id: "g2", status: "cancelled" }], nextSyncToken: "sync-2" }));
    const { sync, repo } = syncFor(fetcher);

    const result = await runWithTenant(owner, () => sync.run(googleAccount, 5));

    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("syncToken")).toBe("sync-1");
    expect(result).toMatchObject({ ok: true, outcome: { removed: 1 } });
    expect(
      (
        await runWithTenant(owner, () =>
          repo.listEvents(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z")),
        )
      ).map((event) => event.title),
    ).toEqual(["Meeting g1"]);
  });

  it("shows nothing of the owner's calendar to a colleague", async () => {
    const { sync, repo } = syncFor(vi.fn<CalendarFetch>());

    await expect(runWithTenant(colleague, () => sync.run(googleAccount, 1))).resolves.toBeNull();
    await expect(
      runWithTenant(colleague, () =>
        repo.listEvents(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z")),
      ),
    ).resolves.toEqual([]);
    await expect(runWithTenant(colleague, () => repo.listContactEvents(contactId, 10))).resolves.toEqual([]);
  });

  it("gets Microsoft a separate Graph token once, caches it, and reads the delta", async () => {
    const tokenFetcher = vi
      .fn<CalendarFetch>()
      .mockResolvedValue(page({ access_token: "graph-token", refresh_token: "microsoft-rt-2", expires_in: 3600 }));
    const fetcher = vi
      .fn<CalendarFetch>()
      .mockImplementation(() =>
        Promise.resolve(
          page({ value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?d=1" }),
        ),
      );
    const { sync } = syncFor(fetcher, tokenFetcher);

    await runWithTenant(owner, () => sync.run(microsoftAccount, 1));
    await runWithTenant(owner, () => sync.run(microsoftAccount, 1));

    expect(tokenFetcher).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(String(tokenFetcher.mock.calls[0]?.[1].body)).get("scope")).toBe(
      "https://graph.microsoft.com/Calendars.Read offline_access",
    );
    expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: "Bearer graph-token" });

    const prisma = await prismaClient();
    const stored = await runWithTenant(owner, () =>
      prisma.mailboxCredential.findFirstOrThrow({
        where: { companyId, connectedAccountId: microsoftAccount },
        select: { sealedSecret: true },
      }),
    );
    expect(openMailboxTokenBundle(KEY, stored.sealedSecret)).toMatchObject({
      refreshToken: "microsoft-rt-2",
      accessToken: "microsoft-mail-token",
      calendarAccessToken: "graph-token",
    });
  });

  it("reports a missing calendar grant and clears the events when sync is switched off", async () => {
    const { sync, repo } = syncFor(vi.fn<CalendarFetch>().mockResolvedValue(page({}, 403)));
    await runWithTenant(owner, () => repo.saveCalendarCursor(googleAccount, null, null));

    await expect(runWithTenant(owner, () => sync.run(googleAccount, 1))).resolves.toEqual({
      ok: false,
      failure: "accessMissing",
    });

    await runWithTenant(owner, async () => {
      await repo.setCalendarSync(googleAccount, false);
      await repo.clearCalendarEvents(googleAccount);
    });
    await expect(runWithTenant(owner, () => repo.listContactEvents(contactId, 10))).resolves.toEqual([]);
  });
});
