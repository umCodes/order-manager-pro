import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toAmharicUnit, toArabicUnit, toEnglishUnit } from "./units.js";
import { quantityCalc, quantityCalcWithSuffix } from "./calcs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, "../assets/fonts/NotoSansEthiopic-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/NotoSansEthiopic-Bold.ttf");
const FONT_ARABIC_REGULAR = path.join(__dirname, "../assets/fonts/NotoSansArabic-Regular.ttf");
const FONT_ARABIC_BOLD = path.join(__dirname, "../assets/fonts/NotoSansArabic-Bold.ttf");
const DEFAULT_LOGO = path.join(__dirname, "../assets/images/logo.png");

const ETHIOPIC_RANGE = /[ሀ-፿]/;
const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/;

export type InvoiceLanguage = "am" | "ar" | "en";

export type InvoiceLineItem = {
  description: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
};

export type InvoicePdfData = {
  invoiceNumber: string;
  customerName: string;
  date: string;
  lineItems: InvoiceLineItem[];
  totalPrice: number;
  paidAmount: number;
  discountAmount?: number;
  currency?: string;
  logoPath?: string;
};

type Labels = {
  title: string;
  logoPlaceholder: string;
  invoiceNumber: string;
  customer: string;
  date: string;
  qty: string;
  item: string;
  weightQty: string;
  rate: string;
  amount: string;
  total: string;
  discount: string;
  paid: string;
  balanceDue: string;
};

const LABELS: Record<InvoiceLanguage, Labels> = {
  am: {
    title: "ደረሰኝ",
    logoPlaceholder: "ሎጎ",
    invoiceNumber: "የደረሰኝ ቁጥር:",
    customer: "ደንበኛ:",
    date: "ቀን:",
    qty: "ብዛት",
    item: "እቃ",
    weightQty: "የኪሎ ብዛት",
    rate: "ዋጋ",
    amount: "ድምር",
    total: "ጠቅላላ ድምር:",
    discount: "ቅናሽ:",
    paid: "የተከፈለ:",
    balanceDue: "ቀሪ ሂሳብ:",
  },
  ar: {
    title: "Invoice",
    logoPlaceholder: "LOGO",
    invoiceNumber: "Invoice Number:",
    customer: "Customer:",
    date: "Date:",
    qty: "Qty",
    item: "Item",
    weightQty: "Weight Qty",
    rate: "Rate",
    amount: "Amount",
    total: "Total:",
    discount: "Discount:",
    paid: "Paid:",
    balanceDue: "Balance Due:",
  },
  en: {
    title: "Invoice",
    logoPlaceholder: "LOGO",
    invoiceNumber: "Invoice Number:",
    customer: "Customer:",
    date: "Date:",
    qty: "Qty",
    item: "Item",
    weightQty: "Weight Qty",
    rate: "Rate",
    amount: "Amount",
    total: "Total:",
    discount: "Discount:",
    paid: "Paid:",
    balanceDue: "Balance Due:",
  },
};

function itemDisplayName(item: InvoiceLineItem, language: InvoiceLanguage): string {
  return language === "am" ? item.description : item.itemName;
}

function translateUnit(unit: string, language: InvoiceLanguage): string {
  if (language === "am") return toAmharicUnit(unit);
  if (language === "ar") return toArabicUnit(unit);
  return toEnglishUnit(unit);
}

function weightQtyText(item: InvoiceLineItem, language: InvoiceLanguage): string {
  if (language === "am") return `${quantityCalc(item.quantity, item.unit)}`;
  const kgSuffix = language === "ar" ? "كجم" : "kg";
  const gSuffix = language === "ar" ? "جم" : "g";
  return quantityCalcWithSuffix(item.quantity, item.unit, kgSuffix, gSuffix);
}

