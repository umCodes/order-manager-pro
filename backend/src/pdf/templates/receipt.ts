import fs from "fs";
import { DEFAULT_LOGO } from "../assets.js";
import { LABELS, RECEIPT_TITLE } from "../labels.js";
import { itemDisplayName, translateUnit, weightQtyText } from "../itemFormatting.js";
import { createTextRenderer } from "../textRenderer.js";
import type { InvoiceLanguage, InvoicePdfData } from "../types.js";

/** Receipt page dimensions: 420x700pt, narrower than the classic template's Letter-size page. */
export const RECEIPT_PAGE_SIZE: [number, number] = [420, 700];
export const RECEIPT_MARGIN = 30;
const RECEIPT_DISCOUNT_COLOR = "#c0392b";

/**
 * The default "receipt"-style template: a compact 420x700 page with two
 * bordered (unfilled) info/items cards and a pricing summary below —
 * subtotal, discount (in red), paid, and balance, then a divider and the
 * final total (subtotal minus discount) as the bottom-line figure. Draws
 * straight onto `doc`; the caller must create it with RECEIPT_PAGE_SIZE.
 */
export function renderReceiptInvoiceDocument(
  doc: PDFKit.PDFDocument,
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): void {
    const currency = invoice.currency ?? "SAR";
    const labels = LABELS[language];
    const title = RECEIPT_TITLE[language];

    const { baseFontSize, mixedTextWidth, drawMixedText, drawQuantityCalc, drawQtyUnit, drawMoney } =
      createTextRenderer(doc, currency);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // --- Header: title on the left, logo on the right ---
    const headerTop = doc.y;
    const logoSize = 56;
    const logoX = right - logoSize;
    const logoY = headerTop;
    const titleFontSize = 17;
    const titleY = logoY + (logoSize - titleFontSize) / 2;

    const logoPath = invoice.logoPath ?? DEFAULT_LOGO;
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize], align: "center", valign: "center" });
    } else {
      doc.rect(logoX, logoY, logoSize, logoSize).stroke();
      const logoLabelWidth = mixedTextWidth(labels.logoPlaceholder, false, 8);
      drawMixedText(labels.logoPlaceholder, logoX + (logoSize - logoLabelWidth) / 2, logoY + logoSize / 2 - 4, { fontSize: 8 });
    }

    drawMixedText(title, left, titleY, { fontSize: titleFontSize });
    doc.y = headerTop + logoSize;
    doc.moveDown(1);

    // --- Card 1: invoice number / customer / date, thin border, no fill ---
    const cardPadding = 10;
    const infoLineHeight = 16;
    const infoLines = 3;
    const card1Top = doc.y;
    const card1Height = cardPadding * 2 + infoLines * infoLineHeight;

    doc.rect(left, card1Top, contentWidth, card1Height).stroke("#c9c9c9");

    const drawLabeledLine = (label: string, value: string, y: number) => {
      drawMixedText(label, left + cardPadding, y, { bold: true });
      const labelWidth = mixedTextWidth(label, true, baseFontSize);
      drawMixedText(value, left + cardPadding + labelWidth + 5, y);
    };

    let infoY = card1Top + cardPadding;
    drawLabeledLine(labels.invoiceNumber, invoice.invoiceNumber, infoY);
    infoY += infoLineHeight;
    drawLabeledLine(labels.customer, invoice.customerName, infoY);
    infoY += infoLineHeight;
    drawLabeledLine(labels.date, invoice.date, infoY);

    doc.y = card1Top + card1Height;
    doc.moveDown(1);

    // --- Card 2: items table, thin border, no fill ---
    const card2Top = doc.y;
    const cardRight = right - cardPadding;
    const columns = {
      name: left + cardPadding,
      weightKg: left + 118,
      amountRight: cardRight,
      rateRight: cardRight - 62,
      qtyRight: cardRight - 138,
    };
    const rowHeight = 20;
    const headerRowHeight = 24;

    const drawColumnHeader = (label: string, rightEdge: number) => {
      drawMixedText(label, rightEdge - mixedTextWidth(label, true, baseFontSize), rowY, { bold: true });
    };

    let rowY = card2Top + cardPadding + 4;
    drawMixedText(labels.item, columns.name, rowY, { bold: true });
    drawMixedText(labels.weightQty, columns.weightKg, rowY, { bold: true });
    drawColumnHeader(labels.qty, columns.qtyRight);
    drawColumnHeader(labels.rate, columns.rateRight);
    drawColumnHeader(labels.amount, columns.amountRight);

    doc
      .moveTo(left + cardPadding, card2Top + headerRowHeight)
      .lineTo(right - cardPadding, card2Top + headerRowHeight)
      .stroke("#c9c9c9");

    const nameColumnWidth = columns.weightKg - columns.name - 6;

    invoice.lineItems.forEach((item, index) => {
      const y = card2Top + headerRowHeight + 10 + index * rowHeight;
      const amount = item.quantity * item.rate;

      drawMixedText(itemDisplayName(item, language), columns.name, y, { maxWidth: nameColumnWidth });
      drawQuantityCalc(weightQtyText(item, language), columns.weightKg, y);
      drawQtyUnit(item.quantity, translateUnit(item.unit, language), 0, y, { right: columns.qtyRight });
      drawMoney(item.rate, 0, y, { right: columns.rateRight });
      drawMoney(amount, 0, y, { right: columns.amountRight });
    });

    const card2Height = headerRowHeight + 10 + invoice.lineItems.length * rowHeight + cardPadding;
    doc.rect(left, card2Top, contentWidth, card2Height).stroke("#c9c9c9");

    doc.y = card2Top + card2Height;
    doc.moveDown(1.2);

    // --- Pricing summary: subtotal, discount (red), paid, balance, then a
    // divider and the final total (subtotal minus discount) ---
    const subTotal = invoice.subTotal ?? invoice.totalPrice + (invoice.discountAmount ?? 0);
    const balanceDue = invoice.totalPrice - invoice.paidAmount;
    const finalTotal = subTotal - (invoice.discountAmount ?? 0);

    const drawSummaryRow = (label: string, value: number, options?: { bold?: boolean; color?: string }) => {
      const y = doc.y;
      drawMixedText(label, left, y, { bold: options?.bold });
      drawMoney(value, 0, y, { right, color: options?.color });
      doc.y = y;
      doc.moveDown(1.2);
    };

    drawSummaryRow(labels.subTotal, subTotal);
    if (invoice.discountAmount) {
      drawSummaryRow(labels.discount, -invoice.discountAmount, { color: RECEIPT_DISCOUNT_COLOR });
    }
    drawSummaryRow(labels.paid, invoice.paidAmount);
    drawSummaryRow(labels.balanceDue, balanceDue);

    doc.moveDown(0.2);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke("#c9c9c9");
    doc.moveDown(0.8);

    drawSummaryRow(labels.total, finalTotal, { bold: true });
}
