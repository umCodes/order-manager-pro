import { renderToBuffer } from "./documentFactory.js";
import { FONT_ETHIOPIC_MERGED_BOLD, FONT_ETHIOPIC_MERGED_REGULAR } from "./assets.js";
import { businessDayWindow, businessTimeParts } from "../utils/businessDate.js";
import { lineWeightKg } from "../utils/packWeight.js";
import { toAmharicUnit } from "../utils/units.js";
import { drawMixedLine, registerArabicFonts } from "./mixedText.js";
import type { DailyReportData, InvoiceStatus } from "../services/dailyReport/report.js";
import type { ReportLine } from "../services/dailyReport/store.js";

/**
 * The daily business report (A4, Amharic, large print for easy reading).
 * Each section starts on a page of its own under a large underlined title:
 * payments collected, items sold, invoices issued (orders delivered), the
 * invoice register with balances, returns, and orders not yet delivered.
 * Item names are the Amharic description with the English (Zoho) name under
 * it; item tables show the quantity with its unit and the weight in kilograms
 * (from the pack size in the English name, see packWeight.ts). Names in
 * Arabic (customers, items) are drawn with the Arabic font, right to left
 * (see mixedText.ts); everything else stays in Amharic as is.
 */

const WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
const MONTHS = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
const PAYMENT_MODES: Record<string, string> = {
  cash: "ጥሬ ገንዘብ",
  banktransfer: "የባንክ ዝውውር",
  bank_transfer: "የባንክ ዝውውር",
  creditcard: "ካርድ",
  card: "ካርድ",
};
const STATUS: Record<InvoiceStatus, { text: string; fill: string; ink: string }> = {
  paid: { text: "ተከፍሏል", fill: "#dcfce7", ink: "#14532d" },
  partial: { text: "በከፊል", fill: "#fef3c7", ink: "#78350f" },
  unpaid: { text: "አልተከፈለም", fill: "#fee2e2", ink: "#7f1d1d" },
};

const INK = "#000000";
const SECOND = "#374151";
const RULE = "#9ca3af";
const BAND = "#e5e7eb";
const STRIPE = "#f3f4f6";
const ACCENT = "#7f1d1d";
const MARGIN = 36;

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const qty = (value: number) => String(round3(value));
const kgText = (kg: number | null) => (kg === null ? "—" : String(round3(kg)));
const linesKg = (lines: ReportLine[]) => lines.reduce((sum, line) => sum + (lineWeightKg(line.name, line.quantity) ?? 0), 0);
/** "2 ካርቶን"; just the number for lines recorded before units were kept. */
const qtyWithUnit = (quantity: number, unit: string | undefined) => (unit ? `${qty(quantity)} ${toAmharicUnit(unit)}` : qty(quantity));
const time = (iso: string) => businessTimeParts(new Date(iso)).time;

