import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SEALED_SECRET_VERSION = "v1";
const SEGMENT_SEPARATOR = ".";
const SEGMENT_COUNT = 4;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BASE64_ALPHABET = /^[A-Za-z0-9+/_-]+={0,2}$/;
const SECRET_BOX_KEY_BRAND: unique symbol = Symbol("secretBoxKey");

export const SecretBoxFailure = {
  keyNotBase64: "keyNotBase64",
  keyNotThirtyTwoBytes: "keyNotThirtyTwoBytes",
  emptySecret: "emptySecret",
  unsealableSecret: "unsealableSecret",
  malformedSealedSecret: "malformedSealedSecret",
  unsupportedVersion: "unsupportedVersion",
  authenticationFailed: "authenticationFailed",
} as const;

export type SecretBoxFailure = (typeof SecretBoxFailure)[keyof typeof SecretBoxFailure];

export class SecretBoxError extends Error {
  constructor(readonly failure: SecretBoxFailure) {
    super(failure);
    this.name = "SecretBoxError";
  }
}

export type SecretBoxKey = { readonly [SECRET_BOX_KEY_BRAND]: true; readonly bytes: Uint8Array };

function bytesOf(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer);
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function canonicalBase64Url(encoded: string): string {
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64(encoded: string): Uint8Array | null {
  if (!BASE64_ALPHABET.test(encoded)) return null;

  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length === 0) return null;
  if (decoded.toString("base64url") !== canonicalBase64Url(encoded)) return null;

  return bytesOf(decoded);
}

function concatBytes(head: Buffer, tail: Buffer): Uint8Array {
  return bytesOf(Buffer.concat([bytesOf(head), bytesOf(tail)]));
}

function versionAssociatedData(): Uint8Array {
  return bytesOf(Buffer.from(SEALED_SECRET_VERSION, "utf8"));
}

function utf8Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

type SealedEnvelope = {
  nonce: Uint8Array;
  authTag: Uint8Array;
  ciphertext: Uint8Array;
};

function keyBytesOf(key: SecretBoxKey): Uint8Array {
  if (key.bytes.length !== KEY_BYTES) throw new SecretBoxError(SecretBoxFailure.keyNotThirtyTwoBytes);

  return key.bytes;
}

function sealableSecretOf(secret: string): string {
  if (typeof secret !== "string" || !secret.isWellFormed()) throw new SecretBoxError(SecretBoxFailure.unsealableSecret);
  if (secret.length === 0) throw new SecretBoxError(SecretBoxFailure.emptySecret);

  return secret;
}

function openEnvelope(keyBytes: Uint8Array, envelope: SealedEnvelope): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, keyBytes, envelope.nonce);
    decipher.setAAD(versionAssociatedData());
    decipher.setAuthTag(envelope.authTag);

    const plaintext = concatBytes(decipher.update(envelope.ciphertext), decipher.final());
    if (plaintext.length === 0) return null;

    return utf8Of(plaintext);
  } catch {
    return null;
  }
}

export function parseSecretBoxKey(encodedKey: string): SecretBoxKey {
  const decoded = decodeBase64(encodedKey.trim());
  if (!decoded) throw new SecretBoxError(SecretBoxFailure.keyNotBase64);
  if (decoded.length !== KEY_BYTES) throw new SecretBoxError(SecretBoxFailure.keyNotThirtyTwoBytes);

  return { [SECRET_BOX_KEY_BRAND]: true, bytes: decoded };
}

export function sealSecret(key: SecretBoxKey, secret: string): string {
  const keyBytes = keyBytesOf(key);
  const sealable = sealableSecretOf(secret);

  const nonce = bytesOf(randomBytes(NONCE_BYTES));
  const cipher = createCipheriv(ALGORITHM, keyBytes, nonce);
  cipher.setAAD(versionAssociatedData());

  const ciphertext = concatBytes(cipher.update(sealable, "utf8"), cipher.final());
  const authTag = bytesOf(cipher.getAuthTag());

  return [SEALED_SECRET_VERSION, encodeBase64Url(nonce), encodeBase64Url(authTag), encodeBase64Url(ciphertext)].join(
    SEGMENT_SEPARATOR,
  );
}

export function openSecret(key: SecretBoxKey, sealed: string): string {
  const keyBytes = keyBytesOf(key);
  if (typeof sealed !== "string") throw new SecretBoxError(SecretBoxFailure.malformedSealedSecret);

  const segments = sealed.split(SEGMENT_SEPARATOR);
  if (segments.length !== SEGMENT_COUNT) throw new SecretBoxError(SecretBoxFailure.malformedSealedSecret);
  if (segments[0] !== SEALED_SECRET_VERSION) throw new SecretBoxError(SecretBoxFailure.unsupportedVersion);

  const nonce = decodeBase64(segments[1]);
  const authTag = decodeBase64(segments[2]);
  const ciphertext = decodeBase64(segments[3]);
  if (!nonce || nonce.length !== NONCE_BYTES) throw new SecretBoxError(SecretBoxFailure.malformedSealedSecret);
  if (!authTag || authTag.length !== AUTH_TAG_BYTES) throw new SecretBoxError(SecretBoxFailure.malformedSealedSecret);
  if (!ciphertext) throw new SecretBoxError(SecretBoxFailure.malformedSealedSecret);

  const opened = openEnvelope(keyBytes, { nonce, authTag, ciphertext });
  if (opened === null) throw new SecretBoxError(SecretBoxFailure.authenticationFailed);

  return opened;
}

export function secretsEqual(left: string, right: string): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const leftBytes = bytesOf(Buffer.from(left, "utf8"));
  const rightBytes = bytesOf(Buffer.from(right, "utf8"));
  if (leftBytes.length !== rightBytes.length) return false;

  return timingSafeEqual(leftBytes, rightBytes);
}
