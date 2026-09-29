import { StorageQuota } from "@/core/storage/storage-quota";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { TenantUser } from "@/features/user/user.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let mockUser: TenantUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { Action, RecordDocumentFileKind, RecordDocumentStatus, Resource } from "@/generated/prisma";
import { StorageError, StorageFailure } from "@/core/storage/storage-provider";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { CreateRecordDocumentInteractor } from "../upload/create-record-document.interactor";
import { CreateSignedCopyUploadInteractor } from "../upload/create-signed-copy-upload.interactor";
import { CompleteRecordDocumentFileInteractor } from "../upload/complete-record-document-file.interactor";
import { GetRecordDocumentDownloadInteractor } from "../get/get-record-document-download.interactor";
import { UpdateRecordDocumentInteractor } from "../update/update-record-document.interactor";
import { DeleteRecordDocumentInteractor } from "../delete/delete-record-document.interactor";
import { SweepRecordDocumentsInteractor } from "../sweep/sweep-record-documents.interactor";

const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";
const FILE_ID = "60000000-0000-4000-8000-000000000002";
const RECORD_ID = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-27T10:00:00Z");

const userService = {
  hasPermissionForUser: (user: TenantUser, resource: Resource, action: Action) =>
    Boolean(
      user.role?.isSystemRole ||
        user.role?.permissions.some((permission) => permission.resource === resource && permission.action === action),
    ),
} as never;

function storage(overrides: Partial<StorageProvider> = {}) {
  const spies = {
    presignUpload: vi.fn((args: { key: string }) =>
      Promise.resolve({
        url: `https://files.example.com/bucket/${args.key}?X-Amz-Signature=abc`,
        method: "PUT" as const,
        headers: { "content-type": "application/pdf" },
        expiresAt: NOW,
      }),
    ),
    presignDownload: vi.fn(() =>
      Promise.resolve({ url: "https://files.example.com/bucket/object?sig", expiresAt: NOW }),
    ),
    deleteObject: vi.fn((_key: string) => Promise.resolve()),
  };
  const provider = {
    configured: true,
    maxUploadBytes: 1024 * 1024,
    statObject: vi.fn(() => Promise.resolve({ byteSize: 4096, contentType: "application/pdf" })),
    getObject: vi.fn(),
    putObject: vi.fn(),
    ...spies,
    ...overrides,
  } as StorageProvider;
  return { provider, spies };
}

const FILE_DTO = {
  id: FILE_ID,
  kind: RecordDocumentFileKind.original,
  fileName: "NDA.pdf",
  byteSize: 4096,
  uploadedBy: null,
  createdAt: NOW,
};

const DOCUMENT_DTO = {
  id: DOCUMENT_ID,
  entityType: "deal" as const,
  recordId: RECORD_ID,
  title: "NDA",
  status: RecordDocumentStatus.sent,
  statusChangedAt: NOW,
  original: FILE_DTO,
  signed: null,
  signature: null,
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function issueCodes(result: {
  ok: boolean;
  error?: { issues: { path: PropertyKey[]; params?: { error?: string } }[] };
}) {
  return result.ok ? [] : (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.params?.error]);
}

beforeEach(() => {
  mockUser = createMockUser();
});

