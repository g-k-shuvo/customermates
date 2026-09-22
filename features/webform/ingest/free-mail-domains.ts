const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "aol.com",
  "gmail.com",
  "gmx.de",
  "gmx.net",
  "googlemail.com",
  "hotmail.co.uk",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "web.de",
  "yahoo.co.uk",
  "yahoo.com",
  "yandex.com",
  "ymail.com",
  "zoho.com",
]);

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;

  return (
    email
      .slice(at + 1)
      .trim()
      .toLowerCase() || null
  );
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.trim().toLowerCase());
}
