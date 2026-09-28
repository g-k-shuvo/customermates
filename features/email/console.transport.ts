import type { EmailMessage, EmailReceipt, EmailTransport } from "./email-transport";

export class ConsoleTransport implements EmailTransport {
  constructor(private write: (line: string) => void = (line) => process.stdout.write(line)) {}

  deliver(message: EmailMessage): Promise<EmailReceipt> {
    const record = {
      transport: "console",
      from: message.from,
      to: message.to,
      subject: message.subject,
      replyTo: message.replyTo ?? null,
      headers: message.headers ?? {},
      props: message.react.props,
    };

    this.write(`[email] ${JSON.stringify(record)}\n`);

    return Promise.resolve({ accepted: true, transport: "console", providerMessageId: null });
  }
}
