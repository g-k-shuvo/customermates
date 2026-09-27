import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
  },
}));

const { Node } = await import("@tiptap/pm/model");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { editorSchema } = await import("@/components/editor/editor-extensions");
const { getProcessWebFormSubmissionInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

type DocumentNode = { type: string; text?: string; marks?: unknown[]; content?: DocumentNode[] };

async function leadNotesFor(fields: Record<string, unknown>): Promise<unknown> {
  const submissionId = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const source = await prisma.webFormSource.create({
      data: {
        companyId: company.id,
        name: "Website contact form",
        slug: `notes-${company.id}`,
        signingSecret: "vitest-signing-secret",
        fieldMapping: { email: "fields.email", firstName: "fields.name", message: "fields.message" },
      },
      select: { id: true },
    });
    const submission = await prisma.webFormSubmission.create({
      data: { companyId: company.id, sourceId: source.id, rawPayload: { fields } },
      select: { id: true },
    });

    return submission.id;
  });

  const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId });
  if (!outcome.ok || !outcome.data.leadId) throw new Error("the submission did not create a lead");

  const leadId = outcome.data.leadId;
  const lead = await runWithoutTenant(() => prisma.lead.findUniqueOrThrow({ where: { id: leadId } }));

  return lead.notes;
}

function nodesOf(node: DocumentNode): DocumentNode[] {
  return [node, ...(node.content ?? []).flatMap(nodesOf)];
}

describeDatabase("the notes a web form submission leaves on its lead", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("stores the message as a document the editor can open", async () => {
    const notes = await leadNotesFor({
      email: "ada@example.invalid",
      name: "Ada Lovelace",
      message: "Hello,\nI would like a quote.\n\nThanks",
    });

    expect(() => Node.fromJSON(editorSchema, notes).check()).not.toThrow();
    expect(notes).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello," },
            { type: "hardBreak" },
            { type: "text", text: "I would like a quote." },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Thanks" }] },
      ],
    });
  });

  it("keeps markdown from the public form as literal text, with no links or headings", async () => {
    const message = "# You won\n[claim the prize](https://evil.test) **today**";
    const notes = await leadNotesFor({ email: "grace@example.invalid", name: "Grace", message });

    const nodes = nodesOf(notes as DocumentNode);
    expect(nodes.some((node) => node.type === "heading")).toBe(false);
    expect(nodes.some((node) => (node.marks ?? []).length > 0)).toBe(false);
    expect(
      nodes
        .filter((node) => node.type === "text")
        .map((node) => node.text)
        .join("\n"),
    ).toBe(message);
  });

  it("stores no notes for a blank message", async () => {
    expect(await leadNotesFor({ email: "blank@example.invalid", name: "Blank", message: "   \n  " })).toBeNull();
  });

  it("stores no notes when the form sent no message", async () => {
    expect(await leadNotesFor({ email: "none@example.invalid", name: "None" })).toBeNull();
  });
});
