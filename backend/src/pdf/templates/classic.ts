import fs from "fs";
import { DEFAULT_LOGO } from "../assets.js";
import { LABELS } from "../labels.js";
import { itemDisplayName, translateUnit, weightQtyText } from "../itemFormatting.js";
import { createTextRenderer } from "../textRenderer.js";
import type { InvoiceLanguage, InvoicePdfData } from "../types.js";

/**
 * The original full-page (Letter) invoice template: header with logo, three
 * info lines, a five-column items table, and a totals block. Draws straight
 * onto `doc` — the caller owns creating and finishing the document.
 */
export function renderInvoiceDocument(
  doc: PDFKit.PDFDocument,
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): void {
    const currency = invoice.currency ?? "SAR";
    const labels = LABELS[language];

    const { baseFontSize, mixedTextWidth, drawMixedText, drawQuantityCalc, drawQtyUnit, drawMoney } =
      createTextRenderer(doc, currency);

    const headerTop = doc.y;
    const logoSize = 70;
    const logoX = doc.page.width - doc.page.margins.right - logoSize;
    const logoY = headerTop;
    const titleFontSize = 20;
    const titleY = logoY + (logoSize - titleFontSize) / 2;

    const logoPath = invoice.logoPath ?? DEFAULT_LOGO;
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize], align: "center", valign: "center" });
    } else {
      doc
        .rect(logoX, logoY, logoSize, logoSize)
        .stroke();
      const logoLabelWidth = mixedTextWidth(labels.logoPlaceholder, false, 8);
      drawMixedText(labels.logoPlaceholder, logoX + (logoSize - logoLabelWidth) / 2, logoY + logoSize / 2 - 4, { fontSize: 8 });
    }

    drawMixedText(labels.title, 50, titleY, { fontSize: titleFontSize });
    doc.y = headerTop + logoSize;
    doc.moveDown(1);

    doc.fontSize(11);
    const drawLabeledLine = (label: string, value: string, y: number) => {
      drawMixedText(label, 50, y, { bold: true });
      const labelWidth = mixedTextWidth(label, true, baseFontSize);
      drawMixedText(value, 50 + labelWidth + 3, y);
    };

    let infoY = doc.y;
    drawLabeledLine(labels.invoiceNumber, invoice.invoiceNumber, infoY);
    infoY += 16;
    drawLabeledLine(labels.customer, invoice.customerName, infoY);
    infoY += 16;
    drawLabeledLine(labels.date, invoice.date, infoY);
    doc.y = infoY + 16;
    doc.moveDown(1);

    const tableTop = doc.y;
    const columns = {
      qtyUnit: 50,
      name: 140,
      weightKg: 290,
      rate: 400,
      amount: 490,
    };

    drawMixedText(labels.qty, columns.qtyUnit, tableTop, { bold: true });
    drawMixedText(labels.item, columns.name, tableTop, { bold: true });
    drawMixedText(labels.weightQty, columns.weightKg, tableTop, { bold: true });
    drawMixedText(labels.rate, columns.rate, tableTop, { bold: true });
    drawMixedText(labels.amount, columns.amount, tableTop, { bold: true });

    doc.y = tableTop + 16;
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);

    const rowHeight = 20;

    invoice.lineItems.forEach((item, index) => {
      const rowY = tableTop + 25 + index * rowHeight;
      const amount = item.quantity * item.rate;

      drawQtyUnit(item.quantity, translateUnit(item.unit, language), columns.qtyUnit, rowY);
      drawMixedText(itemDisplayName(item, language), columns.name, rowY);
      drawQuantityCalc(weightQtyText(item, language), columns.weightKg, rowY);
      drawMoney(item.rate, columns.rate, rowY);
      drawMoney(amount, columns.amount, rowY);
    });

    doc.y = tableTop + 25 + invoice.lineItems.length * rowHeight;

    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(1);

    const balanceDue = invoice.totalPrice - invoice.paidAmount;
    const rightEdge = doc.page.width - doc.page.margins.right;

    const drawTotalRow = (label: string, value: number, bold: boolean) => {
      const y = doc.y;
      drawMixedText(label, 50, y, { bold });
      drawMoney(value, 0, y, { right: rightEdge });
      doc.y = y;
      doc.moveDown(1.2);
    };

    drawTotalRow(labels.total, invoice.totalPrice, true);
    if (invoice.discountAmount) {
      drawTotalRow(labels.discount, -invoice.discountAmount, false);
    }
    drawTotalRow(labels.paid, invoice.paidAmount, false);
    drawTotalRow(labels.balanceDue, balanceDue, true);
}
