import type { InvoiceDto } from "../invoice.schema";

import { parsePostalAddress } from "./postal-address";

export const XRECHNUNG_CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
export const PEPPOL_BILLING_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const INVOICE_TYPE_COMMERCIAL = "380";
const UNIT_CODE_PIECE = "C62";
const PAYMENT_MEANS_SEPA_TRANSFER = "58";
const PAYMENT_MEANS_UNDEFINED = "1";
const ALLOWANCE_REASON_DISCOUNT = "95";
const IBAN = /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?)\b/;

export type XRechnungGap =
  | "sellerEmail"
  | "sellerPhone"
  | "sellerVatId"
  | "sellerPostalAddress"
  | "buyerEmail"
  | "buyerPostalAddress";

export type XRechnungLabels = { discount: string; payableBy: (date: Date) => string };

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const cents = (amount: number) => Math.round(amount * 100);
const money = (amount: number) => (cents(amount) / 100).toFixed(2);
const isoDate = (date: Date) => new Date(date).toISOString().slice(0, 10);
const percent = (rate: number) => String(Number(rate.toFixed(2)));
const taxCategory = (rate: number) => (rate > 0 ? "S" : "Z");

function element(name: string, value: string | null | undefined, attributes = ""): string {
  if (value === null || value === undefined || value === "") return "";

  return `<${name}${attributes}>${escape(value)}</${name}>`;
}

function amount(name: string, value: number, currency: string): string {
  return element(name, money(value), ` currencyID="${currency}"`);
}

function taxScheme(): string {
  return "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>";
}

function postalAddress(text: string): string {
  const address = parsePostalAddress(text);

  return [
    "<cac:PostalAddress>",
    element("cbc:StreetName", address.street),
    element("cbc:AdditionalStreetName", address.additional),
    element("cbc:CityName", address.city),
    element("cbc:PostalZone", address.postalCode),
    `<cac:Country>${element("cbc:IdentificationCode", address.countryCode)}</cac:Country>`,
    "</cac:PostalAddress>",
  ].join("");
}

function hasPostalAddress(text: string | undefined | null): boolean {
  if (!text) return false;
  const address = parsePostalAddress(text);

  return Boolean(address.street && address.city && address.postalCode);
}

export function xRechnungGaps(invoice: InvoiceDto): XRechnungGap[] {
  const seller = invoice.seller;
  const gaps: XRechnungGap[] = [];

  if (!seller?.email) gaps.push("sellerEmail");
  if (!seller?.phone) gaps.push("sellerPhone");
  if (!seller?.vatId) gaps.push("sellerVatId");
  if (!hasPostalAddress(seller?.address)) gaps.push("sellerPostalAddress");
  if (!invoice.buyerEmail) gaps.push("buyerEmail");
  if (!hasPostalAddress(invoice.buyerAddress)) gaps.push("buyerPostalAddress");

  return gaps;
}

