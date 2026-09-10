import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";

import { EMPTY_MAILBOX_FORM_ERRORS, toMailboxFormErrors } from "../mailbox-form-errors";

function treeFor(message: string, path: (string | number)[]) {
  return z.treeifyError(createZodError(message, path));
}

describe("toMailboxFormErrors", () => {
  it("puts an unreachable host on the imapHost field", () => {
    const errors = toMailboxFormErrors(treeFor("Could not reach that mail server.", ["imapHost"]));

    expect(errors.fields).toEqual({ imapHost: "Could not reach that mail server." });
    expect(errors.form).toEqual([]);
  });

  it("puts rejected credentials on the secret field", () => {
    const errors = toMailboxFormErrors(treeFor("The mail server rejected those credentials.", ["secret"]));

    expect(errors.fields.secret).toBe("The mail server rejected those credentials.");
    expect(errors.form).toEqual([]);
  });

  it("keeps a failure without a field as a form-level message", () => {
    const errors = toMailboxFormErrors(treeFor("Mailbox syncing is not configured on this instance.", []));

    expect(errors.form).toEqual(["Mailbox syncing is not configured on this instance."]);
    expect(errors.fields).toEqual({});
  });

  it("reads several field failures out of one tree", () => {
    const tree = z.treeifyError(
      new z.ZodError([
        { code: "custom", path: ["emailAddress"], message: "This mailbox is already connected." },
        { code: "custom", path: ["imapPort"], message: "Too small." },
      ]),
    );

    expect(toMailboxFormErrors(tree).fields).toEqual({
      emailAddress: "This mailbox is already connected.",
      imapPort: "Too small.",
    });
  });

  it("treats a missing or non-object tree as no errors at all", () => {
    expect(toMailboxFormErrors(undefined)).toBe(EMPTY_MAILBOX_FORM_ERRORS);
    expect(toMailboxFormErrors("boom")).toBe(EMPTY_MAILBOX_FORM_ERRORS);
  });
});
