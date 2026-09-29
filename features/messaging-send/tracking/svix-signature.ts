import { createHmac, timingSafeEqual } from "node:crypto";

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

function secretBytes(secret: string): Uint8Array {
  return new Uint8Array(Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64"));
}

export function signSvixPayload(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", secretBytes(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifySvixSignature(args: { secret: string; headers: SvixHeaders; body: string; now?: Date }): boolean {
  const { id, timestamp, signature } = args.headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;

  const expected = new TextEncoder().encode(signSvixPayload(args.secret, id, timestamp, args.body));

  return signature
    .split(" ")
    .map((entry) => entry.split(","))
    .filter(([version, value]) => version === "v1" && value)
    .some(([, value]) => {
      const candidate = new TextEncoder().encode(value);
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}
