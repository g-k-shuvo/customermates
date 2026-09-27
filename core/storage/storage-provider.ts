export const StorageFailure = {
  notConfigured: "notConfigured",
  notFound: "notFound",
  unavailable: "unavailable",
  rejected: "rejected",
} as const;

export type StorageFailure = (typeof StorageFailure)[keyof typeof StorageFailure];

export class StorageError extends Error {
  constructor(
    readonly failure: StorageFailure,
    readonly detail?: string,
  ) {
    super(detail ? `${failure}: ${detail}` : failure);
    this.name = "StorageError";
  }
}

export type ContentDisposition = "attachment" | "inline";

export type PresignedUpload = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
};

export type PresignedDownload = {
  url: string;
  expiresAt: Date;
};

export type StoredObjectStat = {
  byteSize: number;
  contentType: string | null;
};

export type StoredObjectStream = StoredObjectStat & {
  body: ReadableStream<Uint8Array>;
};

export type StorageProvider = {
  readonly configured: boolean;
  readonly maxUploadBytes: number;
  presignUpload(args: { key: string; contentType: string; byteSize: number }): Promise<PresignedUpload>;
  presignDownload(args: {
    key: string;
    fileName: string;
    contentType: string;
    disposition: ContentDisposition;
  }): Promise<PresignedDownload>;
  statObject(key: string): Promise<StoredObjectStat | null>;
  getObject(key: string): Promise<StoredObjectStream>;
  putObject(args: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
};
