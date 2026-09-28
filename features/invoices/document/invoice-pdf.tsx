import type { InvoiceDto } from "../invoice.schema";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { InvoiceStatus } from "@/generated/prisma";

export type InvoicePdfLabels = {
  title: string;
  draftTitle: string;
  number: string;
  issueDate: string;
  dueDate: string;
  buyerVatId: string;
  position: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  net: string;
  netTotal: string;
  taxAtRate: (rate: string) => string;
  grossTotal: string;
  paid: string;
  balance: string;
  payableBy: (date: string) => string;
  bankDetails: string;
  vatId: string;
  draftMark: string;
  voidMark: string;
};

export type InvoicePdfFormat = {
  money: (amount: number) => string;
  number: (value: number) => string;
  date: (date: Date) => string;
};

const INK = "#1f2328";
const MUTED = "#57606a";
const RULE = "#d0d7de";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 72, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 9, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 36 },
  sellerName: { fontFamily: "Helvetica-Bold", fontSize: 12, marginBottom: 4 },
  muted: { color: MUTED },
  senderLine: { fontSize: 7, color: MUTED, marginBottom: 6, textDecoration: "underline" },
  addressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  buyer: { width: "55%" },
  meta: { width: "40%" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 16 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 5 },
  colPos: { width: "7%" },
  colDescription: { width: "33%", paddingRight: 6 },
  colQuantity: { width: "9%", textAlign: "right" },
  colUnitPrice: { width: "15%", textAlign: "right" },
  colDiscount: { width: "11%", textAlign: "right" },
  colTax: { width: "9%", textAlign: "right" },
  colNet: { width: "16%", textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grossRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 3,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
  },
  block: { marginTop: 24 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingTop: 6,
    fontSize: 7,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mark: {
    position: "absolute",
    top: 360,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    fontFamily: "Helvetica-Bold",
    color: "#e5534b",
    opacity: 0.18,
    transform: "rotate(-30deg)",
  },
});

const linesOf = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function InvoicePdf({
  invoice,
  labels,
  format,
}: {
  invoice: InvoiceDto;
  labels: InvoicePdfLabels;
  format: InvoicePdfFormat;
}) {
  const seller = invoice.seller;
  const sellerLines = linesOf(seller?.address);
  const title = invoice.number ? `${labels.title} ${invoice.number}` : labels.draftTitle;
  const mark =
    invoice.status === InvoiceStatus.draft
      ? labels.draftMark
      : invoice.status === InvoiceStatus.void
        ? labels.voidMark
        : null;
  const footerColumns = [
    [seller?.name, ...sellerLines],
    [seller?.vatId ? `${labels.vatId}: ${seller.vatId}` : null, seller?.email, seller?.phone],
    [seller?.bankDetails ? labels.bankDetails : null, ...linesOf(seller?.bankDetails)],
  ].map((column) => column.filter((line): line is string => Boolean(line)));

  return (
    <Document author={seller?.name ?? undefined} title={title}>
      <Page size="A4" style={styles.page}>
        {mark && <Text style={styles.mark}>{mark}</Text>}

        <View style={styles.header}>
          <View>
            <Text style={styles.sellerName}>{seller?.name ?? ""}</Text>

            {sellerLines.map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.addressRow}>
          <View style={styles.buyer}>
            {seller && <Text style={styles.senderLine}>{[seller.name, ...sellerLines].join(" · ")}</Text>}

            <Text>{invoice.buyerName}</Text>

            {linesOf(invoice.buyerAddress).map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
          </View>

          <View style={styles.meta}>
            {invoice.number && (
              <View style={styles.metaRow}>
                <Text style={styles.muted}>{labels.number}</Text>

                <Text>{invoice.number}</Text>
              </View>
            )}

            {invoice.issueDate && (
              <View style={styles.metaRow}>
                <Text style={styles.muted}>{labels.issueDate}</Text>

                <Text>{format.date(new Date(invoice.issueDate))}</Text>
              </View>
            )}

            {invoice.dueDate && (
              <View style={styles.metaRow}>
                <Text style={styles.muted}>{labels.dueDate}</Text>

                <Text>{format.date(new Date(invoice.dueDate))}</Text>
              </View>
            )}

            {invoice.buyerVatId && (
              <View style={styles.metaRow}>
                <Text style={styles.muted}>{labels.buyerVatId}</Text>

                <Text>{invoice.buyerVatId}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>

        <View style={styles.tableHead}>
          <Text style={styles.colPos}>{labels.position}</Text>

          <Text style={styles.colDescription}>{labels.description}</Text>

          <Text style={styles.colQuantity}>{labels.quantity}</Text>

          <Text style={styles.colUnitPrice}>{labels.unitPrice}</Text>

          <Text style={styles.colDiscount}>{labels.discount}</Text>

          <Text style={styles.colTax}>{labels.taxRate}</Text>

          <Text style={styles.colNet}>{labels.net}</Text>
        </View>

        {invoice.lines.map((line, index) => (
          <View key={line.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.colPos}>{index + 1}</Text>

            <Text style={styles.colDescription}>{line.description}</Text>

            <Text style={styles.colQuantity}>{format.number(line.quantity)}</Text>

            <Text style={styles.colUnitPrice}>{format.money(line.unitPrice)}</Text>

            <Text style={styles.colDiscount}>
              {line.discountPercent > 0 ? `${format.number(line.discountPercent)} %` : ""}
            </Text>

            <Text style={styles.colTax}>{`${format.number(line.taxRate)} %`}</Text>

            <Text style={styles.colNet}>{format.money(line.netAmount)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text>{labels.netTotal}</Text>

            <Text>{format.money(invoice.netTotal)}</Text>
          </View>

          {invoice.taxBreakdown.map((entry) => (
            <View key={entry.taxRate} style={styles.totalRow}>
              <Text>{labels.taxAtRate(format.number(entry.taxRate))}</Text>

              <Text>{format.money(entry.taxAmount)}</Text>
            </View>
          ))}

          <View style={styles.grossRow}>
            <Text>{labels.grossTotal}</Text>

            <Text>{format.money(invoice.grossTotal)}</Text>
          </View>

          {invoice.paidAmount > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text>{labels.paid}</Text>

                <Text>{format.money(invoice.paidAmount)}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text>{labels.balance}</Text>

                <Text>{format.money(invoice.balance)}</Text>
              </View>
            </>
          )}
        </View>

        {(invoice.dueDate || invoice.notes) && (
          <View style={styles.block} wrap={false}>
            {invoice.dueDate && invoice.status === InvoiceStatus.issued && (
              <Text>{labels.payableBy(format.date(new Date(invoice.dueDate)))}</Text>
            )}

            {linesOf(invoice.notes).map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {seller?.footer && (
          <View style={styles.block}>
            {linesOf(seller.footer).map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
          </View>
        )}

        <View fixed style={styles.footer}>
          {footerColumns.map((column, index) => (
            <View key={index}>
              {column.map((line, lineIndex) => (
                <Text key={lineIndex}>{line}</Text>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(invoice: InvoiceDto, labels: InvoicePdfLabels, format: InvoicePdfFormat) {
  return renderToBuffer(<InvoicePdf format={format} invoice={invoice} labels={labels} />);
}
