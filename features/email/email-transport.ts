import type React from "react";

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
};

export type EmailTransport = {
  send(message: EmailMessage): Promise<boolean>;
};
