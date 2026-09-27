/**
 * Prepares the S3-compatible bucket behind core/storage for browser uploads.
 *
 *   yarn storage:setup                      # origin taken from BASE_URL
 *   yarn storage:setup --origin https://crm.example.com --origin https://crm.example.org
 *
 * Reads the same STORAGE_* variables as the app, creates the bucket when it is
 * missing, applies a CORS rule for the app's origins (the browser PUTs straight
 * to the presigned URL, so the bucket must accept that cross-origin request), and
 * finishes with the preflight a browser would send. It is safe to re-run.
 */

import { createHash } from "node:crypto";

import { AwsClient } from "aws4fetch";

import { resolveStorageConfig } from "@/core/storage/storage-config";

function origins(argv: readonly string[], baseUrl: string | undefined): string[] {
  const flagged = argv.flatMap((arg, index) => (arg === "--origin" && argv[index + 1] ? [argv[index + 1]] : []));
  const raw = flagged.length > 0 ? flagged : baseUrl ? [baseUrl] : [];
  if (raw.length === 0) throw new Error("Pass --origin or set BASE_URL, so the bucket knows which site may upload.");

  return [...new Set(raw.map((value) => new URL(value).origin))];
}

function corsDocument(allowed: readonly string[]): string {
  const rule = [
    ...allowed.map((origin) => `<AllowedOrigin>${origin}</AllowedOrigin>`),
    "<AllowedMethod>PUT</AllowedMethod>",
    "<AllowedMethod>GET</AllowedMethod>",
    "<AllowedMethod>HEAD</AllowedMethod>",
    "<AllowedHeader>*</AllowedHeader>",
    "<ExposeHeader>ETag</ExposeHeader>",
    "<MaxAgeSeconds>3600</MaxAgeSeconds>",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>${rule}</CORSRule></CORSConfiguration>`;
}

async function main(): Promise<void> {
  const config = resolveStorageConfig(process.env);
  if (!config) throw new Error("No STORAGE_* variables are set, so there is no bucket to prepare.");

  const allowed = origins(process.argv.slice(2), process.env.BASE_URL);
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  });
  const bucketUrl = `${config.endpoint}/${config.bucket}`;

  const created = await client.fetch(bucketUrl, { method: "PUT" });
  const createdBody = await created.text();
  if (created.ok) console.log(`Created bucket ${config.bucket}.`);
  else if (created.status === 409 || /BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(createdBody))
    console.log(`Bucket ${config.bucket} already exists.`);
  else throw new Error(`Creating bucket ${config.bucket} failed with ${created.status}: ${createdBody.slice(0, 200)}`);

  const document = corsDocument(allowed);
  const cors = await client.fetch(`${bucketUrl}?cors`, {
    method: "PUT",
    headers: {
      "content-type": "application/xml",
      "content-md5": createHash("md5").update(document).digest("base64"),
    },
    body: document,
  });
  if (!cors.ok) throw new Error(`Applying CORS failed with ${cors.status}: ${(await cors.text()).slice(0, 200)}`);
  console.log(`Allowed browser uploads from ${allowed.join(", ")}.`);

  for (const origin of allowed) {
    const preflight = await fetch(`${config.publicEndpoint}/${config.bucket}/storage-setup-probe`, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" },
    });
    const echoed = preflight.headers.get("access-control-allow-origin");
    if (echoed !== origin && echoed !== "*")
      throw new Error(`The public endpoint does not answer a browser preflight from ${origin} (got ${echoed ?? "no header"}).`);
  }
  console.log(`A browser preflight to ${config.publicEndpoint} succeeds for every origin.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
