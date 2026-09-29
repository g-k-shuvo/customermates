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

import { Action, Resource } from "@/generated/prisma";
import { StorageError, StorageFailure } from "@/core/storage/storage-provider";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { CreateRecordFileUploadInteractor } from "../upload/create-record-file-upload.interactor";
import { CompleteRecordFileUploadInteractor } from "../upload/complete-record-file-upload.interactor";
import { NULL_VIRUS_SCANNER, VirusScanUnavailableError } from "@/core/storage/virus-scanner";
import { StorageQuota } from "@/core/storage/storage-quota";
import { GetRecordFileDownloadInteractor } from "../get/get-record-file-download.interactor";
import { DeleteRecordFileInteractor } from "../delete/delete-record-file.interactor";
import { SweepRecordFilesInteractor } from "../sweep/sweep-record-files.interactor";

const FILE_ID = "40000000-0000-4000-8000-000000000001";
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
    deleteObject: vi.fn(() => Promise.resolve()),
  };
  const provider = {
    configured: true,
    maxUploadBytes: 1024 * 1024,
    statObject: vi.fn(() => Promise.resolve({ byteSize: 2048, contentType: "application/pdf" })),
    getObject: vi.fn(),
    putObject: vi.fn(),
    ...spies,
    ...overrides,
  } as StorageProvider;
  return { provider, spies };
}

