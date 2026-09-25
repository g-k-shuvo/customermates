export abstract class AutomationEmailSender {
  abstract send(args: { to: string; subject: string; body: string }): Promise<boolean>;
}