/** "18 ኦክቶበር" for a YYYY-MM-DD date. */
function dateLabel(date: string | undefined) {
  if (!date) return "";
  const [, month = 1, day = 1] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function modeLabel(mode: string) {
  return PAYMENT_MODES[mode.toLowerCase().replace(/\s+/g, "")] ?? mode;
}

type Col = { w: number; align?: "left" | "right" | "center" };
/** A table cell: plain text, or text with a smaller second line, bold, or a status badge. */
type Cell = string | { main: string; sub?: string | undefined; bold?: boolean; badge?: InvoiceStatus };

export function createDailyReportPdfBuffer(report: DailyReportData): Promise<Buffer> {
  return renderToBuffer({ size: "A4", margin: MARGIN, bufferPages: true }, (doc) => {
    doc.registerFont("R", FONT_ETHIOPIC_MERGED_REGULAR);
    doc.registerFont("B", FONT_ETHIOPIC_MERGED_BOLD);
    registerArabicFonts(doc);
    const L = MARGIN;
    const W = doc.page.width - MARGIN * 2;
    const BOTTOM = doc.page.height - 56;

    function ensure(height: number) {
      if (doc.y + height > BOTTOM) {
        doc.addPage();
        doc.y = MARGIN;
      }
    }

    function header(cols: Col[], labels: string[]) {
      ensure(70);
      const y = doc.y;
      doc.rect(L, y, W, 26).fill(BAND);
      let x = L;
      doc.font("B").fontSize(11.5).fillColor(INK);
      cols.forEach((col, i) => {
        doc.text(labels[i] ?? "", x + 6, y + 6, { width: col.w - 12, align: col.align ?? "left", lineBreak: false });
        x += col.w;
      });
      doc.y = y + 26;
    }

    function row(cols: Col[], cells: Cell[], shade: boolean) {
      const tall = cells.some((cell) => typeof cell !== "string" && cell.sub);
      const height = tall ? 40 : 28;
      ensure(height);
      const y = doc.y;
      if (shade) doc.rect(L, y, W, height).fill(STRIPE);
      let x = L;
      cols.forEach((col, i) => {
        const cell = cells[i] ?? "";
        const top = y + (tall ? 6 : 7);
        if (typeof cell !== "string" && cell.badge) {
          const status = STATUS[cell.badge];
          doc.font("B").fontSize(12);
          const badgeW = doc.widthOfString(status.text) + 16;
          const badgeX = x + (col.w - badgeW) / 2;
          doc.roundedRect(badgeX, y + (height - 20) / 2, badgeW, 20, 10).fill(status.fill);
          doc.fillColor(status.ink).text(status.text, badgeX, y + (height - 20) / 2 + 3, { width: badgeW, align: "center", lineBreak: false });
        } else {
          const main = typeof cell === "string" ? cell : cell.main;
          const bold = typeof cell !== "string" && !!cell.bold;
          drawMixedLine(doc, main, x + 6, top, { font: bold ? "B" : "R", bold, size: 12.5, color: INK, width: col.w - 12, align: col.align });
          if (typeof cell !== "string" && cell.sub) {
            drawMixedLine(doc, cell.sub, x + 6, top + 18, { font: "R", size: 9.5, color: SECOND, width: col.w - 12, align: col.align });
          }
        }
        x += col.w;
      });
      doc.y = y + height;
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.6).strokeColor(RULE).stroke();
    }

    function totalBox(lines: [string, string][]) {
      const height = 14 + lines.length * 26;
      ensure(height + 10);
      const y = doc.y + 8;
      doc.rect(L, y, W, height).lineWidth(1.5).strokeColor(INK).stroke();
      lines.forEach(([label, value], i) => {
        const lineY = y + 9 + i * 26;
        doc.font("B").fontSize(13.5).fillColor(INK).text(label, L + 12, lineY, { lineBreak: false });
        doc.font("B").fontSize(15).text(value, L, lineY - 1, { width: W - 12, align: "right", lineBreak: false });
      });
      doc.y = y + height + 4;
    }

    let sectionsDrawn = 0;
    /** Every section starts on a page of its own; its title is the largest text there, underlined. */
    function section(n: number, title: string, note: string) {
      if (sectionsDrawn++ > 0) {
        doc.addPage();
        doc.y = MARGIN;
      }
      const y = doc.y;
      doc.font("B").fontSize(22).fillColor(INK).text(`${n}. ${title}`, L, y, { lineBreak: false });
      doc.moveTo(L, y + 34).lineTo(L + W, y + 34).lineWidth(2.5).strokeColor(ACCENT).stroke();
      doc.font("R").fontSize(11.5).fillColor(SECOND).text(note, L, y + 42, { width: W });
      doc.y += 14;
    }

    function empty() {
      doc.font("R").fontSize(12.5).fillColor(SECOND).text("ምንም የለም።", L + 6, doc.y + 2);
      doc.y += 6;
    }

    /** A customer heading inside a section: smaller than the section title, with a thin bar beside it. */
    function customerHeading(customer: string, detail: string) {
      doc.y += 10;
      const y = doc.y;
      doc.rect(L, y, 3, 36).fill(ACCENT);
      drawMixedLine(doc, customer, L + 12, y + 1, { font: "B", bold: true, size: 14, color: INK, width: W - 12 });
      drawMixedLine(doc, detail, L + 12, y + 21, { font: "R", size: 11, color: SECOND, width: W - 12 });
      doc.y = y + 44;
    }

    const itemCell = (line: { description: string; name: string }): Cell => ({
      main: line.description || line.name,
      sub: line.description && line.name && line.description !== line.name ? line.name : undefined,
    });

    const lineCols: Col[] = [{ w: 180 }, { w: 92, align: "right" }, { w: 70, align: "right" }, { w: 85, align: "right" }, { w: W - 427, align: "right" }];
    function lineTable(lines: ReportLine[]) {
      header(lineCols, ["እቃ", "ብዛት", "ኪሎ", "ዋጋ", "ድምር"]);
      lines.forEach((line, i) =>
        row(
          lineCols,
          [
            itemCell(line),
            qtyWithUnit(line.quantity, line.unit),
            kgText(lineWeightKg(line.name, line.quantity)),
            money(line.rate),
            { main: money(line.quantity * line.rate), bold: true },
          ],
          i % 2 === 1,
        ),
      );
    }

    // ---------- page 1 heading ----------
    const start = businessTimeParts(businessDayWindow(report.day).start);
    const made = businessTimeParts(report.generatedAt);
    doc.font("B").fontSize(26).fillColor(INK).text("የዕለት የሥራ ሪፖርት", L, MARGIN);
    doc.font("B").fontSize(16).fillColor(ACCENT).text(`${WEEKDAYS[start.weekday]} ${start.day} ${MONTHS[start.month]} ${start.year}`, L, doc.y + 4);
    doc.font("R").fontSize(11).fillColor(SECOND).text(`የተዘጋጀው፦ ${made.day} ${MONTHS[made.month]} ${made.time}`, L, doc.y + 4);
    if (!report.isComplete) {
      doc.font("B").fontSize(11).fillColor(ACCENT).text("ይህ የሥራ ቀን ገና አላለቀም — እስካሁን የተመዘገበው ብቻ ነው።", L, doc.y + 4, { width: W });
    }
    if (report.zohoTimezone.matches === false) {
      const offset = report.zohoTimezone.offsetHours ?? 0;
      doc
        .font("R")
        .fontSize(10.5)
        .fillColor(ACCENT)
        .text(
          `የZoho የሰዓት ሰቅ ${report.zohoTimezone.timeZone} (UTC${offset >= 0 ? "+" : ""}${offset}) ነው፤ መተግበሪያው UTC+3 ይጠቀማል — ከእኩለ ሌሊት አካባቢ ያሉ ቀኖች ሊለያዩ ይችላሉ።`,
          L,
          doc.y + 4,
          { width: W },
        );
    }
    if (!report.balancesRefreshed) {
      doc.font("R").fontSize(10.5).fillColor(ACCENT).text("ከZoho ማንበብ አልተቻለም፤ ቀሪ ሂሳቦቹ ደረሰኞቹ በተሰሩበት ጊዜ እንደነበሩ ናቸው።", L, doc.y + 4, { width: W });
    }
    doc.y += 8;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.8).strokeColor(RULE).stroke();
    doc.y += 18;

    const nothing = !report.payments.length && !report.invoices.length && !report.returns.length && !report.drafts.length;

    if (nothing) {
      const y = doc.y + 10;
      doc.rect(L, y, W, 100).lineWidth(1.5).strokeColor(INK).stroke();
      doc.font("B").fontSize(18).fillColor(INK).text("በዚህ የሥራ ቀን ምንም አልተመዘገበም።", L, y + 28, { width: W, align: "center" });
      doc.font("R").fontSize(12.5).fillColor(SECOND).text("ክፍያ፣ ደረሰኝ፣ ተመላሽ ወይም አዲስ ትዕዛዝ የለም።", L, y + 60, { width: W, align: "center" });
    } else {
      const sales = report.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
      const collected = report.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const paidAgainst = report.invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
      const outstanding = report.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);

      // ---------- 1. payments collected ----------
      section(1, "የተለቀሙ ጥቅል ክፍያዎች", "በሥራ ቀኑ የተለቀሙ ክፍያዎች በሙሉ፣ በተለቀሙበት ሰዓት ቅደም ተከተል።");
      if (!report.payments.length) empty();
      else {
        const cols: Col[] = [{ w: 70 }, { w: 220 }, { w: 110 }, { w: W - 400, align: "right" }];
        header(cols, ["ሰዓት", "ደንበኛ", "ዓይነት", "መጠን (SAR)"]);
        report.payments.forEach((payment, i) =>
          row(
            cols,
            [time(payment.at), { main: payment.customer, sub: payment.number }, modeLabel(payment.mode), { main: money(payment.amount), bold: true }],
            i % 2 === 1,
          ),
        );
        totalBox([["ጠቅላላ የተለቀመ ክፍያ", `${money(collected)} SAR`]]);
      }

      // ---------- 2. items sold ----------
      section(2, "የተሸጡ እቃዎች", "በሥራ ቀኑ የደረሱ ትዕዛዞች (የተሰሩ ደረሰኞች) እቃዎች፣ በእቃ ተጠቃለው።");
      if (!report.items.length) empty();
      else {
        const cols: Col[] = [{ w: 160 }, { w: 92, align: "right" }, { w: 70, align: "right" }, { w: 100, align: "right" }, { w: W - 422, align: "right" }];
        header(cols, ["እቃ", "ብዛት", "ኪሎ", "አማካይ ዋጋ", "ጠቅላላ (SAR)"]);
        let totalKg = 0;
        report.items.forEach((item, i) => {
          const kg = lineWeightKg(item.name, item.quantity);
          if (kg !== null) totalKg += kg;
          row(
            cols,
            [
              itemCell(item),
              qtyWithUnit(item.quantity, item.unit),
              kgText(kg),
              { main: money(item.quantity ? item.value / item.quantity : 0), sub: item.low === item.high ? undefined : `${money(item.low)} – ${money(item.high)}` },
              { main: money(item.value), bold: true },
            ],
            i % 2 === 1,
          );
        });
        totalBox([
          ["ጠቅላላ ሽያጭ", `${money(sales)} SAR`],
          ["ጠቅላላ ኪሎ", `${round3(totalKg)} ኪሎ`],
        ]);
      }

      // ---------- 3. invoices issued (orders delivered) ----------
      section(3, "የተሰሩ ደረሰኞች", "በሥራ ቀኑ የደረሰ እያንዳንዱ ትዕዛዝ ከእቃዎቹ ጋር።");
      if (!report.invoices.length) empty();
      for (const invoice of report.invoices) {
        ensure(120 + invoice.lines.length * 40);
        customerHeading(invoice.customer, `${invoice.number}  ·  የደረሰበት ${time(invoice.at)}`);
        lineTable(invoice.lines);
        ensure(26);
        doc
          .font("B")
          .fontSize(13)
          .fillColor(INK)
          .text(`${round3(linesKg(invoice.lines))} ኪሎ   ·   የደረሰኝ ድምር፦  ${money(invoice.total)} SAR`, L, doc.y + 8, { width: W - 6, align: "right" });
        doc.y += 4;
      }

      // ---------- 4. invoice register & balances ----------
      section(4, "ደረሰኞችና ቀሪ ሂሳብ", "በሥራ ቀኑ የተሰሩ ደረሰኞች፣ ሪፖርቱ በተዘጋጀበት ጊዜ የተከፈለባቸው።");
      if (!report.invoices.length) empty();
      else {
        const cols: Col[] = [{ w: 170 }, { w: 90, align: "right" }, { w: 90, align: "right" }, { w: 85, align: "right" }, { w: W - 435, align: "center" }];
        header(cols, ["ደንበኛ", "ጠቅላላ", "የተከፈለ", "ቀሪ", "ሁኔታ"]);
        report.invoices.forEach((invoice, i) =>
          row(
            cols,
            [
              { main: invoice.customer, sub: invoice.number },
              money(invoice.total),
              money(invoice.paid),
              { main: money(invoice.balance), bold: true },
              { main: "", badge: invoice.status },
            ],
            i % 2 === 1,
          ),
        );
        totalBox([
          ["ጠቅላላ ሽያጭ", `${money(sales)} SAR`],
          ["የተከፈለ", `${money(paidAgainst)} SAR`],
          ["በዕለቱ ደረሰኞች ላይ ያለ ቀሪ", `${money(outstanding)} SAR`],
        ]);
      }

      // ---------- 5. returns ----------
      section(5, "ተመላሽ እቃዎች", "በሥራ ቀኑ የተመዘገቡ ተመላሾች።");
      if (!report.returns.length) empty();
      else {
        for (const ret of report.returns) {
          ensure(110 + ret.lines.length * 40);
          customerHeading(ret.customer, `${ret.number}  ·  ለደረሰኝ ${ret.invoice_number}  ·  ${time(ret.at)}`);
          lineTable(ret.lines);
        }
        totalBox([
          ["ጠቅላላ ተመላሽ", `${money(report.returns.reduce((sum, ret) => sum + ret.total, 0))} SAR`],
          ["ጠቅላላ ኪሎ", `${round3(linesKg(report.returns.flatMap((ret) => ret.lines)))} ኪሎ`],
        ]);
      }

      // ---------- 6. orders not yet delivered ----------
      section(6, "ያልደረሱ ትዕዛዞች", "ገና ያልደረሱ ትዕዛዞች (ረቂቆች)፣ ከሚደርሱበት ቀን ጋር።");
      if (!report.drafts.length) empty();
      else {
        const cols: Col[] = [{ w: 230 }, { w: 120 }, { w: W - 350, align: "right" }];
        header(cols, ["ደንበኛ", "የሚደርስበት ቀን", "ጠቅላላ (SAR)"]);
        report.drafts.forEach((draft, i) =>
          row(cols, [{ main: draft.customer, sub: draft.number }, dateLabel(draft.date), { main: money(draft.total), bold: true }], i % 2 === 1),
        );
        totalBox([["ጠቅላላ ያልደረሰ", `${money(report.drafts.reduce((sum, draft) => sum + draft.total, 0))} SAR`]]);
      }
    }

    // ---------- page numbers ----------
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc
        .font("B")
        .fontSize(11)
        .fillColor(SECOND)
        .text(`ገጽ ${i + 1} ከ ${range.count}`, L, doc.page.height - 36, { width: W, align: "center", lineBreak: false });
    }
  });
}