const FILE_DTO = {
  id: FILE_ID,
  entityType: "contact" as const,
  recordId: RECORD_ID,
  fileName: "Offer.pdf",
  contentType: "application/pdf",
  byteSize: 2048,
  uploadedBy: null,
  createdAt: NOW,
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

const quotaWith = (usedBytes: number, quotaBytes: number | null) =>
  new StorageQuota({ usedBytesCompanyWide: () => Promise.resolve(usedBytes) }, quotaBytes);
const unlimited = quotaWith(0, null);

describe("CreateRecordFileUploadInteractor", () => {
  function setup(storageOverrides: Partial<StorageProvider> = {}, accessible = true, quota = unlimited) {
    const repo = {
      isRecordAccessible: vi.fn(() => Promise.resolve(accessible)),
      createPendingFile: vi.fn((args: Record<string, unknown>) => Promise.resolve({ ...FILE_DTO, ...args })),
    };
    const { provider, spies } = storage(storageOverrides);
    return {
      repo,
      spies,
      interactor: new CreateRecordFileUploadInteractor(repo as never, provider, userService, quota),
    };
  }

  const request = {
    entityType: "contact" as const,
    recordId: RECORD_ID,
    fileName: "Offer.PDF",
    contentType: "application/pdf",
    byteSize: 2048,
  };

  it("registers a pending file under a key it mints and returns the presigned upload", async () => {
    const { repo, spies, interactor } = setup();

    const result = await interactor.invoke(request);

    expect(result.ok).toBe(true);
    const created = repo.createPendingFile.mock.calls[0][0] as {
      storageKey: string;
      contentType: string;
      fileName: string;
    };
    expect(created.storageKey).toMatch(
      new RegExp(`^${mockUser.companyId}/recordFile/${RECORD_ID}/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(created).toMatchObject({ fileName: "Offer.PDF", contentType: "application/pdf" });
    expect(spies.presignUpload).toHaveBeenCalledWith({
      key: created.storageKey,
      contentType: "application/pdf",
      byteSize: 2048,
    });
  });

  it("refuses an upload that would exceed the workspace quota, and accepts one that fits", async () => {
    const over = setup({}, true, quotaWith(1024 * 1024 - 1000, 1024 * 1024));
    expect(issueCodes(await over.interactor.invoke(request))).toEqual([
      ["byteSize", CustomErrorCode.storageQuotaExceeded],
    ]);
    expect(over.repo.createPendingFile).not.toHaveBeenCalled();

    const fits = setup({}, true, quotaWith(1024 * 1024 - 4096, 1024 * 1024));
    expect((await fits.interactor.invoke(request)).ok).toBe(true);
  });

  it("refuses a file the policy rejects, naming the field, and creates nothing", async () => {
    const { repo, interactor } = setup();

    const html = await interactor.invoke({ ...request, fileName: "page.html", contentType: "text/html" });
    const big = await interactor.invoke({ ...request, byteSize: 2 * 1024 * 1024 });
    const bare = await interactor.invoke({ ...request, fileName: "README" });

    expect(issueCodes(html)).toEqual([["contentType", CustomErrorCode.fileTypeNotAllowed]]);
    expect(issueCodes(big)).toEqual([["byteSize", CustomErrorCode.fileTooLarge]]);
    expect(issueCodes(bare)).toEqual([["fileName", CustomErrorCode.fileExtensionMissing]]);
    expect(repo.createPendingFile).not.toHaveBeenCalled();
  });

  it("says storage is not configured instead of pretending to accept the file", async () => {
    const { repo, interactor } = setup({ configured: false });

    const result = await interactor.invoke(request);

    expect(issueCodes(result)).toEqual([["", CustomErrorCode.fileStorageNotConfigured]]);
    expect(repo.createPendingFile).not.toHaveBeenCalled();
  });

  it("treats a record the caller cannot see as not found", async () => {
    const { interactor } = setup({}, false);

    expect(issueCodes(await interactor.invoke(request))).toEqual([["recordId", CustomErrorCode.contactNotFound]]);
  });

  it("requires update permission on the record's own type, not just on some type", async () => {
    mockUser = createMockUserWithPermissions([
      { resource: Resource.contacts, action: Action.update },
      { resource: Resource.deals, action: Action.readAll },
    ]);
    const { repo, interactor } = setup();

    const result = await interactor.invoke({ ...request, entityType: "deal" });

    expect(issueCodes(result)).toEqual([["entityType", CustomErrorCode.permissionDenied]]);
    expect(repo.createPendingFile).not.toHaveBeenCalled();
  });
});

const scanner = NULL_VIRUS_SCANNER;

describe("CompleteRecordFileUploadInteractor", () => {
  const pending = {
    id: FILE_ID,
    entityType: "contact" as const,
    recordId: RECORD_ID,
    storageKey: "company/recordFile/record/object.pdf",
    fileName: "Offer.pdf",
    contentType: "application/pdf",
    byteSize: 2048,
  };

  function setup(stat: { byteSize: number; contentType: string | null } | null) {
    const repo = {
      findPendingFileOrNull: vi.fn(() => Promise.resolve(pending)),
      markFileReadyOrNull: vi.fn(() => Promise.resolve(FILE_DTO)),
      deletePendingFile: vi.fn(() => Promise.resolve()),
    };
    const { provider, spies } = storage({ statObject: vi.fn(() => Promise.resolve(stat)) });
    return {
      repo,
      spies,
      interactor: new CompleteRecordFileUploadInteractor(repo as never, provider, userService, scanner),
    };
  }

  it("lists the file once the stored object has the registered size and type", async () => {
    const { repo, interactor } = setup({ byteSize: 2048, contentType: "application/pdf" });

    await expect(interactor.invoke({ id: FILE_ID })).resolves.toEqual({ ok: true, data: FILE_DTO });
    expect(repo.markFileReadyOrNull).toHaveBeenCalledWith(FILE_ID);
  });

  it("keeps the pending file when the object is not there yet, so the call can be repeated", async () => {
    const { repo, interactor } = setup(null);

    expect(issueCodes(await interactor.invoke({ id: FILE_ID }))).toEqual([
      ["id", CustomErrorCode.fileUploadIncomplete],
    ]);
    expect(repo.deletePendingFile).not.toHaveBeenCalled();
    expect(repo.markFileReadyOrNull).not.toHaveBeenCalled();
  });

  it("removes both the object and the entry when the object does not match", async () => {
    const { repo, spies, interactor } = setup({ byteSize: 10, contentType: "application/pdf" });

    expect(issueCodes(await interactor.invoke({ id: FILE_ID }))).toEqual([
      ["id", CustomErrorCode.fileUploadIncomplete],
    ]);
    expect(spies.deleteObject).toHaveBeenCalledWith(pending.storageKey);
    expect(repo.deletePendingFile).toHaveBeenCalledWith(FILE_ID);
  });

  it("reports an unreachable bucket as unavailable rather than failing the request", async () => {
    const repo = { findPendingFileOrNull: vi.fn(() => Promise.resolve(pending)) };
    const { provider } = storage({
      statObject: vi.fn(() => Promise.reject(new StorageError(StorageFailure.unavailable))),
    });

    const result = await new CompleteRecordFileUploadInteractor(repo as never, provider, userService, scanner).invoke({
      id: FILE_ID,
    });

    expect(issueCodes(result)).toEqual([["", CustomErrorCode.fileStorageUnavailable]]);
  });

  it("scans the stored object and drops an infected upload", async () => {
    const repo = {
      findPendingFileOrNull: vi.fn(() => Promise.resolve(pending)),
      markFileReadyOrNull: vi.fn(() => Promise.resolve(FILE_DTO)),
      deletePendingFile: vi.fn(() => Promise.resolve()),
    };
    const { provider, spies } = storage({
      getObject: vi.fn(() =>
        Promise.resolve({ byteSize: 2048, contentType: "application/pdf", body: new ReadableStream() }),
      ),
    });
    const infected = {
      configured: true,
      scan: vi.fn(() => Promise.resolve({ clean: false as const, signature: "Eicar-Test-Signature" })),
    };

    const result = await new CompleteRecordFileUploadInteractor(repo as never, provider, userService, infected).invoke({
      id: FILE_ID,
    });

    expect(issueCodes(result)).toEqual([["id", CustomErrorCode.fileInfected]]);
    expect(spies.deleteObject).toHaveBeenCalledWith(pending.storageKey);
    expect(repo.deletePendingFile).toHaveBeenCalledWith(FILE_ID);
    expect(repo.markFileReadyOrNull).not.toHaveBeenCalled();
  });

  it("refuses an upload while a configured scanner is unreachable, and keeps a clean one", async () => {
    const repo = {
      findPendingFileOrNull: vi.fn(() => Promise.resolve(pending)),
      markFileReadyOrNull: vi.fn(() => Promise.resolve(FILE_DTO)),
      deletePendingFile: vi.fn(() => Promise.resolve()),
    };
    const { provider } = storage({
      getObject: vi.fn(() =>
        Promise.resolve({ byteSize: 2048, contentType: "application/pdf", body: new ReadableStream() }),
      ),
    });
    const down = { configured: true, scan: vi.fn(() => Promise.reject(new VirusScanUnavailableError("down"))) };
    const clean = { configured: true, scan: vi.fn(() => Promise.resolve({ clean: true as const })) };

    const refused = await new CompleteRecordFileUploadInteractor(repo as never, provider, userService, down).invoke({
      id: FILE_ID,
    });
    expect(issueCodes(refused)).toEqual([["", CustomErrorCode.virusScanUnavailable]]);
    expect(repo.deletePendingFile).not.toHaveBeenCalled();

    const kept = await new CompleteRecordFileUploadInteractor(repo as never, provider, userService, clean).invoke({
      id: FILE_ID,
    });
    expect(kept.ok).toBe(true);
    expect(clean.scan).toHaveBeenCalledTimes(1);
  });
});

describe("GetRecordFileDownloadInteractor", () => {
  it.each([
    ["a PDF opens in the browser", "application/pdf", "inline"],
    ["a spreadsheet downloads", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "attachment"],
  ])("presigns so that %s", async (_label, contentType, disposition) => {
    const repo = {
      findReadyFileOrNull: vi.fn(() =>
        Promise.resolve({
          id: FILE_ID,
          entityType: "deal",
          recordId: RECORD_ID,
          storageKey: "k",
          fileName: "f",
          contentType,
        }),
      ),
    };
    const { provider, spies } = storage();

    await new GetRecordFileDownloadInteractor(repo as never, provider).invoke({ id: FILE_ID });

    expect(spies.presignDownload).toHaveBeenCalledWith({ key: "k", fileName: "f", contentType, disposition });
  });

  it("returns not found for a file that is pending or invisible to the caller", async () => {
    const repo = { findReadyFileOrNull: vi.fn(() => Promise.resolve(null)) };

    const result = await new GetRecordFileDownloadInteractor(repo as never, storage().provider).invoke({ id: FILE_ID });

    expect(issueCodes(result)).toEqual([["id", CustomErrorCode.recordFileNotFound]]);
  });
});

describe("DeleteRecordFileInteractor", () => {
  const stored = {
    id: FILE_ID,
    entityType: "organization" as const,
    recordId: RECORD_ID,
    storageKey: "k",
    fileName: "f",
    contentType: "application/pdf",
  };

  it("deletes the object first, then the entry", async () => {
    const repo = {
      findFileOrNull: vi.fn(() => Promise.resolve(stored)),
      deleteFile: vi.fn(() => Promise.resolve(true)),
    };
    const { provider, spies } = storage();

    await expect(
      new DeleteRecordFileInteractor(repo as never, provider, userService).invoke({ id: FILE_ID }),
    ).resolves.toEqual({
      ok: true,
      data: { id: FILE_ID },
    });
    expect(spies.deleteObject).toHaveBeenCalledWith("k");
    expect(repo.deleteFile).toHaveBeenCalledWith(FILE_ID);
  });

  it("keeps the entry when the object could not be deleted, so nothing is orphaned", async () => {
    const repo = { findFileOrNull: vi.fn(() => Promise.resolve(stored)), deleteFile: vi.fn() };
    const { provider } = storage({
      deleteObject: vi.fn(() => Promise.reject(new StorageError(StorageFailure.unavailable))),
    });

    const result = await new DeleteRecordFileInteractor(repo as never, provider, userService).invoke({ id: FILE_ID });

    expect(issueCodes(result)).toEqual([["", CustomErrorCode.fileStorageUnavailable]]);
    expect(repo.deleteFile).not.toHaveBeenCalled();
  });
});

describe("SweepRecordFilesInteractor", () => {
  it("reaps stale pending uploads and orphans, keeping any whose object could not be deleted", async () => {
    const repo = {
      findSweepableFilesUnscoped: vi.fn(() =>
        Promise.resolve([
          { id: "a", storageKey: "ka" },
          { id: "b", storageKey: "kb" },
        ]),
      ),
      deleteFilesUnscoped: vi.fn((ids: string[]) => Promise.resolve(ids.length)),
    };
    const { provider } = storage({
      deleteObject: vi.fn((key: string) => (key === "kb" ? Promise.reject(new Error("down")) : Promise.resolve())),
    });

    const result = await new SweepRecordFilesInteractor(repo as never, provider, () => NOW).invoke();

    expect(repo.findSweepableFilesUnscoped).toHaveBeenCalledWith({
      pendingBefore: new Date("2026-09-26T10:00:00Z"),
      limit: 200,
    });
    expect(repo.deleteFilesUnscoped).toHaveBeenCalledWith(["a"]);
    expect(result).toEqual({ ok: true, data: { removed: 1 } });
  });

  it("still clears rows when storage is gone", async () => {
    const repo = {
      findSweepableFilesUnscoped: vi.fn(() => Promise.resolve([{ id: "a", storageKey: "ka" }])),
      deleteFilesUnscoped: vi.fn((ids: string[]) => Promise.resolve(ids.length)),
    };

    await new SweepRecordFilesInteractor(repo as never, storage({ configured: false }).provider, () => NOW).invoke();

    expect(repo.deleteFilesUnscoped).toHaveBeenCalledWith(["a"]);
  });
});
