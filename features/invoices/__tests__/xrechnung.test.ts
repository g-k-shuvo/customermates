import type { InvoiceDto } from "../invoice.schema";

import { describe, expect, it } from "vitest";

import { parsePostalAddress } from "../document/postal-address";
import { XRECHNUNG_CUSTOMIZATION_ID, buildXRechnung, xRechnungGaps } from "../document/xrechnung";
import { invoiceTotals, lineTotals } from "../invoice-totals";

const LABELS = { discount: "Rabatt", payableBy: () => "Zahlbar bis 28.10.2026" };

function invoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  const lines = [
    { quantity: 4, unitPrice: 6000, discountPercent: 10, taxRate: 19, description: "Custom Integrations & API" },
    { quantity: 2, unitPrice: 100, discountPercent: 0, taxRate: 7, description: "Handbook" },
  ];
  const totals = invoiceTotals(lines);

  return {
    id: "5b9a5563-65f1-413c-9c03-dde1e85aa091",
    number: "RE-0001",
    status: "issued",
    deal: { id: "80000000-0000-4000-8000-000000000003", name: "CRM Rollout" },
    organization: null,
    currency: "eur",
    buyerName: "F. Hoffmann-La Roche AG",
    buyerAddress: "Grenzacherstrasse 124\n4070 Basel\nSwitzerland",
    buyerVatId: "CHE-116.274.340 MWST",
    buyerEmail: "ap@roche.example",
    issueDate: new Date("2026-09-28T00:00:00Z"),
    dueDate: new Date("2026-10-28T00:00:00Z"),
    notes: "Thank you <3",
    ...totals,
    paidAmount: 0,
    balance: totals.grossTotal,
    overdue: false,
    paidAt: null,
    issuedAt: new Date("2026-09-28T09:00:00Z"),
    voidedAt: null,
    seller: {
      name: "Bergmann Consulting GmbH",
      address: "Hauptstraße 5\n10115 Berlin\nDeutschland",
      vatId: "DE123456789",
      email: "billing@bergmann.example",
      phone: "+49 30 1234567",
      bankDetails: "Berliner Bank\nIBAN DE89 3704 0044 0532 0130 00\nBIC COBADEFFXXX",
      footer: null,
    },
    lines: lines.map((line, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      position: index,
      serviceId: null,
      ...line,
      ...lineTotals(line),
    })),
    payments: [],
    createdAt: new Date("2026-09-28T08:00:00Z"),
    updatedAt: new Date("2026-09-28T09:00:00Z"),
    ...overrides,
  };
}

function seller(): NonNullable<InvoiceDto["seller"]> {
  const value = invoice().seller;
  if (!value) throw new Error("fixture has a seller");

  return value;
}

describe("postal address parsing", () => {
  it("reads street, postcode, city and a country named in any app language", () => {
    expect(parsePostalAddress("Hauptstraße 5\n10115 Berlin\nDeutschland")).toEqual({
      street: "Hauptstraße 5",
      additional: null,
      postalCode: "10115",
      city: "Berlin",
      countryCode: "DE",
    });
    expect(parsePostalAddress("Grenzacherstrasse 124, Bau 1, 4070 Basel, Switzerland").countryCode).toBe("CH");
    expect(parsePostalAddress("Grenzacherstrasse 124, Bau 1, 4070 Basel, Switzerland").additional).toBe("Bau 1");
  });

  it("falls back to Germany and reports what it could not find", () => {
    expect(parsePostalAddress("Somewhere")).toEqual({
      street: "Somewhere",
      additional: null,
      postalCode: null,
      city: null,
      countryCode: "DE",
    });
  });
});

describe("XRechnung", () => {
  it("lists the details an e-invoice still needs", () => {
    expect(xRechnungGaps(invoice())).toEqual([]);
    expect(
      xRechnungGaps(invoice({ buyerEmail: null, buyerAddress: "Basel", seller: { ...seller(), phone: null } })),
    ).toEqual(["sellerPhone", "buyerEmail", "buyerPostalAddress"]);
  });

  it("writes a UBL invoice whose totals match the invoice to the cent", () => {
    const xml = buildXRechnung(invoice(), LABELS);

    expect(xml).toContain(`<cbc:CustomizationID>${XRECHNUNG_CUSTOMIZATION_ID}</cbc:CustomizationID>`);
    expect(xml).toContain("<cbc:ID>RE-0001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-09-28</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2026-10-28</cbc:DueDate>");
    expect(xml).toContain("<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>");
    expect(xml).toContain('<cbc:EndpointID schemeID="EM">billing@bergmann.example</cbc:EndpointID>');
    expect(xml).toContain("<cbc:PostalZone>10115</cbc:PostalZone>");
    expect(xml).toContain("<cbc:IdentificationCode>CH</cbc:IdentificationCode>");
    expect(xml).toContain("<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>");
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="EUR">21800.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">4118.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">25918.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:Amount currencyID="EUR">2400.00</cbc:Amount>');
    expect(xml).toContain("<cbc:Percent>7</cbc:Percent>");
    expect(xml).toContain("Custom Integrations &amp; API");
    expect(xml).toContain("Thank you &lt;3");
    expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(2);
  });

  it("subtracts what was already paid from the payable amount", () => {
    const xml = buildXRechnung(invoice({ paidAmount: 918, status: "issued" }), LABELS);

    expect(xml).toContain('<cbc:PrepaidAmount currencyID="EUR">918.00</cbc:PrepaidAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">25000.00</cbc:PayableAmount>');
  });

  it("uses an unspecified payment means when no IBAN is on file", () => {
    const xml = buildXRechnung(invoice({ seller: { ...seller(), bankDetails: null } }), LABELS);

    expect(xml).toContain("<cbc:PaymentMeansCode>1</cbc:PaymentMeansCode>");
    expect(xml).not.toContain("PayeeFinancialAccount");
  });
});
