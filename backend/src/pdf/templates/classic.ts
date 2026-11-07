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
import { currencyLabel, LABELS } from "../labels.js";
import { drawMixedLine, hasArabic, mixedLineWidth, registerArabicFonts } from "../mixedText.js";
import { itemDisplayName, translateUnit, weightQtyText } from "../itemFormatting.js";
import type { InvoiceLanguage, InvoiceLineItem, InvoicePdfData } from "../types.js";

/**
 * POS/thermal-receipt style invoice: an 80mm-wide page whose height grows
 * with the item count, a centered logo + business name, and a compact
 * three-column item table (name | weight | line total). Each language's
 * Ethiopic/Arabic font is pre-merged with Latin+digit glyphs (see assets.ts),
 * so — unlike the receipt template — this one draws with a single
 * `doc.font(...)` per run, no per-character script-splitting needed.
 *
 * Arabic pages are fully in Arabic and laid out right to left: labels and
 * item names on the right, amounts on the left. PDFKit joins an Arabic word's
 * letters but doesn't order words right to left, so their text goes through
 * mixedText.ts's word-by-word drawing.
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

/** Arabic invoices use the Arabic business name when one is set, else the English one. */
function shopNameFor(language: InvoiceLanguage): string {
  if (language === "am") return ENV.BUSINESS_NAME_AM ?? "";
  if (language === "ar") return ENV.BUSINESS_NAME_AR || ENV.BUSINESS_NAME_EN || "";
  return ENV.BUSINESS_NAME_EN ?? "";
}

type LineOptions = { align?: "left" | "right" | "center"; bold?: boolean; size: number; color?: string };

/**
 * One line of text that may hold Arabic, drawn word by word in reading order
 * (see mixedText.ts) and cut with "…" if it doesn't fit; leaves doc.y below it.
 */
function textLine(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, opts: LineOptions) {
  const { align = "left", bold = false, size, color = "black" } = opts;
  drawMixedLine(doc, text, x, y, { font: bold ? "Body-Bold" : "Body", bold, size, color, width, align });
  doc.fillColor("black").font("Body").fontSize(size);
  doc.y = y + doc.currentLineHeight(true);
}

/** Grey for the small per-unit discount note under a line. */
const DISCOUNT_NOTE_COLOR = "#777777";

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

