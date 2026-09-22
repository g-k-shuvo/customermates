import { verifyHmacSha256Hex } from "@/core/utils/hmac";

export const WEBFORM_SIGNATURE_HEADER = "x-webform-signature";

export const WEBFORM_MAX_SKEW_SECONDS = 300;

export type WebFormSignature = { t: number; v0: string };

export function parseWebFormSignature(header: string): WebFormSignature | null {
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v0" && value) signature = value;
  }

  if (timestamp === null || !Number.isFinite(timestamp) || !signature) return null;

  return { t: timestamp, v0: signature };
}

export function verifyWebFormSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !signatureHeader) return false;

  const parsed = parseWebFormSignature(signatureHeader);
  if (!parsed) return false;

  if (Math.abs(nowMs / 1000 - parsed.t) > WEBFORM_MAX_SKEW_SECONDS) return false;

  return verifyHmacSha256Hex(secret, `${parsed.t}.${rawBody}`, parsed.v0);
}
