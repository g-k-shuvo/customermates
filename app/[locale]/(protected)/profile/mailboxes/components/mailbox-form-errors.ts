type ErrorTreeNode = { errors?: string[]; properties?: Record<string, ErrorTreeNode | undefined> };

export type MailboxFormErrors = {
  form: string[];
  fields: Record<string, string>;
};

export const EMPTY_MAILBOX_FORM_ERRORS: MailboxFormErrors = { form: [], fields: {} };

export function toMailboxFormErrors(tree: unknown): MailboxFormErrors {
  if (!tree || typeof tree !== "object") return EMPTY_MAILBOX_FORM_ERRORS;

  const node = tree as ErrorTreeNode;
  const fields: Record<string, string> = {};

  for (const [name, child] of Object.entries(node.properties ?? {})) {
    const message = child?.errors?.[0];
    if (message) fields[name] = message;
  }

  return { form: node.errors ?? [], fields };
}