function row(
  doc: PDFKit.PDFDocument,
  left: string,
  right: string,
  opts: { bold?: boolean; valueBold?: boolean; size?: number; rtl?: boolean } = {},
) {
  const { bold = false, valueBold = false, size = 8.5, rtl = false } = opts;
  if (rtl) {
    // Mirrored: the label on the right, the value on the left.
    const y = doc.y;
    textLine(doc, left, MARGIN + CONTENT_WIDTH * 0.4, y, CONTENT_WIDTH * 0.6, { align: "right", bold, size });
    const yAfterLabel = doc.y;
    textLine(doc, right, MARGIN, y, CONTENT_WIDTH * 0.6, { align: "left", bold: valueBold || bold, size });
    doc.y = Math.max(yAfterLabel, doc.y);
    return;
  }
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
function drawSplitCentered(doc: PDFKit.PDFDocument, text: string, centerX: number, y: number, rtl = false) {
  if (!text) return;
  const match = SUFFIX_PATTERN.exec(text);
  if (!match) {
    doc.text(text, centerX - doc.widthOfString(text) / 2, y, { lineBreak: false });
    return;
  }
  const [, number = "", suffix = ""] = match;
  const numberWidth = doc.widthOfString(number);
  const suffixWidth = doc.widthOfString(suffix);
  if (rtl && suffix) {
    // Read right to left ("20 كغ"): the unit on the left, a space, then the number.
    const gap = doc.widthOfString(" ");
    const startX = centerX - (numberWidth + gap + suffixWidth) / 2;
    doc.text(suffix, startX, y, { lineBreak: false });
    doc.text(number, startX + suffixWidth + gap, y, { lineBreak: false });
    return;
  }
  const startX = centerX - (numberWidth + suffixWidth) / 2;
  doc.text(number, startX, y, { lineBreak: false });
  if (suffix) doc.text(suffix, startX + numberWidth, y, { lineBreak: false });
}

function row3(
  doc: PDFKit.PDFDocument,
  name: string,
  weight: string,
  total: string,
  opts: { bold?: boolean; nameBold?: boolean; size?: number; rtl?: boolean } = {},
) {
  const { bold = false, nameBold = false, size = 8, rtl = false } = opts;
  const y = doc.y;
  if (rtl) {
    // Mirrored columns: name on the right, weight in the middle, line total on the left.
    const nameX = MARGIN + CONTENT_WIDTH - NAME_COL_W;
    doc.font(bold || nameBold ? "Body-Bold" : "Body").fontSize(size);
    if (hasArabic(name)) textLine(doc, name, nameX, y, NAME_COL_W, { align: "right", bold: bold || nameBold, size });
    else doc.text(name, nameX, y, { width: NAME_COL_W, align: "right" });
    const yAfterName = doc.y;
    doc.font(bold ? "Body-Bold" : "Body").fontSize(size);
    drawSplitCentered(doc, weight, MARGIN + TOTAL_COL_W + WEIGHT_COL_W / 2, y, true);
    textLine(doc, total, MARGIN, y, TOTAL_COL_W, { align: "left", bold, size });
    doc.y = Math.max(yAfterName, doc.y);
    return;
  }
  doc.font(bold || nameBold ? "Body-Bold" : "Body").fontSize(size);
  doc.text(name, MARGIN, y, { width: NAME_COL_W });
  const yAfterName = doc.y;
  doc.font(bold ? "Body-Bold" : "Body").fontSize(size);
  drawSplitCentered(doc, weight, MARGIN + NAME_COL_W + WEIGHT_COL_W / 2, y);
  doc.text(total, MARGIN + NAME_COL_W + WEIGHT_COL_W, y, { width: TOTAL_COL_W, align: "right" });
  doc.y = Math.max(yAfterName, doc.y);
}

/** `label value`, both on one line, value starting right after the label (the label already carries its own trailing colon). */
function labelValueLine(doc: PDFKit.PDFDocument, label: string, value: string, size = 8.5, rtl = false) {
  if (rtl) {
    // Right to left: the label at the right edge, the value just left of it.
    const y = doc.y;
    const labelWidth = mixedLineWidth(doc, label, { font: "Body", size, color: "black", width: CONTENT_WIDTH });
    const gap = doc.font("Body").fontSize(size).widthOfString(" ");
    textLine(doc, label, MARGIN, y, CONTENT_WIDTH, { align: "right", size });
    textLine(doc, value, MARGIN, y, CONTENT_WIDTH - labelWidth - gap, { align: "right", bold: true, size });
    return;
  }
  doc.font("Body").fontSize(size);
  doc.text(`${label} `, MARGIN, doc.y, { continued: true });
  doc.font("Body-Bold").text(value);
}

/** Draws one full receipt page for `language` onto `doc`'s current page. */
function drawReceiptContent(doc: PDFKit.PDFDocument, invoice: InvoicePdfData, language: InvoiceLanguage): void {
  const currency = currencyLabel(invoice.currency ?? "SAR", language);
  const labels = LABELS[language];
  const rtl = language === "ar";
  /** A centered line: plain doc.text, or word-by-word for Arabic. */
  const centered = (text: string, size: number) => {
    if (rtl) textLine(doc, text, MARGIN, doc.y, CONTENT_WIDTH, { align: "center", bold: true, size });
    else doc.font("Body-Bold").fontSize(size).text(text, { align: "center" });
  };

  const logoPath = invoice.logoPath ?? DEFAULT_LOGO;
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, (POS_PAGE_WIDTH - LOGO_SIZE) / 2, MARGIN, { width: LOGO_SIZE, height: LOGO_SIZE });
  }
  doc.y = MARGIN + LOGO_SIZE + 4;

  centered(shopNameFor(language), 13);
  const returnNotice = invoice.returnNotice;
  if (returnNotice) {
    doc.moveDown(0.2);
    centered(labels.returnTitle, 11);
  }
  doc.moveDown(0.9);

  doc.fontSize(8.5);
  labelValueLine(doc, labels.customer, invoice.customerName, 8.5, rtl);
  doc.moveDown(0.1);

  hr(doc, 0.3, 0.15);

  row(doc, labels.date, invoice.date, { valueBold: true, rtl });
  if (returnNotice) {
    row(doc, labels.returnNumber, invoice.invoiceNumber, { valueBold: true, rtl });
    row(doc, labels.referenceInvoice, returnNotice.referenceInvoiceNumber, { valueBold: true, rtl });
  } else {
    row(doc, labels.invoiceNumber, invoice.invoiceNumber, { valueBold: true, rtl });
  }

  hr(doc, 0.7, 0.15);
  doc.moveDown(0.15);
  row3(doc, labels.item, labels.weightQty, labels.colTotal, { bold: true, rtl });
  subtleHr(doc, 0.25, 0.1);

  invoice.lineItems.forEach((item) => {
    const lineTotal = item.quantity * item.rate;
    row3(doc, itemDisplayName(item, language), weightQtyText(item, language), money(lineTotal, currency), {
      nameBold: true,
      rtl,
    });
    const unit = translateUnit(item.unit, language);
    const priceLineY = doc.y;
    if (rtl) {
      drawArabicPriceLines(doc, item, unit, currency, labels.discount, priceLineY);
      doc.moveDown(0.2);
      return;
    }
    // Discounted: the price actually charged x quantity, under the line total, so the total reads at a glance.
    if (item.regularRate) {
      doc
        .font("Body")
        .fontSize(6.5)
        .fillColor(DISCOUNT_NOTE_COLOR)
        .text(`${money(item.rate, currency)} x ${item.quantity}`, MARGIN, priceLineY, { width: CONTENT_WIDTH, align: "right" })
        .fillColor("black");
    }
    doc
      .font("Body")
      .fontSize(7.5)
      .text(`  ${money(item.regularRate ?? item.rate, currency)} x ${item.quantity} ${unit}`, MARGIN, priceLineY, { width: CONTENT_WIDTH });
    // Sold below the regular price: the line above shows the regular price, this the discount per unit.
    if (item.regularRate) {
      doc
        .font("Body")
        .fontSize(6.5)
        .fillColor(DISCOUNT_NOTE_COLOR)
        .text(`  ${labels.discount} -${money(item.regularRate - item.rate, currency)} / ${unit}`, MARGIN, doc.y, { width: CONTENT_WIDTH })
        .fillColor("black");
    }
    doc.moveDown(0.2);
  });

  hr(doc);

  if (returnNotice) {
    // A return states what's credited back and what the customer owes after it — no subtotal, discount or paid.
    row(doc, labels.total, money(invoice.totalPrice, currency), { bold: true, size: 10.5, rtl });
    if (returnNotice.balanceDue !== undefined) {
      doc.moveDown(0.2);
      row(doc, labels.balanceDue, money(returnNotice.balanceDue, currency), { bold: true, size: 10.5, rtl });
    }
  } else {
    drawSaleTotals(doc, invoice, labels, currency, rtl);
  }

  doc.moveDown(0.35);
  hr(doc, 0.7, 0.2);

  doc.moveDown(0.7);
  centered(labels.thankYou, 9);
}

