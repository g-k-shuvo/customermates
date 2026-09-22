import { describe, expect, it } from "vitest";

import { hmacSha256Hex } from "@/core/utils/hmac";

import { mapWebFormFields, readDotPath, renderTitle } from "../ingest/field-mapping";
import { emailDomain, isFreeMailDomain } from "../ingest/free-mail-domains";
import { WEBFORM_MAX_SKEW_SECONDS, verifyWebFormSignature } from "../ingest/webform-signature";

const SECRET = "a-signing-secret";

function sign(body: string, atSeconds: number): string {
  return `t=${atSeconds},v0=${hmacSha256Hex(SECRET, `${atSeconds}.${body}`)}`;
}

describe("web form signature", () => {
  const body = JSON.stringify({ external_id: "42" });
  const nowMs = 1_700_000_000_000;
  const nowSeconds = Math.floor(nowMs / 1000);

  it("accepts a signature over the timestamped body", () => {
    expect(verifyWebFormSignature(body, sign(body, nowSeconds), SECRET, nowMs)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, nowSeconds);

    expect(verifyWebFormSignature(`${body} `, header, SECRET, nowMs)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const header = `t=${nowSeconds},v0=${hmacSha256Hex("other", `${nowSeconds}.${body}`)}`;

    expect(verifyWebFormSignature(body, header, SECRET, nowMs)).toBe(false);
  });

  it("rejects a timestamp outside the skew window", () => {
    const stale = nowSeconds - WEBFORM_MAX_SKEW_SECONDS - 1;

    expect(verifyWebFormSignature(body, sign(body, stale), SECRET, nowMs)).toBe(false);
  });

  it("accepts a timestamp at the edge of the skew window", () => {
    const edge = nowSeconds - WEBFORM_MAX_SKEW_SECONDS;

    expect(verifyWebFormSignature(body, sign(body, edge), SECRET, nowMs)).toBe(true);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyWebFormSignature(body, null, SECRET, nowMs)).toBe(false);
    expect(verifyWebFormSignature(body, "nonsense", SECRET, nowMs)).toBe(false);
    expect(verifyWebFormSignature(body, `t=${nowSeconds}`, SECRET, nowMs)).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(verifyWebFormSignature(body, sign(body, nowSeconds), "", nowMs)).toBe(false);
  });
});

describe("field mapping", () => {
  const payload = {
    fields: { names: { first_name: "Ada", last_name: "Lovelace" }, email: "ada@analytical.co", company: "Analytical" },
    form_title: "Request a Call",
  };

  it("reads a dot path", () => {
    expect(readDotPath(payload, "fields.names.first_name")).toBe("Ada");
  });

  it("returns null for a path that does not exist", () => {
    expect(readDotPath(payload, "fields.missing.deeper")).toBeNull();
  });

  it("maps configured paths and leaves the rest null", () => {
    const fields = mapWebFormFields(payload, {
      firstName: "fields.names.first_name",
      email: "fields.email",
      organizationName: "fields.company",
    });

    expect(fields.firstName).toBe("Ada");
    expect(fields.email).toBe("ada@analytical.co");
    expect(fields.organizationName).toBe("Analytical");
    expect(fields.phone).toBeNull();
  });

  it("renders a title from a template", () => {
    const fields = mapWebFormFields(payload, { organizationName: "fields.company" });

    expect(
      renderTitle("{{organizationName}} — {{form_title}}", fields, {
        formTitle: "Request a Call",
        sourceName: "Website",
      }),
    ).toBe("Analytical — Request a Call");
  });

  it("falls back to the person and form when no template is configured", () => {
    const fields = mapWebFormFields(payload, {
      firstName: "fields.names.first_name",
      lastName: "fields.names.last_name",
    });

    expect(renderTitle(undefined, fields, { formTitle: "Request a Call", sourceName: "Website" })).toBe(
      "Ada Lovelace — Request a Call",
    );
  });

  it("falls back to the source name when nothing maps", () => {
    const fields = mapWebFormFields({}, {});

    expect(renderTitle(undefined, fields, { formTitle: null, sourceName: "Website" })).toBe("Website");
  });

  it("drops placeholders that resolve to nothing", () => {
    const fields = mapWebFormFields({}, {});

    expect(
      renderTitle("{{organizationName}} — {{form_title}}", fields, {
        formTitle: "Free Market Assessment",
        sourceName: "Website",
      }),
    ).toBe("Free Market Assessment");
  });
});

describe("free mail domains", () => {
  it("extracts a domain", () => {
    expect(emailDomain("ada@analytical.co")).toBe("analytical.co");
  });

  it("returns null for a malformed address", () => {
    expect(emailDomain("not-an-address")).toBeNull();
    expect(emailDomain("@nothing.com")).toBeNull();
  });

  it("knows the common free providers", () => {
    expect(isFreeMailDomain("gmail.com")).toBe(true);
    expect(isFreeMailDomain("GMAIL.COM")).toBe(true);
    expect(isFreeMailDomain("analytical.co")).toBe(false);
  });
});
