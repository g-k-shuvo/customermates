import { emailDomain, isFreeMailDomain } from "@/features/webform/ingest/free-mail-domains";

export function organizationEmailDomains(identifiers: readonly string[]): string[] {
  const domains = new Set<string>();

  for (const identifier of identifiers) {
    const domain = emailDomain(identifier);
    if (domain && domain.includes(".") && !isFreeMailDomain(domain)) domains.add(domain);
  }

  return [...domains].sort();
}
