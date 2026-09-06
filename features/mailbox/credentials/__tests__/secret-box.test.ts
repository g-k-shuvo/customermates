import { createDecipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { SecretBoxKey } from "../secret-box";
import {
  openSecret,
  parseSecretBoxKey,
  sealSecret,
  SecretBoxError,
  SecretBoxFailure,
  secretsEqual,
} from "../secret-box";

const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IMAP_PASSWORD = "correct horse battery staple";
const VERSION_SEGMENT = 0;
const NONCE_SEGMENT = 1;
const AUTH_TAG_SEGMENT = 2;
const CIPHERTEXT_SEGMENT = 3;

function newEncodedKey(): string {
  return randomBytes(32).toString("base64");
}

function newKey(): SecretBoxKey {
  return parseSecretBoxKey(newEncodedKey());
}

function segmentsOf(sealed: string): string[] {
  return sealed.split(".");
}

function withSegment(sealed: string, index: number, value: string): string {
  const segments = segmentsOf(sealed);
  segments[index] = value;

  return segments.join(".");
}

function withFlippedByte(sealed: string, index: number, byteOffset: number): string {
  const bytes = Buffer.from(segmentsOf(sealed)[index], "base64url");
  bytes[byteOffset] = bytes[byteOffset] ^ 0x01;

  return withSegment(sealed, index, bytes.toString("base64url"));
}

function withNonCanonicalTail(encoded: string, alphabet: string): string {
  const unpadded = encoded.replace(/=+$/, "");
  const lastIndex = unpadded.length - 1;
  const flipped = alphabet[alphabet.indexOf(unpadded[lastIndex]) ^ 0x01];

  return `${unpadded.slice(0, lastIndex)}${flipped}`;
}

function caught(run: () => unknown): SecretBoxError {
  try {
    run();
  } catch (error) {
    if (error instanceof SecretBoxError) return error;

    throw error;
  }

  throw new Error("expected the call to fail");
}

function failureOf(run: () => unknown): SecretBoxFailure {
  return caught(run).failure;
}

function forgedKey(byteLength: number): SecretBoxKey {
  return { bytes: randomBytes(byteLength) } as unknown as SecretBoxKey;
}

describe("parseSecretBoxKey", () => {
  it("accepts a padded standard base64 key of exactly thirty-two bytes", () => {
    const material = randomBytes(32);

    expect(parseSecretBoxKey(material.toString("base64")).bytes).toEqual(new Uint8Array(material));
  });

  it("accepts the same key written in the unpadded url-safe alphabet", () => {
    const material = randomBytes(32);

    expect(parseSecretBoxKey(material.toString("base64url")).bytes).toEqual(new Uint8Array(material));
  });

  it("ignores whitespace around a key read from configuration", () => {
    const encoded = newEncodedKey();

    expect(parseSecretBoxKey(`\n  ${encoded}  \n`).bytes).toEqual(parseSecretBoxKey(encoded).bytes);
  });

  it("rejects a key that decodes to fewer than thirty-two bytes", () => {
    const short = randomBytes(31).toString("base64");

    expect(failureOf(() => parseSecretBoxKey(short))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
  });

  it("rejects a key that decodes to more than thirty-two bytes", () => {
    const long = randomBytes(33).toString("base64");

    expect(failureOf(() => parseSecretBoxKey(long))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
  });

  it("rejects a key that is not base64 at all", () => {
    expect(failureOf(() => parseSecretBoxKey("not a base64 key!"))).toBe(SecretBoxFailure.keyNotBase64);
  });

  it("rejects an empty or blank key", () => {
    expect(failureOf(() => parseSecretBoxKey(""))).toBe(SecretBoxFailure.keyNotBase64);
    expect(failureOf(() => parseSecretBoxKey("   "))).toBe(SecretBoxFailure.keyNotBase64);
  });

  it("rejects a malleable re-encoding of a valid key", () => {
    const mutated = withNonCanonicalTail(newEncodedKey(), STANDARD_ALPHABET);

    expect(Buffer.from(mutated, "base64")).toHaveLength(32);
    expect(failureOf(() => parseSecretBoxKey(mutated))).toBe(SecretBoxFailure.keyNotBase64);
  });

  it("throws a SecretBoxError rather than a bare error", () => {
    expect(() => parseSecretBoxKey("!")).toThrow(SecretBoxError);
  });
});

describe("sealSecret", () => {
  it("round-trips an imap password", () => {
    const key = newKey();

    expect(openSecret(key, sealSecret(key, IMAP_PASSWORD))).toBe(IMAP_PASSWORD);
  });

  it("round-trips non-ascii and very long secrets byte for byte", () => {
    const key = newKey();
    const unicode = "pässwörd-ünïcode-🔐-end";
    const long = "a".repeat(10_000);

    expect(openSecret(key, sealSecret(key, unicode))).toBe(unicode);
    expect(openSecret(key, sealSecret(key, long))).toBe(long);
  });

  it("produces a different sealed string every time the same secret is sealed", () => {
    const key = newKey();

    expect(sealSecret(key, IMAP_PASSWORD)).not.toBe(sealSecret(key, IMAP_PASSWORD));
  });

  it("never repeats a nonce across many seals of the same secret", () => {
    const key = newKey();
    const seals = Array.from({ length: 512 }, () => segmentsOf(sealSecret(key, IMAP_PASSWORD))[NONCE_SEGMENT]);

    expect(new Set(seals).size).toBe(512);
  });

  it("writes a self-describing envelope of version, nonce, auth tag and ciphertext", () => {
    const segments = segmentsOf(sealSecret(newKey(), IMAP_PASSWORD));

    expect(segments).toHaveLength(4);
    expect(segments[VERSION_SEGMENT]).toBe("v1");
    expect(Buffer.from(segments[NONCE_SEGMENT], "base64url")).toHaveLength(12);
    expect(Buffer.from(segments[AUTH_TAG_SEGMENT], "base64url")).toHaveLength(16);
    expect(Buffer.from(segments[CIPHERTEXT_SEGMENT], "base64url")).toHaveLength(28);
  });

  it("never leaks the secret into the sealed envelope", () => {
    const sealed = sealSecret(newKey(), IMAP_PASSWORD);
    const ciphertext = Buffer.from(segmentsOf(sealed)[CIPHERTEXT_SEGMENT], "base64url");

    expect(sealed).not.toContain(IMAP_PASSWORD);
    expect(ciphertext.toString("utf8")).not.toBe(IMAP_PASSWORD);
  });

  it("refuses to seal an empty secret", () => {
    expect(failureOf(() => sealSecret(newKey(), ""))).toBe(SecretBoxFailure.emptySecret);
  });

  it("refuses a key that never came from the parser instead of throwing a raw range error", () => {
    expect(failureOf(() => sealSecret(forgedKey(16), IMAP_PASSWORD))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(failureOf(() => sealSecret(forgedKey(31), IMAP_PASSWORD))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(failureOf(() => sealSecret(forgedKey(33), IMAP_PASSWORD))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(() => sealSecret(forgedKey(16), IMAP_PASSWORD)).not.toThrow(RangeError);
  });

  it("refuses a secret that would not survive the round trip byte for byte", () => {
    const key = newKey();
    const lonelySurrogate = `pw${String.fromCharCode(0xd800)}tail`;

    expect(failureOf(() => sealSecret(key, lonelySurrogate))).toBe(SecretBoxFailure.unsealableSecret);
    expect(openSecret(key, sealSecret(key, "pw🔐tail"))).toBe("pw🔐tail");
  });

  it("refuses a secret that is not a string rather than letting node inline it into an error", () => {
    const key = newKey();
    const numericPin = 90210;

    expect(failureOf(() => sealSecret(key, numericPin as unknown as string))).toBe(SecretBoxFailure.unsealableSecret);
    expect(caught(() => sealSecret(key, numericPin as unknown as string)).message).not.toContain("90210");
  });
});

describe("openSecret", () => {
  it("opens a secret with a separately parsed copy of the same key", () => {
    const encoded = newEncodedKey();
    const sealed = sealSecret(parseSecretBoxKey(encoded), IMAP_PASSWORD);

    expect(openSecret(parseSecretBoxKey(encoded), sealed)).toBe(IMAP_PASSWORD);
  });

  it("fails closed on a tampered ciphertext instead of returning a partial plaintext", () => {
    const key = newKey();
    const tampered = withFlippedByte(sealSecret(key, "a".repeat(512)), CIPHERTEXT_SEGMENT, 400);

    expect(failureOf(() => openSecret(key, tampered))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed on a truncated ciphertext", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);
    const ciphertext = Buffer.from(segmentsOf(sealed)[CIPHERTEXT_SEGMENT], "base64url");
    const truncated = withSegment(sealed, CIPHERTEXT_SEGMENT, ciphertext.subarray(0, 10).toString("base64url"));

    expect(failureOf(() => openSecret(key, truncated))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed on a tampered nonce", () => {
    const key = newKey();
    const tampered = withFlippedByte(sealSecret(key, IMAP_PASSWORD), NONCE_SEGMENT, 0);

    expect(failureOf(() => openSecret(key, tampered))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed on a tampered auth tag", () => {
    const key = newKey();
    const tampered = withFlippedByte(sealSecret(key, IMAP_PASSWORD), AUTH_TAG_SEGMENT, 15);

    expect(failureOf(() => openSecret(key, tampered))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed when opened with a different key", () => {
    const sealed = sealSecret(newKey(), IMAP_PASSWORD);

    expect(failureOf(() => openSecret(newKey(), sealed))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed on an unknown version prefix", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);

    expect(failureOf(() => openSecret(key, withSegment(sealed, VERSION_SEGMENT, "v2")))).toBe(
      SecretBoxFailure.unsupportedVersion,
    );
    expect(failureOf(() => openSecret(key, withSegment(sealed, VERSION_SEGMENT, "V1")))).toBe(
      SecretBoxFailure.unsupportedVersion,
    );
    expect(failureOf(() => openSecret(key, withSegment(sealed, VERSION_SEGMENT, "")))).toBe(
      SecretBoxFailure.unsupportedVersion,
    );
  });

  it("fails closed when the envelope does not carry exactly four segments", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);
    const dropped = segmentsOf(sealed).slice(0, 3).join(".");

    expect(failureOf(() => openSecret(key, ""))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, "v1"))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, dropped))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, `${sealed}.extra`))).toBe(SecretBoxFailure.malformedSealedSecret);
  });

  it("fails closed when a segment is not canonical base64", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);
    const tag = segmentsOf(sealed)[AUTH_TAG_SEGMENT];
    const garbled = withSegment(sealed, NONCE_SEGMENT, "not base64!");
    const emptied = withSegment(sealed, CIPHERTEXT_SEGMENT, "");
    const malleable = withSegment(sealed, AUTH_TAG_SEGMENT, withNonCanonicalTail(tag, URL_ALPHABET));

    expect(failureOf(() => openSecret(key, garbled))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, emptied))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, malleable))).toBe(SecretBoxFailure.malformedSealedSecret);
  });

  it("fails closed when the nonce or auth tag is the wrong size", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);
    const shortNonce = withSegment(sealed, NONCE_SEGMENT, randomBytes(11).toString("base64url"));
    const longNonce = withSegment(sealed, NONCE_SEGMENT, randomBytes(16).toString("base64url"));
    const shortTag = withSegment(sealed, AUTH_TAG_SEGMENT, randomBytes(15).toString("base64url"));
    const longTag = withSegment(sealed, AUTH_TAG_SEGMENT, randomBytes(17).toString("base64url"));

    expect(failureOf(() => openSecret(key, shortNonce))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, longNonce))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, shortTag))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, longTag))).toBe(SecretBoxFailure.malformedSealedSecret);
  });

  it("names a misconfigured key as a key failure rather than reporting it as tampering", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);

    expect(failureOf(() => openSecret(forgedKey(16), sealed))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(failureOf(() => openSecret(forgedKey(31), sealed))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(failureOf(() => openSecret(forgedKey(0), sealed))).toBe(SecretBoxFailure.keyNotThirtyTwoBytes);
    expect(failureOf(() => openSecret(newKey(), sealed))).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("fails closed when the sealed value is not a string", () => {
    const key = newKey();

    expect(failureOf(() => openSecret(key, 1234 as unknown as string))).toBe(SecretBoxFailure.malformedSealedSecret);
    expect(failureOf(() => openSecret(key, null as unknown as string))).toBe(SecretBoxFailure.malformedSealedSecret);
  });

  it("fails closed on a segment that is in the alphabet but decodes to no bytes", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);

    expect(failureOf(() => openSecret(key, withSegment(sealed, NONCE_SEGMENT, "A")))).toBe(
      SecretBoxFailure.malformedSealedSecret,
    );
    expect(failureOf(() => openSecret(key, withSegment(sealed, CIPHERTEXT_SEGMENT, "A")))).toBe(
      SecretBoxFailure.malformedSealedSecret,
    );
  });

  it("binds the version into the authenticated data rather than merely inspecting it", () => {
    const key = newKey();
    const segments = segmentsOf(sealSecret(key, IMAP_PASSWORD));
    const decipher = createDecipheriv("aes-256-gcm", key.bytes, new Uint8Array(Buffer.from(segments[1], "base64url")));
    decipher.setAuthTag(new Uint8Array(Buffer.from(segments[2], "base64url")));
    decipher.update(new Uint8Array(Buffer.from(segments[3], "base64url")));

    expect(() => decipher.final()).toThrow();
  });

  it("never yields a plaintext across a sweep of single-bit tampering", () => {
    const key = newKey();
    const stranger = newKey();
    const opened: string[] = [];

    for (let attempt = 0; attempt < 600; attempt += 1) {
      const segments = segmentsOf(sealSecret(key, `${IMAP_PASSWORD}-${attempt}`));
      const target = 1 + (attempt % 3);
      const bytes = Buffer.from(segments[target], "base64url");
      bytes[attempt % bytes.length] = bytes[attempt % bytes.length] ^ (1 << attempt % 8);
      segments[target] = bytes.toString("base64url");

      try {
        opened.push(openSecret(attempt % 5 === 0 ? stranger : key, segments.join(".")));
      } catch (error) {
        expect(error).toBeInstanceOf(SecretBoxError);
      }
    }

    expect(opened).toEqual([]);
  });

  it("throws a SecretBoxError naming only the failure", () => {
    const key = newKey();
    const tampered = withFlippedByte(sealSecret(key, IMAP_PASSWORD), CIPHERTEXT_SEGMENT, 0);
    const error = caught(() => openSecret(key, tampered));

    expect(error).toBeInstanceOf(SecretBoxError);
    expect(error.name).toBe("SecretBoxError");
    expect(error.message).toBe(SecretBoxFailure.authenticationFailed);
  });

  it("keeps the secret out of every error it throws", () => {
    const key = newKey();
    const sealed = sealSecret(key, IMAP_PASSWORD);
    const broken = [
      withFlippedByte(sealed, CIPHERTEXT_SEGMENT, 0),
      withFlippedByte(sealed, NONCE_SEGMENT, 0),
      withFlippedByte(sealed, AUTH_TAG_SEGMENT, 0),
      withSegment(sealed, VERSION_SEGMENT, "v9"),
      withSegment(sealed, NONCE_SEGMENT, "!"),
      "",
    ];

    for (const envelope of broken) {
      const error = caught(() => openSecret(key, envelope));

      expect(error.message).not.toContain(IMAP_PASSWORD);
      expect(String(error)).not.toContain(IMAP_PASSWORD);
    }

    expect(caught(() => openSecret(newKey(), sealed)).message).not.toContain(IMAP_PASSWORD);
    expect(caught(() => sealSecret(key, "")).message).not.toContain(IMAP_PASSWORD);
  });
});