function renderInvoiceDocument(
  doc: PDFKit.PDFDocument,
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): void {
    const currency = invoice.currency ?? "SAR";
    const baseFontSize = 11;
    const currencyFontSize = 7;
    const suffixFontSize = 9;
    const labels = LABELS[language];

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold", FONT_BOLD);
    doc.registerFont("Arabic", FONT_ARABIC_REGULAR);
    doc.registerFont("Arabic-Bold", FONT_ARABIC_BOLD);
    doc.registerFont("Latin", "Helvetica");
    doc.registerFont("Latin-Bold", "Helvetica-Bold");

    // Splits mixed-script text into runs so each run can be drawn with a
    // font that actually has glyphs for it (Noto Sans Ethiopic/Arabic have
    // no Latin/digit glyphs, and Helvetica has no Ethiopic/Arabic glyphs).
    type Script = "ethiopic" | "arabic" | "latin";
    const scriptOf = (char: string): Script => {
      if (ETHIOPIC_RANGE.test(char)) return "ethiopic";
      if (ARABIC_RANGE.test(char)) return "arabic";
      return "latin";
    };

    const splitRuns = (text: string): { text: string; script: Script }[] => {
      const runs: { text: string; script: Script }[] = [];
      let current = "";
      let currentScript: Script | null = null;

      for (const char of text) {
        const script = scriptOf(char);
        if (currentScript === null || script === currentScript) {
          current += char;
          currentScript = script;
        } else {
          runs.push({ text: current, script: currentScript });
          current = char;
          currentScript = script;
        }
      }
      if (current) runs.push({ text: current, script: currentScript ?? "latin" });
      return runs;
    };

    const fontFor = (script: Script, bold: boolean) => {
      if (script === "ethiopic") return bold ? "Bold" : "Regular";
      if (script === "arabic") return bold ? "Arabic-Bold" : "Arabic";
      return bold ? "Latin-Bold" : "Latin";
    };

    const mixedTextWidth = (text: string, bold: boolean, fontSize: number) => {
      let width = 0;
      for (const run of splitRuns(text)) {
        doc.font(fontFor(run.script, bold)).fontSize(fontSize);
        width += doc.widthOfString(run.text);
      }
      return width;
    };

    // Draws mixed-script text left-to-right at (x, y), switching fonts per
    // run. Does not support line wrapping.
    const drawMixedText = (
      text: string,
      x: number,
      y: number,
      options: { bold?: boolean; fontSize?: number } = {}
    ) => {
      const { bold = false, fontSize = baseFontSize } = options;
      let cursorX = x;
      for (const run of splitRuns(text)) {
        doc.font(fontFor(run.script, bold)).fontSize(fontSize);
        doc.text(run.text, cursorX, y, { lineBreak: false });
        cursorX += doc.widthOfString(run.text);
      }
    };

    // Splits a "<number><suffix>" string (e.g. "12.5kg", "500g", "2كجم")
    // so the suffix can be drawn small+bold next to the base-size number.
    const SUFFIX_PATTERN = /^([\d.]+)(.*)$/;

    const drawQuantityCalc = (value: string, x: number, y: number) => {
      const match = SUFFIX_PATTERN.exec(value);
      if (!match) {
        drawMixedText(value, x, y);
        return;
      }
      const [, number, suffix] = match;
      drawMixedText(number ?? "", x, y);
      if (suffix) {
        const numberWidth = mixedTextWidth(number ?? "", false, baseFontSize);
        const suffixY = y + (baseFontSize - suffixFontSize) / 2;
        drawMixedText(suffix, x + numberWidth + 2, suffixY, { bold: true, fontSize: suffixFontSize });
      }
    };

    // Draws "<quantity> <unit>" the same way: quantity at base size, unit
    // suffix small+bold, so it matches the weight column's styling.
    const drawQtyUnit = (quantity: number, unit: string, x: number, y: number) => {
      const numberText = `${quantity}`;
      drawMixedText(numberText, x, y);
      const numberWidth = mixedTextWidth(numberText, false, baseFontSize);
      const suffixY = y + (baseFontSize - suffixFontSize) / 2;
      drawMixedText(unit, x + numberWidth + 3, suffixY, { bold: true, fontSize: suffixFontSize });
    };

    const measureMoneyWidth = (value: number) => {
      const amountText = `(${value.toFixed(2)})`;
      const currencyWidth = mixedTextWidth(currency, true, currencyFontSize);
      const amountWidth = mixedTextWidth(amountText, false, baseFontSize);
      return currencyWidth + 2 + amountWidth;
    };

    const drawMoney = (value: number, x: number, y: number, options?: { right?: number }) => {
      const amountText = `${value.toFixed(1)}`;
      const currencyWidth = mixedTextWidth(currency, true, currencyFontSize);

      const startX = options?.right !== undefined
        ? options.right - measureMoneyWidth(value)
        : x;

      drawMixedText(currency, startX, y, { bold: true, fontSize: currencyFontSize });
      drawMixedText(amountText, startX + currencyWidth + 2, y - (baseFontSize - currencyFontSize) / 2, {
        fontSize: baseFontSize,
      });
    };

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

function createLocalizedInvoicePdfFile(
  filePath: string,
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    renderInvoiceDocument(doc, invoice, language);

    doc.end();

    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

function createLocalizedInvoicePdfBuffer(
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderInvoiceDocument(doc, invoice, language);

    doc.end();
  });
}

/** Amharic invoice: Amharic labels, item.description as the display name, ኪሎ/ግራም weight suffixes. */
export function createInvoicePdf(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createLocalizedInvoicePdfFile(filePath, invoice, "am");
}

/** Arabic invoice: English labels (per business preference), item.itemName as the display name, Arabic-translated units. */
export function createInvoicePdfArabic(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createLocalizedInvoicePdfFile(filePath, invoice, "ar");
}

/** English invoice: English labels, item.itemName as the display name, English units. */
export function createInvoicePdfEnglish(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createLocalizedInvoicePdfFile(filePath, invoice, "en");
}

/** Same as createInvoicePdf, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createLocalizedInvoicePdfBuffer(invoice, "am");
}

/** Same as createInvoicePdfArabic, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfArabicBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createLocalizedInvoicePdfBuffer(invoice, "ar");
}

/** Same as createInvoicePdfEnglish, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfEnglishBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createLocalizedInvoicePdfBuffer(invoice, "en");
}

/** Generates an invoice PDF buffer in the given language ("am" | "ar" | "en"). */
export function createInvoicePdfBufferForLanguage(
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): Promise<Buffer> {
  return createLocalizedInvoicePdfBuffer(invoice, language);
}
