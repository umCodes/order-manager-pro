import fs from "fs";
import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { ENV } from "../../constants/env.js";
import {
  DEFAULT_LOGO,
  FONT_ARABIC_MERGED_BOLD,
  FONT_ARABIC_MERGED_REGULAR,
  FONT_ETHIOPIC_MERGED_BOLD,
  FONT_ETHIOPIC_MERGED_REGULAR,
} from "../assets.js";
import { LABELS } from "../labels.js";
import { itemDisplayName, translateUnit, weightQtyText } from "../itemFormatting.js";
import type { InvoiceLanguage, InvoicePdfData } from "../types.js";

/**
 * POS/thermal-receipt style invoice: an 80mm-wide page whose height grows
 * with the item count, a centered logo + business name, and a compact
 * three-column item table (name | weight | line total). Each language's
 * Ethiopic/Arabic font is pre-merged with Latin+digit glyphs (see assets.ts),
 * so — unlike the receipt template — this one draws with a single
 * `doc.font(...)` per run, no per-character script-splitting needed.
 */
export const POS_PAGE_WIDTH = 226.77; // 80mm thermal roll width
const MARGIN = 12;
const CONTENT_WIDTH = POS_PAGE_WIDTH - MARGIN * 2;
const LOGO_SIZE = 26;

const NAME_COL_W = CONTENT_WIDTH * 0.42;
const WEIGHT_COL_W = CONTENT_WIDTH * 0.3;
const TOTAL_COL_W = CONTENT_WIDTH - NAME_COL_W - WEIGHT_COL_W;

function fontFilesFor(language: InvoiceLanguage) {
  return language === "ar"
    ? { regular: FONT_ARABIC_MERGED_REGULAR, bold: FONT_ARABIC_MERGED_BOLD }
    : { regular: FONT_ETHIOPIC_MERGED_REGULAR, bold: FONT_ETHIOPIC_MERGED_BOLD };
}