describe("secretsEqual", () => {
  it("matches two identical secrets", () => {
    expect(secretsEqual(IMAP_PASSWORD, IMAP_PASSWORD)).toBe(true);
  });

  it("rejects secrets that differ in a single byte", () => {
    expect(secretsEqual(IMAP_PASSWORD, `${IMAP_PASSWORD.slice(0, -1)}f`)).toBe(false);
  });

  it("rejects secrets of different lengths without throwing", () => {
    expect(secretsEqual(IMAP_PASSWORD, `${IMAP_PASSWORD}!`)).toBe(false);
    expect(secretsEqual(IMAP_PASSWORD, "")).toBe(false);
  });

  it("compares an opened secret against the value the user re-entered", () => {
    const key = newKey();
    const opened = openSecret(key, sealSecret(key, IMAP_PASSWORD));

    expect(secretsEqual(opened, IMAP_PASSWORD)).toBe(true);
    expect(secretsEqual(opened, "wrong")).toBe(false);
  });

  it("compares two empty strings without throwing", () => {
    expect(secretsEqual("", "")).toBe(true);
  });

  it("rejects a non-string candidate rather than throwing an error that inlines it", () => {
    const numericPin = 90210;

    expect(secretsEqual(IMAP_PASSWORD, numericPin as unknown as string)).toBe(false);
    expect(secretsEqual(numericPin as unknown as string, numericPin as unknown as string)).toBe(false);
    expect(secretsEqual(IMAP_PASSWORD, null as unknown as string)).toBe(false);
    expect(secretsEqual(IMAP_PASSWORD, undefined as unknown as string)).toBe(false);
  });
});