/**
 * The Arabic page's lines under an item, mirrored: the (regular) price x
 * quantity and unit on the right; when sold below the regular price, the
 * price actually charged x quantity on the left and the discount per unit
 * under it on the right.
 */
function drawArabicPriceLines(
  doc: PDFKit.PDFDocument,
  item: InvoiceLineItem,
  unit: string,
  currency: string,
  discountLabel: string,
  y: number,
) {
  const indented = CONTENT_WIDTH - 6;
  if (item.regularRate) {
    textLine(doc, `${money(item.rate, currency)} × ${item.quantity}`, MARGIN, y, CONTENT_WIDTH * 0.45, {
      size: 6.5,
      color: DISCOUNT_NOTE_COLOR,
    });
  }
  textLine(doc, `${money(item.regularRate ?? item.rate, currency)} × ${item.quantity} ${unit}`, MARGIN, y, indented, {
    align: "right",
    size: 7.5,
  });
  if (item.regularRate) {
    textLine(doc, `${discountLabel} -${money(item.regularRate - item.rate, currency)} / ${unit}`, MARGIN, doc.y, indented, {
      align: "right",
      size: 6.5,
      color: DISCOUNT_NOTE_COLOR,
    });
  }
}

/** What a line sold below its regular price saves the customer (0 when it isn't). */
function lineDiscount(item: InvoiceLineItem): number {
  return item.regularRate ? Math.round((item.regularRate - item.rate) * item.quantity * 100) / 100 : 0;
}

/**
 * A sale's totals block: subtotal, item and invoice discounts, paid, total
 * and balance due. With lines sold below their regular price, the subtotal
 * is at regular prices and their difference is its own row, so the rows
 * still add up to the total.
 */
function drawSaleTotals(
  doc: PDFKit.PDFDocument,
  invoice: InvoicePdfData,
  labels: (typeof LABELS)[InvoiceLanguage],
  currency: string,
  rtl: boolean,
) {
  const itemDiscounts = Math.round(invoice.lineItems.reduce((sum, item) => sum + lineDiscount(item), 0) * 100) / 100;
  const subTotal = (invoice.subTotal ?? invoice.totalPrice + (invoice.discountAmount ?? 0)) + itemDiscounts;
  const returned = invoice.returnedAmount ?? 0;
  const balanceDue = invoice.totalPrice - invoice.paidAmount - returned;

  row(doc, labels.subTotal, money(subTotal, currency), { rtl });
  if (itemDiscounts > 0) row(doc, labels.itemDiscounts, "-" + money(itemDiscounts, currency), { rtl });
  if (invoice.discountAmount) {
    row(doc, labels.discount, "-" + money(invoice.discountAmount, currency), { rtl });
  }
  row(doc, labels.paid, money(invoice.paidAmount, currency), { rtl });
  if (returned > 0) row(doc, labels.returned, "-" + money(returned, currency), { rtl });
  subtleHr(doc);
  row(doc, labels.total, money(invoice.totalPrice, currency), { bold: true, size: 10.5, rtl });
  doc.moveDown(0.2);
  row(doc, labels.balanceDue, money(balanceDue, currency), { bold: true, size: 10.5, rtl });
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
  registerArabicFonts(scratch);

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
    registerArabicFonts(doc);

    const pageHeight = measurePageHeight(invoice, language);
    doc.addPage({
      size: [POS_PAGE_WIDTH, pageHeight],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });

    drawReceiptContent(doc, invoice, language);
  });
}