describe("CreateRecordDocumentInteractor", () => {
  function setup(storageOverrides: Partial<StorageProvider> = {}, accessible = true) {
    const repo = {
      isRecordAccessible: vi.fn(() => Promise.resolve(accessible)),
      createDocumentWithPendingOriginal: vi.fn((args: Record<string, unknown>) =>
        Promise.resolve({ document: { ...DOCUMENT_DTO, original: null, ...args }, file: FILE_DTO }),
      ),
    };
    const { provider, spies } = storage(storageOverrides);
    return {
      repo,
      spies,
      interactor: new CreateRecordDocumentInteractor(
        repo as never,
        provider,
        userService,
        new StorageQuota({ usedBytesCompanyWide: () => Promise.resolve(0) }, null),
      ),
    };
  }

  const request = {
    entityType: "deal" as const,
    recordId: RECORD_ID,
    fileName: "NDA Müller.PDF",
    contentType: "application/pdf",
    byteSize: 4096,
  };

  it("registers a draft titled after the file, with its PDF pending under a document key", async () => {
    const { repo, spies, interactor } = setup();

    const result = await interactor.invoke(request);

    expect(result.ok).toBe(true);
    const created = repo.createDocumentWithPendingOriginal.mock.calls[0][0] as {
      storageKey: string;
      title: string;
      status: string;
    };
    expect(created).toMatchObject({
      title: "NDA Müller",
      status: RecordDocumentStatus.draft,
      fileName: "NDA Müller.PDF",
    });
    expect(created.storageKey).toMatch(new RegExp(`^${mockUser.companyId}/document/${RECORD_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(spies.presignUpload).toHaveBeenCalledWith({
      key: created.storageKey,
      contentType: "application/pdf",
      byteSize: 4096,
    });
  });

  it("keeps a title and status the caller chose", async () => {
    const { repo, interactor } = setup();

    await interactor.invoke({ ...request, title: "  Mutual NDA  ", status: RecordDocumentStatus.sent });

    expect(repo.createDocumentWithPendingOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Mutual NDA", status: RecordDocumentStatus.sent }),
    );
  });

  it("takes PDFs only, naming the field, and creates nothing otherwise", async () => {
    const { repo, interactor } = setup();

    const word = await interactor.invoke({
      ...request,
      fileName: "NDA.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const disguised = await interactor.invoke({ ...request, contentType: "text/html" });
    const big = await interactor.invoke({ ...request, byteSize: 2 * 1024 * 1024 });

    expect(issueCodes(word)).toEqual([["fileName", CustomErrorCode.documentNotPdf]]);
    expect(issueCodes(disguised)).toEqual([["fileName", CustomErrorCode.documentNotPdf]]);
    expect(issueCodes(big)).toEqual([["byteSize", CustomErrorCode.fileTooLarge]]);
    expect(repo.createDocumentWithPendingOriginal).not.toHaveBeenCalled();
  });

  it("says storage is not configured, and treats a record the caller cannot see as not found", async () => {
    const unconfigured = setup({ configured: false });
    const hidden = setup({}, false);

    expect(issueCodes(await unconfigured.interactor.invoke(request))).toEqual([
      ["", CustomErrorCode.fileStorageNotConfigured],
    ]);
    expect(issueCodes(await hidden.interactor.invoke(request))).toEqual([["recordId", CustomErrorCode.dealNotFound]]);
  });

  it("requires update permission on the record's own type", async () => {
    mockUser = createMockUserWithPermissions([
      { resource: Resource.contacts, action: Action.update },
      { resource: Resource.deals, action: Action.readAll },
    ]);
    const { repo, interactor } = setup();

    expect(issueCodes(await interactor.invoke(request))).toEqual([["entityType", CustomErrorCode.permissionDenied]]);
    expect(repo.createDocumentWithPendingOriginal).not.toHaveBeenCalled();
  });
});

describe("CreateSignedCopyUploadInteractor", () => {
  const request = { id: DOCUMENT_ID, fileName: "NDA signed.pdf", contentType: "application/pdf", byteSize: 5000 };

  it("registers the executed PDF as a pending signed file on the document's record", async () => {
    const repo = {
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(DOCUMENT_DTO)),
      createPendingSignedFile: vi.fn((args: Record<string, unknown>) =>
        Promise.resolve({ ...FILE_DTO, kind: RecordDocumentFileKind.signed, ...args }),
      ),
    };
    const { provider } = storage();

    const result = await new CreateSignedCopyUploadInteractor(repo as never, provider, userService).invoke(request);

    expect(result.ok).toBe(true);
    expect(repo.createPendingSignedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        fileName: "NDA signed.pdf",
        byteSize: 5000,
        storageKey: expect.stringMatching(new RegExp(`^${mockUser.companyId}/document/${RECORD_ID}/`)),
      }),
    );
  });

  it("returns not found for a document the caller cannot see, and checks the document's own type", async () => {
    const missing = { findListedDocumentOrNull: vi.fn(() => Promise.resolve(null)), createPendingSignedFile: vi.fn() };
    const { provider } = storage();

    const notFound = await new CreateSignedCopyUploadInteractor(missing as never, provider, userService).invoke(
      request,
    );

    mockUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.update }]);
    const found = {
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(DOCUMENT_DTO)),
      createPendingSignedFile: vi.fn(),
    };
    const denied = await new CreateSignedCopyUploadInteractor(found as never, provider, userService).invoke(request);

    expect(issueCodes(notFound)).toEqual([["id", CustomErrorCode.recordDocumentNotFound]]);
    expect(issueCodes(denied)).toEqual([["id", CustomErrorCode.permissionDenied]]);
    expect(found.createPendingSignedFile).not.toHaveBeenCalled();
  });
});

describe("CompleteRecordDocumentFileInteractor", () => {
  const pending = (kind: RecordDocumentFileKind) => ({
    id: FILE_ID,
    documentId: DOCUMENT_ID,
    entityType: "deal" as const,
    kind,
    storageKey: "company/document/record/new.pdf",
    byteSize: 4096,
  });

  function setup(kind: RecordDocumentFileKind, stat: { byteSize: number; contentType: string | null } | null) {
    const order: string[] = [];
    const repo = {
      findPendingFileOrNull: vi.fn(() => Promise.resolve(pending(kind))),
      findSupersededSignedFiles: vi.fn(() =>
        Promise.resolve([{ id: "old", storageKey: "company/document/record/old.pdf" }]),
      ),
      discardPendingFile: vi.fn(() => Promise.resolve()),
      markFileReadyOrNull: vi.fn(() => {
        order.push("markReady");
        return Promise.resolve(DOCUMENT_DTO);
      }),
    };
    const { provider, spies } = storage({ statObject: vi.fn(() => Promise.resolve(stat)) });
    spies.deleteObject.mockImplementation((key: string) => {
      order.push(`delete:${key}`);
      return Promise.resolve();
    });
    const interactor = new CompleteRecordDocumentFileInteractor(repo as never, provider, userService);
    return { repo, spies, order, interactor };
  }

  it("lists a new document once its PDF is in storage with the registered size", async () => {
    const { repo, interactor } = setup(RecordDocumentFileKind.original, {
      byteSize: 4096,
      contentType: "application/pdf",
    });

    await expect(interactor.invoke({ id: DOCUMENT_ID, fileId: FILE_ID })).resolves.toEqual({
      ok: true,
      data: DOCUMENT_DTO,
    });
    expect(repo.findSupersededSignedFiles).not.toHaveBeenCalled();
    expect(repo.markFileReadyOrNull).toHaveBeenCalledWith(pending(RecordDocumentFileKind.original), []);
  });

  it("replaces an earlier signed copy, removing its object only after the new one is recorded", async () => {
    const { repo, order, interactor } = setup(RecordDocumentFileKind.signed, {
      byteSize: 4096,
      contentType: "application/pdf",
    });

    await interactor.invoke({ id: DOCUMENT_ID, fileId: FILE_ID });

    expect(repo.markFileReadyOrNull).toHaveBeenCalledWith(pending(RecordDocumentFileKind.signed), [
      { id: "old", storageKey: "company/document/record/old.pdf" },
    ]);
    expect(order).toEqual(["markReady", "delete:company/document/record/old.pdf"]);
  });

  it("keeps the file pending when the object has not arrived, so the call can be repeated", async () => {
    const { repo, interactor } = setup(RecordDocumentFileKind.original, null);

    expect(issueCodes(await interactor.invoke({ id: DOCUMENT_ID, fileId: FILE_ID }))).toEqual([
      ["fileId", CustomErrorCode.fileUploadIncomplete],
    ]);
    expect(repo.discardPendingFile).not.toHaveBeenCalled();
    expect(repo.markFileReadyOrNull).not.toHaveBeenCalled();
  });

  it("discards an upload whose size or type does not match", async () => {
    const { repo, spies, interactor } = setup(RecordDocumentFileKind.original, {
      byteSize: 4096,
      contentType: "text/html",
    });

    expect(issueCodes(await interactor.invoke({ id: DOCUMENT_ID, fileId: FILE_ID }))).toEqual([
      ["fileId", CustomErrorCode.fileUploadIncomplete],
    ]);
    expect(spies.deleteObject).toHaveBeenCalledWith("company/document/record/new.pdf");
    expect(repo.discardPendingFile).toHaveBeenCalledWith(pending(RecordDocumentFileKind.original));
  });

  it("reports an unreachable bucket as unavailable", async () => {
    const repo = { findPendingFileOrNull: vi.fn(() => Promise.resolve(pending(RecordDocumentFileKind.original))) };
    const { provider } = storage({
      statObject: vi.fn(() => Promise.reject(new StorageError(StorageFailure.unavailable))),
    });

    const result = await new CompleteRecordDocumentFileInteractor(repo as never, provider, userService).invoke({
      id: DOCUMENT_ID,
      fileId: FILE_ID,
    });

    expect(issueCodes(result)).toEqual([["", CustomErrorCode.fileStorageUnavailable]]);
  });
});

describe("GetRecordDocumentDownloadInteractor", () => {
  const original = { storageKey: "k-original", fileName: "NDA.pdf" };
  const signed = { storageKey: "k-signed", fileName: "NDA signed.pdf" };

  async function linkFor(
    pdfs: { original: typeof original; signed: typeof signed | null },
    version?: "original" | "signed",
  ) {
    const repo = { findListedDocumentPdfsOrNull: vi.fn(() => Promise.resolve(pdfs)) };
    const { provider, spies } = storage();
    const result = await new GetRecordDocumentDownloadInteractor(repo as never, provider).invoke({
      id: DOCUMENT_ID,
      version,
    });
    return { result, spies };
  }

  it("opens the signed copy by default, and the original when there is none or it is asked for", async () => {
    const bySigned = await linkFor({ original, signed });
    const byOriginal = await linkFor({ original, signed: null });
    const asked = await linkFor({ original, signed }, "original");

    expect(bySigned.spies.presignDownload).toHaveBeenCalledWith({
      key: "k-signed",
      fileName: "NDA signed.pdf",
      contentType: "application/pdf",
      disposition: "inline",
    });
    expect(byOriginal.spies.presignDownload).toHaveBeenCalledWith(expect.objectContaining({ key: "k-original" }));
    expect(asked.spies.presignDownload).toHaveBeenCalledWith(expect.objectContaining({ key: "k-original" }));
  });

  it("returns not found for a missing signed copy or an invisible document", async () => {
    const noSigned = await linkFor({ original, signed: null }, "signed");
    const repo = { findListedDocumentPdfsOrNull: vi.fn(() => Promise.resolve(null)) };
    const hidden = await new GetRecordDocumentDownloadInteractor(repo as never, storage().provider).invoke({
      id: DOCUMENT_ID,
    });

    expect(issueCodes(noSigned.result)).toEqual([["version", CustomErrorCode.recordDocumentNotFound]]);
    expect(issueCodes(hidden)).toEqual([["id", CustomErrorCode.recordDocumentNotFound]]);
  });
});

describe("UpdateRecordDocumentInteractor", () => {
  it("passes only the provided changes", async () => {
    const repo = {
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(DOCUMENT_DTO)),
      updateDocumentOrNull: vi.fn(() => Promise.resolve({ ...DOCUMENT_DTO, status: RecordDocumentStatus.declined })),
    };

    const result = await new UpdateRecordDocumentInteractor(repo as never, userService).invoke({
      id: DOCUMENT_ID,
      status: RecordDocumentStatus.declined,
    });

    expect(result).toMatchObject({ ok: true, data: { status: RecordDocumentStatus.declined } });
    expect(repo.updateDocumentOrNull).toHaveBeenCalledWith(DOCUMENT_ID, {
      title: undefined,
      status: RecordDocumentStatus.declined,
    });
  });

  it("refuses an empty title, a document the caller cannot see, and a read-only caller", async () => {
    const repo = {
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(DOCUMENT_DTO)),
      updateDocumentOrNull: vi.fn(),
    };
    const missing = { findListedDocumentOrNull: vi.fn(() => Promise.resolve(null)), updateDocumentOrNull: vi.fn() };

    const blank = await new UpdateRecordDocumentInteractor(repo as never, userService).invoke({
      id: DOCUMENT_ID,
      title: "  ",
    });
    const hidden = await new UpdateRecordDocumentInteractor(missing as never, userService).invoke({
      id: DOCUMENT_ID,
      title: "New",
    });
    mockUser = createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.contacts, action: Action.update },
    ]);
    const denied = await new UpdateRecordDocumentInteractor(repo as never, userService).invoke({
      id: DOCUMENT_ID,
      title: "New",
    });

    expect(blank.ok).toBe(false);
    expect(issueCodes(hidden)).toEqual([["id", CustomErrorCode.recordDocumentNotFound]]);
    expect(issueCodes(denied)).toEqual([["id", CustomErrorCode.permissionDenied]]);
    expect(repo.updateDocumentOrNull).not.toHaveBeenCalled();
  });
});

describe("DeleteRecordDocumentInteractor", () => {
  const stored = { id: DOCUMENT_ID, entityType: "contact" as const, title: "NDA", storageKeys: ["k1", "k2"] };

  it("deletes every stored PDF first, then the document", async () => {
    const repo = {
      findDocumentOrNull: vi.fn(() => Promise.resolve(stored)),
      deleteDocument: vi.fn(() => Promise.resolve(true)),
    };
    const { provider, spies } = storage();

    await expect(
      new DeleteRecordDocumentInteractor(repo as never, provider, userService).invoke({ id: DOCUMENT_ID }),
    ).resolves.toEqual({ ok: true, data: { id: DOCUMENT_ID } });
    expect(spies.deleteObject.mock.calls.map(([key]) => key)).toEqual(["k1", "k2"]);
    expect(repo.deleteDocument).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it("keeps the document when a PDF could not be deleted, so nothing is orphaned", async () => {
    const repo = { findDocumentOrNull: vi.fn(() => Promise.resolve(stored)), deleteDocument: vi.fn() };
    const { provider } = storage({
      deleteObject: vi.fn(() => Promise.reject(new StorageError(StorageFailure.unavailable))),
    });

    const result = await new DeleteRecordDocumentInteractor(repo as never, provider, userService).invoke({
      id: DOCUMENT_ID,
    });

    expect(issueCodes(result)).toEqual([["", CustomErrorCode.fileStorageUnavailable]]);
    expect(repo.deleteDocument).not.toHaveBeenCalled();
  });
});

describe("SweepRecordDocumentsInteractor", () => {
  it("removes stale and orphaned PDFs it could delete, then documents left without any", async () => {
    const repo = {
      findSweepableDocumentFilesUnscoped: vi.fn(() =>
        Promise.resolve([
          { id: "a", storageKey: "ka" },
          { id: "b", storageKey: "kb" },
        ]),
      ),
      deleteDocumentFilesUnscoped: vi.fn((ids: string[]) => Promise.resolve(ids.length)),
      deleteEmptyDocumentsUnscoped: vi.fn(() => Promise.resolve(3)),
    };
    const { provider } = storage({
      deleteObject: vi.fn((key: string) => (key === "kb" ? Promise.reject(new Error("down")) : Promise.resolve())),
    });

    const result = await new SweepRecordDocumentsInteractor(repo as never, provider, () => NOW).invoke();

    const cutoff = new Date("2026-09-26T10:00:00Z");
    expect(repo.findSweepableDocumentFilesUnscoped).toHaveBeenCalledWith({ pendingBefore: cutoff, limit: 200 });
    expect(repo.deleteDocumentFilesUnscoped).toHaveBeenCalledWith(["a"]);
    expect(repo.deleteEmptyDocumentsUnscoped).toHaveBeenCalledWith({ createdBefore: cutoff, limit: 200 });
    expect(result).toEqual({ ok: true, data: { removedFiles: 1, removedDocuments: 3 } });
  });
});
