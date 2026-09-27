import type { SigningProvider } from "@/core/signing/signing-provider";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { TenantUser } from "@/features/user/user.schema";
import type { EnvelopeRecordDocument, SignableRecordDocument } from "../record-document-signing.repo";

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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import * as Sentry from "@sentry/nextjs";

import { Action, RecordDocumentEnvelopeStatus, RecordDocumentStatus, Resource } from "@/generated/prisma";
import { SigningError, SigningFailure } from "@/core/signing/signing-provider";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { RecordDocumentSigningService, signedCopyFileName } from "../record-document-signing.service";
import { SendForSignatureInteractor } from "../send-for-signature.interactor";
import { VoidSignatureInteractor, DEFAULT_VOID_REASON } from "../void-signature.interactor";
import { RefreshSignatureInteractor } from "../refresh-signature.interactor";
import { HandleSigningCallbackInteractor } from "../handle-signing-callback.interactor";

const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";
const RECORD_ID = "50000000-0000-4000-8000-000000000001";
const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-27T10:00:00Z");
const PDF = new Uint8Array(Buffer.from("%PDF-1.4 completed", "latin1"));

const userService = {
  hasPermissionForUser: (user: TenantUser, resource: Resource, action: Action) =>
    Boolean(
      user.role?.isSystemRole ||
        user.role?.permissions.some((permission) => permission.resource === resource && permission.action === action),
    ),
} as never;

const RECIPIENTS = [{ name: "Pia Müller", email: "pia@example.test", status: "sent", completedAt: null }];

const ENVELOPE_DOCUMENT: EnvelopeRecordDocument = {
  id: DOCUMENT_ID,
  companyId: COMPANY_ID,
  entityType: "deal",
  recordId: RECORD_ID,
  title: "Mutual NDA",
  status: RecordDocumentStatus.sent,
  envelopeId: "env-1",
  envelopeStatus: RecordDocumentEnvelopeStatus.sent,
  recipients: RECIPIENTS,
  creator: { email: "max@example.test", displayLanguage: "en" as never },
};

function signingProvider(overrides: Partial<SigningProvider> = {}) {
  const spies = {
    sendEnvelope: vi.fn(() => Promise.resolve({ envelopeId: "env-new" })),
    voidEnvelope: vi.fn(() => Promise.resolve()),
    fetchEnvelope: vi.fn(() =>
      Promise.resolve({ envelopeId: "env-1", status: "delivered" as const, recipients: RECIPIENTS }),
    ),
    downloadCompletedPdf: vi.fn(() => Promise.resolve(PDF)),
  };
  const provider = {
    configured: true,
    verifyCallback: () => true,
    parseCallback: () => null,
    ...spies,
    ...overrides,
  } as SigningProvider;
  return { provider, spies };
}

function storageProvider(overrides: Partial<StorageProvider> = {}) {
  const spies = {
    putObject: vi.fn(() => Promise.resolve()),
    deleteObject: vi.fn(() => Promise.resolve()),
    getObject: vi.fn(() =>
      Promise.resolve({
        body: new Response(Buffer.from("%PDF-1.4 original", "latin1")).body as ReadableStream<Uint8Array>,
        byteSize: 17,
        contentType: "application/pdf",
      }),
    ),
  };
  const provider = {
    configured: true,
    maxUploadBytes: 1024 * 1024,
    ...spies,
    ...overrides,
  } as unknown as StorageProvider;
  return { provider, spies };
}

function serviceWith(
  options: { completedNow?: boolean; signing?: Partial<SigningProvider>; notify?: () => Promise<void> } = {},
) {
  const order: string[] = [];
  const repo = {
    findDocumentByEnvelopeUnscoped: vi.fn(() => Promise.resolve(ENVELOPE_DOCUMENT)),
    attachEnvelopeCopyUnscoped: vi.fn(() => {
      order.push("attach");
      return Promise.resolve([{ id: "old", storageKey: "old-key" }]);
    }),
    recordEnvelopeStateUnscoped: vi.fn(() => {
      order.push("record");
      return Promise.resolve({ completedNow: options.completedNow ?? false });
    }),
  };
  const signing = signingProvider(options.signing);
  const storage = storageProvider();
  storage.spies.putObject.mockImplementation(() => {
    order.push("put");
    return Promise.resolve();
  });
  const notifier = { notify: vi.fn(options.notify ?? (() => Promise.resolve())) };
  const service = new RecordDocumentSigningService(
    repo as never,
    signing.provider,
    storage.provider,
    notifier as never,
  );
  return { repo, signing, storage, notifier, service, order };
}