export function buildXRechnung(invoice: InvoiceDto, labels: XRechnungLabels): string {
  const seller = invoice.seller;
  const currency = invoice.currency.toUpperCase();
  const iban = seller?.bankDetails ? IBAN.exec(seller.bankDetails)?.[1]?.replace(/\s/g, "") : undefined;
  const issueDate = invoice.issueDate ? isoDate(invoice.issueDate) : isoDate(new Date());
  const dueDate = invoice.dueDate ? isoDate(invoice.dueDate) : null;

  const supplier = [
    "<cac:AccountingSupplierParty><cac:Party>",
    element("cbc:EndpointID", seller?.email, ' schemeID="EM"'),
    `<cac:PartyName>${element("cbc:Name", seller?.name)}</cac:PartyName>`,
    postalAddress(seller?.address ?? ""),
    seller?.vatId
      ? `<cac:PartyTaxScheme>${element("cbc:CompanyID", seller.vatId)}${taxScheme()}</cac:PartyTaxScheme>`
      : "",
    `<cac:PartyLegalEntity>${element("cbc:RegistrationName", seller?.name)}</cac:PartyLegalEntity>`,
    "<cac:Contact>",
    element("cbc:Name", seller?.name),
    element("cbc:Telephone", seller?.phone),
    element("cbc:ElectronicMail", seller?.email),
    "</cac:Contact>",
    "</cac:Party></cac:AccountingSupplierParty>",
  ].join("");

  const customer = [
    "<cac:AccountingCustomerParty><cac:Party>",
    element("cbc:EndpointID", invoice.buyerEmail, ' schemeID="EM"'),
    `<cac:PartyName>${element("cbc:Name", invoice.buyerName)}</cac:PartyName>`,
    postalAddress(invoice.buyerAddress),
    invoice.buyerVatId
      ? `<cac:PartyTaxScheme>${element("cbc:CompanyID", invoice.buyerVatId)}${taxScheme()}</cac:PartyTaxScheme>`
      : "",
    `<cac:PartyLegalEntity>${element("cbc:RegistrationName", invoice.buyerName)}</cac:PartyLegalEntity>`,
    "</cac:Party></cac:AccountingCustomerParty>",
  ].join("");

  const paymentMeans = [
    "<cac:PaymentMeans>",
    element("cbc:PaymentMeansCode", iban ? PAYMENT_MEANS_SEPA_TRANSFER : PAYMENT_MEANS_UNDEFINED),
    element("cbc:PaymentID", invoice.number),
    iban ? `<cac:PayeeFinancialAccount>${element("cbc:ID", iban)}</cac:PayeeFinancialAccount>` : "",
    "</cac:PaymentMeans>",
    invoice.dueDate
      ? `<cac:PaymentTerms>${element("cbc:Note", labels.payableBy(new Date(invoice.dueDate)))}</cac:PaymentTerms>`
      : "",
  ].join("");

  const taxTotal = [
    "<cac:TaxTotal>",
    amount("cbc:TaxAmount", invoice.taxTotal, currency),
    ...invoice.taxBreakdown.map((entry) =>
      [
        "<cac:TaxSubtotal>",
        amount("cbc:TaxableAmount", entry.netAmount, currency),
        amount("cbc:TaxAmount", entry.taxAmount, currency),
        "<cac:TaxCategory>",
        element("cbc:ID", taxCategory(entry.taxRate)),
        element("cbc:Percent", percent(entry.taxRate)),
        taxScheme(),
        "</cac:TaxCategory>",
        "</cac:TaxSubtotal>",
      ].join(""),
    ),
    "</cac:TaxTotal>",
  ].join("");

  const monetaryTotal = [
    "<cac:LegalMonetaryTotal>",
    amount("cbc:LineExtensionAmount", invoice.netTotal, currency),
    amount("cbc:TaxExclusiveAmount", invoice.netTotal, currency),
    amount("cbc:TaxInclusiveAmount", invoice.grossTotal, currency),
    invoice.paidAmount > 0 ? amount("cbc:PrepaidAmount", invoice.paidAmount, currency) : "",
    amount("cbc:PayableAmount", (cents(invoice.grossTotal) - cents(invoice.paidAmount)) / 100, currency),
    "</cac:LegalMonetaryTotal>",
  ].join("");

  const lines = invoice.lines.map((line, index) => {
    const allowance = (cents(line.quantity * line.unitPrice) - cents(line.netAmount)) / 100;

    return [
      "<cac:InvoiceLine>",
      element("cbc:ID", String(index + 1)),
      element("cbc:InvoicedQuantity", String(line.quantity), ` unitCode="${UNIT_CODE_PIECE}"`),
      amount("cbc:LineExtensionAmount", line.netAmount, currency),
      allowance > 0
        ? [
            "<cac:AllowanceCharge>",
            "<cbc:ChargeIndicator>false</cbc:ChargeIndicator>",
            element("cbc:AllowanceChargeReasonCode", ALLOWANCE_REASON_DISCOUNT),
            element("cbc:AllowanceChargeReason", labels.discount),
            amount("cbc:Amount", allowance, currency),
            "</cac:AllowanceCharge>",
          ].join("")
        : "",
      "<cac:Item>",
      element("cbc:Name", line.description),
      "<cac:ClassifiedTaxCategory>",
      element("cbc:ID", taxCategory(line.taxRate)),
      element("cbc:Percent", percent(line.taxRate)),
      taxScheme(),
      "</cac:ClassifiedTaxCategory>",
      "</cac:Item>",
      `<cac:Price>${amount("cbc:PriceAmount", line.unitPrice, currency)}</cac:Price>`,
      "</cac:InvoiceLine>",
    ].join("");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    element("cbc:CustomizationID", XRECHNUNG_CUSTOMIZATION_ID),
    element("cbc:ProfileID", PEPPOL_BILLING_PROFILE_ID),
    element("cbc:ID", invoice.number),
    element("cbc:IssueDate", issueDate),
    element("cbc:DueDate", dueDate),
    element("cbc:InvoiceTypeCode", INVOICE_TYPE_COMMERCIAL),
    element("cbc:Note", invoice.notes),
    element("cbc:DocumentCurrencyCode", currency),
    element("cbc:BuyerReference", invoice.deal?.name ?? invoice.number),
    supplier,
    customer,
    paymentMeans,
    taxTotal,
    monetaryTotal,
    ...lines,
    "</ubl:Invoice>",
    "",
  ].join("\n");
}
