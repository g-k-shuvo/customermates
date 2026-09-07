import { describe, expect, it } from "vitest";

import { recoverRfcMessageId, recoverThreadRootMessageId } from "../recover-message-id";

describe("recoverRfcMessageId", () => {
  it("restores the angle brackets the sync layer strips", () => {
    expect(recoverRfcMessageId("imap:msg:id:root@buyer.example")).toBe("<root@buyer.example>");
  });

  it("does not double up brackets that survived", () => {
    expect(recoverRfcMessageId("imap:msg:id:<root@buyer.example>")).toBe("<root@buyer.example>");
  });

  it("refuses a hashed identity because the original is unrecoverable", () => {
    expect(recoverRfcMessageId("imap:msg:id-sha256:abcdef")).toBeNull();
  });

  it("refuses a content fingerprint because the message never had an id", () => {
    expect(recoverRfcMessageId("imap:msg:sha256:abcdef")).toBeNull();
  });

  it("refuses anything without an at sign", () => {
    expect(recoverRfcMessageId("imap:msg:id:not-an-id")).toBeNull();
  });

  it("refuses an id carrying whitespace or stray brackets", () => {
    expect(recoverRfcMessageId("imap:msg:id:a b@x.example")).toBeNull();
    expect(recoverRfcMessageId("imap:msg:id:a<b@x.example")).toBeNull();
  });

  it("refuses an empty or absent value", () => {
    expect(recoverRfcMessageId("imap:msg:id:")).toBeNull();
    expect(recoverRfcMessageId(null)).toBeNull();
    expect(recoverRfcMessageId(undefined)).toBeNull();
  });
});

describe("recoverThreadRootMessageId", () => {
  it("restores the conversation root from the thread key", () => {
    expect(recoverThreadRootMessageId("imap:thread:root@buyer.example")).toBe("<root@buyer.example>");
  });

  it("refuses a subject-derived key because it is not a message id", () => {
    expect(recoverThreadRootMessageId("imap:subject:abcdef")).toBeNull();
  });

  it("refuses a uid-derived key", () => {
    expect(recoverThreadRootMessageId("imap:thread:uid:44")).toBeNull();
  });

  it("refuses an absent key", () => {
    expect(recoverThreadRootMessageId(null)).toBeNull();
  });
});