beforeEach(() => {
  mockUser = createMockUser();
  vi.mocked(Sentry.captureException).mockClear();
});

describe("RecordDocumentSigningService", () => {
  it("stores DocuSign's completed PDF as the signed copy before recording completion, then notifies once", async () => {
    const { repo, signing, storage, notifier, service, order } = serviceWith({ completedNow: true });
    const signed = [{ ...RECIPIENTS[0], status: "completed", completedAt: NOW }];

    await service.apply(ENVELOPE_DOCUMENT, { envelopeId: "env-1", status: "completed", recipients: signed });

    expect(signing.spies.downloadCompletedPdf).toHaveBeenCalledWith("env-1");
    const put = storage.spies.putObject.mock.calls[0] as unknown as [
      { key: string; body: Uint8Array; contentType: string },
    ];
    expect(put[0].key).toMatch(new RegExp(`^${COMPANY_ID}/document/${RECORD_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(put[0]).toMatchObject({ body: PDF, contentType: "application/pdf" });
    expect(repo.attachEnvelopeCopyUnscoped).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      storageKey: put[0].key,
      fileName: "Mutual NDA (signed).pdf",
      byteSize: PDF.byteLength,
    });
    expect(storage.spies.deleteObject).toHaveBeenCalledWith("old-key");
    expect(repo.recordEnvelopeStateUnscoped).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      envelopeStatus: "completed",
      status: RecordDocumentStatus.completed,
      recipients: signed,
    });
    expect(order).toEqual(["put", "attach", "record"]);
    expect(notifier.notify).toHaveBeenCalledTimes(1);
  });

  it("does not download or notify again for an envelope it already completed", async () => {
    const { signing, notifier, service } = serviceWith({ completedNow: false });

    await service.apply(
      { ...ENVELOPE_DOCUMENT, envelopeStatus: "completed", status: RecordDocumentStatus.completed },
      { envelopeId: "env-1", status: "completed", recipients: RECIPIENTS },
    );

    expect(signing.spies.downloadCompletedPdf).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it.each([
    ["delivered", RecordDocumentStatus.sent],
    ["declined", RecordDocumentStatus.declined],
    ["voided", RecordDocumentStatus.voided],
  ] as const)("maps an envelope that is %s to the document status %s", async (envelopeStatus, status) => {
    const { repo, signing, service } = serviceWith();

    await service.apply(ENVELOPE_DOCUMENT, { envelopeId: "env-1", status: envelopeStatus, recipients: [] });

    expect(signing.spies.downloadCompletedPdf).not.toHaveBeenCalled();
    expect(repo.recordEnvelopeStateUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ envelopeStatus, status, recipients: RECIPIENTS }),
    );
  });

  it("keeps the status when DocuSign reports one it does not track", async () => {
    const { repo, service } = serviceWith();

    await service.apply(ENVELOPE_DOCUMENT, { envelopeId: "env-1", status: null, recipients: RECIPIENTS });

    expect(repo.recordEnvelopeStateUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ envelopeStatus: "sent", status: RecordDocumentStatus.sent }),
    );
  });

  it("fails without recording anything when the completed PDF cannot be fetched, so DocuSign retries", async () => {
    const { repo, service } = serviceWith({
      signing: { downloadCompletedPdf: vi.fn(() => Promise.reject(new SigningError(SigningFailure.unavailable))) },
    });

    await expect(
      service.apply(ENVELOPE_DOCUMENT, { envelopeId: "env-1", status: "completed", recipients: RECIPIENTS }),
    ).rejects.toMatchObject({ failure: SigningFailure.unavailable });
    expect(repo.recordEnvelopeStateUnscoped).not.toHaveBeenCalled();
  });

  it("reports a notification that could not be sent instead of failing the callback", async () => {
    const { service } = serviceWith({ completedNow: true, notify: () => Promise.reject(new Error("mail down")) });

    await expect(
      service.apply(ENVELOPE_DOCUMENT, { envelopeId: "env-1", status: "completed", recipients: RECIPIENTS }),
    ).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("names the signed copy after the document, safely", () => {
    expect(signedCopyFileName("NDA: Müller/Acme")).toBe("NDA Müller Acme (signed).pdf");
    expect(signedCopyFileName("???")).toBe("document (signed).pdf");
  });
});

const SIGNABLE: SignableRecordDocument = {
  id: DOCUMENT_ID,
  entityType: "deal" as const,
  recordId: RECORD_ID,
  title: "Mutual NDA",
  status: RecordDocumentStatus.draft,
  envelopeId: null,
  envelopeStatus: null,
  recipients: [],
  creator: null,
  original: { storageKey: "company/document/record/original.pdf", fileName: "NDA.pdf" },
};

const LISTED = {
  id: DOCUMENT_ID,
  entityType: "deal" as const,
  recordId: RECORD_ID,
  title: "Mutual NDA",
  status: RecordDocumentStatus.sent,
  statusChangedAt: NOW,
  original: {
    id: "60000000-0000-4000-8000-000000000003",
    kind: "original" as const,
    fileName: "NDA.pdf",
    byteSize: 17,
    uploadedBy: null,
    createdAt: NOW,
  },
  signed: null,
  signature: {
    provider: "docusign" as const,
    status: RecordDocumentEnvelopeStatus.sent,
    sentAt: NOW,
    recipients: RECIPIENTS,
  },
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

describe("SendForSignatureInteractor", () => {
  const request = { id: DOCUMENT_ID, recipients: [{ name: "Pia Müller", email: "pia@example.test" }] };

  function setup(document: typeof SIGNABLE | null = SIGNABLE, signingOverrides: Partial<SigningProvider> = {}) {
    const repo = {
      findSignableDocumentOrNull: vi.fn(() => Promise.resolve(document)),
      recordEnvelopeSentOrNull: vi.fn(() => Promise.resolve(LISTED)),
      findListedDocumentOrNull: vi.fn(),
    };
    const signing = signingProvider(signingOverrides);
    const storage = storageProvider();
    const interactor = new SendForSignatureInteractor(
      repo as never,
      signing.provider,
      storage.provider,
      userService,
      () => NOW,
    );
    return { repo, signing, storage, interactor };
  }

  it("sends the stored PDF to the signers, with the title as subject and the callback on this installation", async () => {
    const { repo, signing, interactor } = setup();

    await expect(interactor.invoke(request)).resolves.toEqual({ ok: true, data: LISTED });

    const sent = signing.spies.sendEnvelope.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(sent[0]).toMatchObject({
      subject: "Mutual NDA",
      message: null,
      fileName: "NDA.pdf",
      recipients: request.recipients,
      callbackUrl: `${MOCK_ENV_MODULE.env.BASE_URL}/api/webhooks/docusign`,
    });
    expect(Buffer.from(sent[0].pdf as Uint8Array).toString("latin1")).toBe("%PDF-1.4 original");
    expect(repo.recordEnvelopeSentOrNull).toHaveBeenCalledWith(DOCUMENT_ID, {
      envelopeId: "env-new",
      recipients: [{ name: "Pia Müller", email: "pia@example.test", status: "sent", completedAt: null }],
      sentAt: NOW,
    });
  });

  it("refuses a document that is out for signature or already signed", async () => {
    const out = setup({ ...SIGNABLE, status: RecordDocumentStatus.sent, envelopeStatus: "delivered" as never });
    const signed = setup({ ...SIGNABLE, status: RecordDocumentStatus.completed });

    expect(issueCodes(await out.interactor.invoke(request))).toEqual([["id", CustomErrorCode.signatureInProgress]]);
    expect(issueCodes(await signed.interactor.invoke(request))).toEqual([["id", CustomErrorCode.documentNotSendable]]);
    expect(out.signing.spies.sendEnvelope).not.toHaveBeenCalled();
  });

  it("maps missing consent and refusals from DocuSign", async () => {
    const consent = setup(SIGNABLE, {
      sendEnvelope: vi.fn(() => Promise.reject(new SigningError(SigningFailure.consentRequired))),
    });
    const refused = setup(SIGNABLE, {
      sendEnvelope: vi.fn(() => Promise.reject(new SigningError(SigningFailure.rejected, "INVALID_EMAIL"))),
    });

    expect(issueCodes(await consent.interactor.invoke(request))).toEqual([
      ["", CustomErrorCode.signingConsentRequired],
    ]);
    expect(issueCodes(await refused.interactor.invoke(request))).toEqual([["", CustomErrorCode.signingRejected]]);
    expect(consent.repo.recordEnvelopeSentOrNull).not.toHaveBeenCalled();
  });

  it("says signing is not configured, and checks update permission on the record's type", async () => {
    const unconfigured = setup(SIGNABLE, { configured: false });
    mockUser = createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.contacts, action: Action.update },
    ]);
    const denied = setup();

    expect(issueCodes(await denied.interactor.invoke(request))).toEqual([["id", CustomErrorCode.permissionDenied]]);
    mockUser = createMockUser();
    expect(issueCodes(await unconfigured.interactor.invoke(request))).toEqual([
      ["", CustomErrorCode.signingNotConfigured],
    ]);
  });

  it("refuses the same signer twice", async () => {
    const { interactor } = setup();

    const result = await interactor.invoke({
      id: DOCUMENT_ID,
      recipients: [
        { name: "Pia", email: "pia@example.test" },
        { name: "Pia again", email: "PIA@example.test" },
      ],
    });

    expect(issueCodes(result)).toEqual([["recipients", CustomErrorCode.signatureRecipientDuplicate]]);
  });
});

describe("VoidSignatureInteractor and RefreshSignatureInteractor", () => {
  const active = {
    ...SIGNABLE,
    status: RecordDocumentStatus.sent,
    envelopeId: "env-1",
    envelopeStatus: "sent" as never,
    recipients: RECIPIENTS,
  };

  it("voids an active envelope with the standard reason and records it", async () => {
    const repo = {
      findSignableDocumentOrNull: vi.fn(() => Promise.resolve(active)),
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(LISTED)),
    };
    const signing = signingProvider();
    const service = { apply: vi.fn(() => Promise.resolve()) };

    const result = await new VoidSignatureInteractor(
      repo as never,
      signing.provider,
      service as never,
      userService,
    ).invoke({
      id: DOCUMENT_ID,
    });

    expect(result.ok).toBe(true);
    expect(signing.spies.voidEnvelope).toHaveBeenCalledWith("env-1", DEFAULT_VOID_REASON);
    expect(service.apply).toHaveBeenCalledWith(
      expect.objectContaining({ id: DOCUMENT_ID, companyId: mockUser.companyId }),
      {
        envelopeId: "env-1",
        status: "voided",
        recipients: RECIPIENTS,
      },
    );
  });

  it("refuses to void or refresh a document that was never sent", async () => {
    const repo = {
      findSignableDocumentOrNull: vi.fn(() => Promise.resolve(SIGNABLE)),
      findListedDocumentOrNull: vi.fn(),
    };
    const signing = signingProvider();
    const service = { apply: vi.fn() };

    const voided = await new VoidSignatureInteractor(
      repo as never,
      signing.provider,
      service as never,
      userService,
    ).invoke({
      id: DOCUMENT_ID,
    });
    const refreshed = await new RefreshSignatureInteractor(
      repo as never,
      signing.provider,
      service as never,
      userService,
    ).invoke({
      id: DOCUMENT_ID,
    });

    expect(issueCodes(voided)).toEqual([["id", CustomErrorCode.signatureNotInProgress]]);
    expect(issueCodes(refreshed)).toEqual([["id", CustomErrorCode.signatureNotInProgress]]);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("refreshes from DocuSign and applies what it reports", async () => {
    const repo = {
      findSignableDocumentOrNull: vi.fn(() => Promise.resolve(active)),
      findListedDocumentOrNull: vi.fn(() => Promise.resolve(LISTED)),
    };
    const signing = signingProvider();
    const service = { apply: vi.fn(() => Promise.resolve()) };

    await new RefreshSignatureInteractor(repo as never, signing.provider, service as never, userService).invoke({
      id: DOCUMENT_ID,
    });

    expect(signing.spies.fetchEnvelope).toHaveBeenCalledWith("env-1");
    expect(service.apply).toHaveBeenCalledWith(expect.objectContaining({ envelopeId: "env-1" }), {
      envelopeId: "env-1",
      status: "delivered",
      recipients: RECIPIENTS,
    });
  });
});

describe("HandleSigningCallbackInteractor", () => {
  it("applies a callback to the document it belongs to, and ignores envelopes it does not know", async () => {
    const service = { apply: vi.fn(() => Promise.resolve()) };
    const known = { findDocumentByEnvelopeUnscoped: vi.fn(() => Promise.resolve(ENVELOPE_DOCUMENT)) };
    const unknown = { findDocumentByEnvelopeUnscoped: vi.fn(() => Promise.resolve(null)) };
    const state = { envelopeId: "env-1", status: "completed" as const, recipients: RECIPIENTS };

    await expect(new HandleSigningCallbackInteractor(known as never, service as never).invoke(state)).resolves.toEqual({
      ok: true,
      data: { handled: true },
    });
    await expect(
      new HandleSigningCallbackInteractor(unknown as never, service as never).invoke(state),
    ).resolves.toEqual({
      ok: true,
      data: { handled: false },
    });
    expect(service.apply).toHaveBeenCalledTimes(1);
    expect(service.apply).toHaveBeenCalledWith(ENVELOPE_DOCUMENT, state);
  });
});
