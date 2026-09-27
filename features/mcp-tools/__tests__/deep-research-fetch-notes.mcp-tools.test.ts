import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  getContactById: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetContactByIdInteractor: () => ({ invoke: spies.getContactById }),
}));

import { fetchTool } from "../deep-research.mcp-tools";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";

function contactWithNotes(notes: unknown) {
  spies.getContactById.mockResolvedValue({
    ok: true,
    data: { contact: { id: CONTACT_ID, firstName: "Ada", lastName: "Lovelace", notes } },
  });
}

async function fetchedText(): Promise<string> {
  const result = await fetchTool.execute({ id: `record:contact:${CONTACT_ID}` });
  if (!("structuredContent" in result)) throw new Error("the fetch was refused");

  return result.structuredContent.text;
}

beforeEach(() => vi.clearAllMocks());

describe("deep research fetch reads notes in every stored shape", () => {
  it("reads a web form message object instead of throwing", async () => {
    contactWithNotes({ message: "Please call me back" });

    expect(await fetchedText()).toContain("Please call me back");
  });

  it("reads a bare string left by an older writer", async () => {
    contactWithNotes("written before notes were documents");

    expect(await fetchedText()).toContain("written before notes were documents");
  });

  it("returns the record without notes when the notes cannot be read", async () => {
    contactWithNotes({ unexpected: true });

    const text = await fetchedText();

    expect(text).toContain(CONTACT_ID);
    expect(text).not.toContain("Notes:");
  });
});