/** Arabic invoices show the English business name too, per the same convention as their labels/item names. */
function shopNameFor(language: InvoiceLanguage): string {
  return language === "am" ? ENV.BUSINESS_NAME_AM ?? "" : ENV.BUSINESS_NAME_EN ?? "";
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function hr(doc: PDFKit.PDFDocument, afterSpace = 0.7, beforeSpace = 0.5) {
  doc.moveDown(beforeSpace);
  const y = doc.y;
  doc.save().dash(2, { space: 2 }).moveTo(MARGIN, y).lineTo(POS_PAGE_WIDTH - MARGIN, y).stroke().undash().restore();
  doc.moveDown(afterSpace);
}

function subtleHr(doc: PDFKit.PDFDocument, afterSpace = 0.3, beforeSpace = 0.15) {
  doc.moveDown(beforeSpace);
  const y = doc.y;
  doc.save().lineWidth(0.5).strokeColor("#bbbbbb").moveTo(MARGIN, y).lineTo(POS_PAGE_WIDTH - MARGIN, y).stroke().restore();
  doc.moveDown(afterSpace);
}

function row(doc: PDFKit.PDFDocument, left: string, right: string, opts: { bold?: boolean; valueBold?: boolean; size?: number } = {}) {
  const { bold = false, valueBold = false, size = 8.5 } = opts;
  doc.font(bold ? "Body-Bold" : "Body").fontSize(size);
  const y = doc.y;
  doc.text(left, MARGIN, y, { width: CONTENT_WIDTH * 0.6 });
  doc.font(valueBold ? "Body-Bold" : bold ? "Body-Bold" : "Body");
  doc.text(right, MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
}

// Matches a leading "<number>" off a "<number><suffix>" string (e.g. "20kg", "500g", "20كغ").
const SUFFIX_PATTERN = /^([\d.]+)(.*)$/;

/**
 * Draws a "<number><suffix>" string as two separate text calls — number,
 * then suffix — centered as a unit within a column. PDFKit doesn't apply
 * Unicode bidi reordering, so a single doc.text() call with digits directly
 * touching Arabic glyphs (no space between them) renders the digits
 * reversed; splitting the draw calls — the same fix textRenderer.ts's
 * drawQuantityCalc already uses for the same reason — avoids it.
 */
function drawSplitCentered(doc: PDFKit.PDFDocument, text: string, centerX: number, y: number) {
  const match = SUFFIX_PATTERN.exec(text);
  if (!match) {
    doc.text(text, centerX - doc.widthOfString(text) / 2, y, { lineBreak: false });
    return;
  }
  const [, number = "", suffix = ""] = match;
  const numberWidth = doc.widthOfString(number);
  const suffixWidth = doc.widthOfString(suffix);
  const startX = centerX - (numberWidth + suffixWidth) / 2;
  doc.text(number, startX, y, { lineBreak: false });
  if (suffix) doc.text(suffix, startX + numberWidth, y, { lineBreak: false });
}

function row3(
  doc: PDFKit.PDFDocument,
  name: string,
  weight: string,
  total: string,
  opts: { bold?: boolean; nameBold?: boolean; size?: number } = {},
) {
  const { bold = false, nameBold = false, size = 8 } = opts;
  const y = doc.y;
  doc.font(bold || nameBold ? "Body-Bold" : "Body").fontSize(size);
  doc.text(name, MARGIN, y, { width: NAME_COL_W });
  const yAfterName = doc.y;
  doc.font(bold ? "Body-Bold" : "Body").fontSize(size);
  drawSplitCentered(doc, weight, MARGIN + NAME_COL_W + WEIGHT_COL_W / 2, y);
  doc.text(total, MARGIN + NAME_COL_W + WEIGHT_COL_W, y, { width: TOTAL_COL_W, align: "right" });
  doc.y = Math.max(yAfterName, doc.y);
}

/** `label value`, both on one line, value starting right after the label (the label already carries its own trailing colon). */
function labelValueLine(doc: PDFKit.PDFDocument, label: string, value: string, size = 8.5) {
  doc.font("Body").fontSize(size);
  doc.text(`${label} `, MARGIN, doc.y, { continued: true });
  doc.font("Body-Bold").text(value);
}

/** Draws one full receipt page for `language` onto `doc`'s current page. */
function drawReceiptContent(doc: PDFKit.PDFDocument, invoice: InvoicePdfData, language: InvoiceLanguage): void {
  const currency = invoice.currency ?? "SAR";
  const labels = LABELS[language];

  const logoPath = invoice.logoPath ?? DEFAULT_LOGO;
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, (POS_PAGE_WIDTH - LOGO_SIZE) / 2, MARGIN, { width: LOGO_SIZE, height: LOGO_SIZE });
  }
  doc.y = MARGIN + LOGO_SIZE + 4;

  doc.font("Body-Bold").fontSize(13).text(shopNameFor(language), { align: "center" });
  doc.moveDown(0.9);

  doc.fontSize(8.5);
  labelValueLine(doc, labels.customer, invoice.customerName);
  doc.moveDown(0.1);

  hr(doc, 0.3, 0.15);

  row(doc, labels.date, invoice.date, { valueBold: true });
  row(doc, labels.invoiceNumber, invoice.invoiceNumber, { valueBold: true });

  hr(doc, 0.7, 0.15);
  doc.moveDown(0.15);
  row3(doc, labels.item, labels.weightQty, labels.colTotal, { bold: true });
  subtleHr(doc, 0.25, 0.1);

  invoice.lineItems.forEach((item) => {
    const lineTotal = item.quantity * item.rate;
    row3(doc, itemDisplayName(item, language), weightQtyText(item, language), money(lineTotal, currency), {
      nameBold: true,
    });
    const unit = translateUnit(item.unit, language);
    doc
      .font("Body")
      .fontSize(7.5)
      .text(`  ${money(item.rate, currency)} x ${item.quantity} ${unit}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.2);
  });

  hr(doc);

  const subTotal = invoice.subTotal ?? invoice.totalPrice + (invoice.discountAmount ?? 0);
  const balanceDue = invoice.totalPrice - invoice.paidAmount;

  row(doc, labels.subTotal, money(subTotal, currency));
  if (invoice.discountAmount) {
    row(doc, labels.discount, "-" + money(invoice.discountAmount, currency));
  }
  row(doc, labels.paid, money(invoice.paidAmount, currency));
  subtleHr(doc);
  row(doc, labels.total, money(invoice.totalPrice, currency), { bold: true, size: 10.5 });
  doc.moveDown(0.2);
  row(doc, labels.balanceDue, money(balanceDue, currency), { bold: true, size: 10.5 });

  doc.moveDown(0.35);
  hr(doc, 0.7, 0.2);

  doc.moveDown(0.7);
  doc.font("Body-Bold").fontSize(9).text(labels.thankYou, { align: "center" });
}

/** Discards everything written to it — used only to measure a page's needed height, with no scratch file left behind. */
function nullWritable(): Writable {
  return new Writable({
    write(_chunk: unknown, _enc: string, callback: () => void) {
      callback();
    },
  });
}

/**
 * Draws the content once on an oversized scratch page to find out exactly
 * how tall the real page needs to be — Arabic and Ethiopic fonts have
 * different line-height metrics, so this is measured per language rather
 * than assumed from the item count alone.
 */
function measurePageHeight(invoice: InvoicePdfData, language: InvoiceLanguage): number {
  const scratch = new PDFDocument({
    size: [POS_PAGE_WIDTH, 4000],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  });
  scratch.pipe(nullWritable());

  const { regular, bold } = fontFilesFor(language);
  scratch.registerFont("Body", regular);
  scratch.registerFont("Body-Bold", bold);

  drawReceiptContent(scratch, invoice, language);
  const height = Math.ceil(scratch.y + MARGIN);
  scratch.end();
  return height;
}

/**
 * Renders the invoice onto `doc` as one page per language in `languages` —
 * each page sized to fit its own content (see measurePageHeight). `doc` must
 * have been constructed with `autoFirstPage: false`.
 */
export function renderInvoiceDocument(doc: PDFKit.PDFDocument, invoice: InvoicePdfData, languages: InvoiceLanguage[]): void {
  languages.forEach((language) => {
    const { regular, bold } = fontFilesFor(language);
    doc.registerFont("Body", regular);
    doc.registerFont("Body-Bold", bold);

    const pageHeight = measurePageHeight(invoice, language);
    doc.addPage({
      size: [POS_PAGE_WIDTH, pageHeight],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });

    drawReceiptContent(doc, invoice, language);
  });
}
