import { describe, expect, it } from "vitest";

import { contentMatchesType, readObjectHead } from "../content-signature";
import { StorageFailure } from "../storage-provider";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("contentMatchesType", () => {
  it("accepts files whose first bytes match their type", () => {
    expect(contentMatchesType("application/pdf", ascii("%PDF-1.7\n"))).toBe(true);
    expect(contentMatchesType("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(contentMatchesType("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(
      contentMatchesType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes(0x50, 0x4b, 0x03, 0x04),
      ),
    ).toBe(true);
    expect(contentMatchesType("video/mp4", ascii("\0\0\0 ftypisom"))).toBe(true);
    expect(contentMatchesType("text/csv", ascii("name,value\nA,1\n"))).toBe(true);
  });

  it("refuses an executable whatever its extension claims", () => {
    expect(contentMatchesType("application/pdf", bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(false);
    expect(contentMatchesType("text/plain", bytes(0x7f, 0x45, 0x4c, 0x46))).toBe(false);
    expect(contentMatchesType("text/plain", ascii("#!/bin/sh\nrm -rf /"))).toBe(false);
  });

  it("refuses content that belongs to another type", () => {
    expect(contentMatchesType("application/pdf", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(false);
    expect(contentMatchesType("image/png", ascii("%PDF-1.4"))).toBe(false);
    expect(contentMatchesType("text/plain", bytes(0x61, 0x00, 0x62))).toBe(false);
  });
});

describe("readObjectHead", () => {
  it("reads only the first bytes across chunks and stops the stream", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(ascii("%PDF"));
        controller.enqueue(ascii("-1.4 and a long tail that is never needed"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const storage = { getObject: () => Promise.resolve({ body }) } as never;

    const head = await readObjectHead(storage, "key");

    expect(new TextDecoder().decode(head)).toBe("%PDF-1.4 and a l");
    expect(cancelled).toBe(true);
  });

  it("gives up on a body that stops sending, so the upload reports a failure instead of hanging", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(ascii("%PD"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const storage = { getObject: () => Promise.resolve({ body }) } as never;

    await expect(readObjectHead(storage, "key", 20)).rejects.toMatchObject({ failure: StorageFailure.unavailable });
    expect(cancelled).toBe(true);
  });
});
