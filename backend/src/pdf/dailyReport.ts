import { renderToBuffer } from "./documentFactory.js";
import { FONT_ETHIOPIC_MERGED_BOLD, FONT_ETHIOPIC_MERGED_REGULAR } from "./assets.js";
import { businessDayWindow, businessTimeParts } from "../utils/businessDate.js";
import type { DailyReportData } from "../services/dailyReport/report.js";
import type { ReportLine } from "../services/dailyReport/store.js";

/**
 * The daily business report (A4, Amharic): a summary, then payments
 * received, sales by item, sales by invoice, the invoice register with
 * balances, returns, and drafts not yet sent. Item names are the Amharic
 * description, with the English (Zoho) name small and grey underneath.
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
const STATUS = { paid: "ተከፍሏል", partial: "በከፊል ተከፍሏል", unpaid: "አልተከፈለም" } as const;

const INK = "#111827";
const MUTED = "#6b7280";
const SUBTLE = "#9ca3af";
const RULE = "#d1d5db";
const BAND = "#f3f4f6";
const ACCENT = "#7f1d1d";
const MARGIN = 40;

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (value: number) => String(Math.round(value * 1000) / 1000);
const lineSum = (lines: ReportLine[]) => lines.reduce((sum, line) => sum + line.quantity * line.rate, 0);

/** "18 ኦክቶበር 09:02" in business time. */
function when(iso: string) {
  const parts = businessTimeParts(new Date(iso));
  return `${parts.day} ${MONTHS[parts.month]} ${parts.time}`;
}

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
/** A table cell: plain text, or an item (Amharic name with the English name under it). */
type Cell = string | { main: string; sub?: string | undefined };

export function createDailyReportPdfBuffer(report: DailyReportData): Promise<Buffer> {
  return renderToBuffer({ size: "A4", margin: MARGIN, bufferPages: true }, (doc) => {
    doc.registerFont("R", FONT_ETHIOPIC_MERGED_REGULAR);
    doc.registerFont("B", FONT_ETHIOPIC_MERGED_BOLD);
    const L = MARGIN;
    const W = doc.page.width - MARGIN * 2;
    const BOTTOM = doc.page.height - 50;

    function ensure(height: number) {
      if (doc.y + height > BOTTOM) {
        doc.addPage();
        doc.y = MARGIN;
      }
    }

    function header(cols: Col[], labels: string[]) {
      ensure(42);
      const y = doc.y;
      doc.rect(L, y, W, 18).fill(BAND);
      let x = L;
      doc.font("B").fontSize(8.5).fillColor(MUTED);
      cols.forEach((col, i) => {
        doc.text(labels[i] ?? "", x + 4, y + 3, { width: col.w - 8, align: col.align ?? "left", lineBreak: false });
        x += col.w;
      });
      doc.y = y + 20;
    }

    function row(cols: Col[], cells: Cell[], shade: boolean) {
      const tall = cells.some((cell) => typeof cell !== "string" && cell.sub);
      const height = tall ? 26 : 16;
      ensure(height + 2);
      const y = doc.y;
      if (shade) doc.rect(L, y - 1, W, height).fill("#fafafa");
      let x = L;
      cols.forEach((col, i) => {
        const cell = cells[i] ?? "";
        const main = typeof cell === "string" ? cell : cell.main;
        doc.font("R").fontSize(9).fillColor(INK);
        doc.text(main, x + 4, y + 2, { width: col.w - 8, align: col.align ?? "left", lineBreak: false, ellipsis: true });
        if (typeof cell !== "string" && cell.sub) {
          doc.font("R").fontSize(6.5).fillColor(SUBTLE);
          doc.text(cell.sub, x + 4, y + 14, { width: col.w - 8, align: col.align ?? "left", lineBreak: false, ellipsis: true });
        }
        x += col.w;
      });
      doc.y = y + height;
      doc.moveTo(L, doc.y - 1).lineTo(L + W, doc.y - 1).lineWidth(0.4).strokeColor("#eeeeee").stroke();
    }

    function totals(lines: [string, string][]) {
      ensure(20 + lines.length * 17);
      const top = doc.y + 2;
      doc.moveTo(L, top).lineTo(L + W, top).lineWidth(1).strokeColor(INK).stroke();
      doc.y = top + 6;
      for (const [label, value] of lines) {
        const y = doc.y;
        doc.font("B").fontSize(10).fillColor(INK).text(label, L + 4, y, { lineBreak: false });
        doc.text(value, L, y, { width: W - 4, align: "right", lineBreak: false });
        doc.y = y + 17;
      }
    }

    function section(n: number, title: string, note: string, keepWith = 90) {
      ensure(keepWith);
      doc.y += 14;
      doc.font("B").fontSize(13).fillColor(ACCENT).text(`${n}. ${title}`, L, doc.y);
      doc.font("R").fontSize(8.5).fillColor(MUTED).text(note, L, doc.y + 1);
      doc.y += 6;
    }

    function empty(text = "ምንም የለም።") {
      ensure(24);
      doc.font("R").fontSize(9.5).fillColor(MUTED).text(text, L + 4, doc.y + 4);
      doc.y += 6;
    }

    const itemCell = (line: { description: string; name: string }): Cell => ({
      main: line.description || line.name,
      sub: line.description && line.name && line.description !== line.name ? line.name : undefined,
    });

    const lineCols: Col[] = [{ w: 230 }, { w: 70, align: "right" }, { w: 100, align: "right" }, { w: W - 400, align: "right" }];
    function block(customer: string, right: string, lines: ReportLine[], totalLabel: string) {
      const rowsHeight = lines.reduce((h, line) => {
        const cell = itemCell(line);
        return h + (typeof cell !== "string" && cell.sub ? 26 : 16);
      }, 0);
      ensure(Math.min(50 + rowsHeight + 26, 300));
      doc.y += 8;
      const y = doc.y;
      doc.rect(L, y, 3, 18).fill(ACCENT);
      doc.font("B").fontSize(12).fillColor(INK).text(customer, L + 10, y + 1, { width: W * 0.55, lineBreak: false, ellipsis: true });
      doc.font("R").fontSize(9).fillColor(MUTED).text(right, L, y + 4, { width: W, align: "right", lineBreak: false });
      doc.y = y + 24;
      header(lineCols, ["እቃ", "ብዛት", "የአንዱ ዋጋ", "ድምር"]);
      lines.forEach((line, i) => row(lineCols, [itemCell(line), qty(line.quantity), money(line.rate), money(line.quantity * line.rate)], i % 2 === 1));
      ensure(18);
      doc.font("B").fontSize(9.5).fillColor(INK).text(`${totalLabel}  SAR ${money(lineSum(lines))}`, L, doc.y + 3, { width: W - 4, align: "right" });
    }

    // ---------- header ----------
    const window = businessDayWindow(report.day);
    const start = businessTimeParts(window.start);
    const end = businessTimeParts(window.end);
    const made = businessTimeParts(report.generatedAt);
    doc.font("B").fontSize(18).fillColor(INK).text("የዕለቱ የሥራ ሪፖርት", L, MARGIN);
    doc
      .font("R")
      .fontSize(10)
      .fillColor(MUTED)
      .text(
        `የሥራ ቀን፦ ${WEEKDAYS[start.weekday]} ${start.day} ${MONTHS[start.month]} ${start.year}   ·   ` +
          `ከ${start.day} ${MONTHS[start.month]} ${start.time} እስከ ${end.day} ${MONTHS[end.month]} ${end.time}`,
        L,
        doc.y + 2,
      )
      .text(`የተዘጋጀው፦ ${made.day} ${MONTHS[made.month]} ${made.year} ${made.time}`, L, doc.y + 1);
    if (!report.isComplete) {
      doc.font("B").fontSize(9).fillColor(ACCENT).text("ይህ የሥራ ቀን ገና አላለቀም — እስካሁን የተመዘገበው ብቻ ነው።", L, doc.y + 3);
    }
    if (report.zohoTimezone.matches === false) {
      const offset = report.zohoTimezone.offsetHours ?? 0;
      doc
        .font("R")
        .fontSize(8.5)
        .fillColor(ACCENT)
        .text(
          `የZoho የሰዓት ሰቅ ${report.zohoTimezone.timeZone} (UTC${offset >= 0 ? "+" : ""}${offset}) ነው፤ መተግበሪያው UTC+3 ይጠቀማል — ከእኩለ ሌሊት አካባቢ ያሉ ቀኖች ሊለያዩ ይችላሉ።`,
          L,
          doc.y + 2,
        );
    }
    if (!report.balancesRefreshed) {
      doc.font("R").fontSize(8.5).fillColor(ACCENT).text("ከZoho ማንበብ አልተቻለም፤ ቀሪ ሂሳቦቹ ደረሰኞቹ በተላኩበት ጊዜ እንደነበሩ ናቸው።", L, doc.y + 2);
    }
    doc.y += 10;

    const nothing =
      report.payments.length === 0 &&
      report.invoices.length === 0 &&
      report.returns.length === 0 &&
      report.drafts.length === 0;

    if (nothing) {
      const y = doc.y + 20;
      doc.roundedRect(L, y, W, 90, 6).lineWidth(0.8).strokeColor(RULE).stroke();
      doc.font("B").fontSize(14).fillColor(INK).text("በዚህ የሥራ ቀን ምንም አልተመዘገበም።", L, y + 26, { width: W, align: "center" });
      doc
        .font("R")
        .fontSize(9.5)
        .fillColor(MUTED)
        .text("ክፍያ፣ የተላከ ደረሰኝ፣ ተመላሽ ወይም አዲስ ረቂቅ የለም።", L, y + 52, { width: W, align: "center" });
    } else {
      const salesTotal = report.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
      const paidTotal = report.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const paidAgainst = report.invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
      const outstanding = report.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);

      // ---------- summary tiles ----------
      const tiles: [string, string][] = [
        ["የተላኩ ደረሰኞች", String(report.invoices.length)],
        ["ሽያጭ (SAR)", money(salesTotal)],
        ["የተቀበልነው ክፍያ (SAR)", money(paidTotal)],
        ["በዕለቱ ደረሰኞች ላይ ያለ ቀሪ", money(outstanding)],
      ];
      const tileW = (W - 24) / 4;
      const tileY = doc.y;
      tiles.forEach(([label, value], i) => {
        const x = L + i * (tileW + 8);
        doc.roundedRect(x, tileY, tileW, 50, 4).lineWidth(0.8).strokeColor(RULE).stroke();
        doc.font("R").fontSize(7.5).fillColor(MUTED).text(label, x + 8, tileY + 7, { width: tileW - 16 });
        doc.font("B").fontSize(13).fillColor(INK).text(value, x + 8, tileY + 28, { width: tileW - 16, lineBreak: false });
      });
      doc.y = tileY + 62;

      // ---------- 1. payments ----------
      section(1, "የተቀበልናቸው ክፍያዎች", "በሥራ ቀኑ የተመዘገቡ ክፍያዎች በሙሉ፣ በተመዘገቡበት ቅደም ተከተል።");
      if (report.payments.length === 0) empty();
      else {
        const cols: Col[] = [{ w: 95 }, { w: 80 }, { w: 175 }, { w: 90 }, { w: W - 440, align: "right" }];
        header(cols, ["ቀንና ሰዓት", "የክፍያ ቁጥር", "ደንበኛ", "የክፍያ ዓይነት", "መጠን (SAR)"]);
        report.payments.forEach((payment, i) =>
          row(cols, [when(payment.at), payment.number, payment.customer, modeLabel(payment.mode), money(payment.amount)], i % 2 === 1),
        );
        totals([["ጠቅላላ የተቀበልነው ክፍያ", `SAR ${money(paidTotal)}`]]);
      }

      // ---------- 2. sales by item ----------
      section(2, "ሽያጭ በእቃ", "በሥራ ቀኑ እንደተላኩ የተመዘገቡ ደረሰኞች በሙሉ፣ በእቃ ተጠቃለው።");
      if (report.items.length === 0) empty();
      else {
        const cols: Col[] = [{ w: 150 }, { w: 75, align: "right" }, { w: 80, align: "right" }, { w: 65, align: "right" }, { w: 65, align: "right" }, { w: W - 435, align: "right" }];
        header(cols, ["እቃ", "የተሸጠ ብዛት", "አማካይ ዋጋ", "ዝቅተኛ", "ከፍተኛ", "የሽያጭ ዋጋ"]);
        report.items.forEach((item, i) =>
          row(
            cols,
            [itemCell(item), qty(item.quantity), money(item.quantity ? item.value / item.quantity : 0), money(item.low), money(item.high), money(item.value)],
            i % 2 === 1,
          ),
        );
        totals([["ጠቅላላ የእቃ ሽያጭ", `SAR ${money(salesTotal)}`]]);
      }

      // ---------- 3. sales by invoice ----------
      section(3, "ሽያጭ በደረሰኝ", "በሥራ ቀኑ የተላከ እያንዳንዱ ደረሰኝ ከእቃዎቹ ጋር።", report.invoices.length ? 220 : 90);
      if (report.invoices.length === 0) empty();
      for (const invoice of report.invoices) block(invoice.customer, `${invoice.number}  ·  የተላከበት ${when(invoice.at)}`, invoice.lines, "የደረሰኝ ድምር");

      // ---------- 4. invoice register ----------
      // Keep the heading, register and its totals together when they fit on one page.
      section(
        4,
        "የደረሰኞች መዝገብና ቀሪ ሂሳብ",
        "በሥራ ቀኑ የተላኩ ደረሰኞች፣ ሪፖርቱ በተዘጋጀበት ጊዜ የተከፈለባቸው።",
        Math.min(90 + report.invoices.length * 16 + 70, BOTTOM - MARGIN),
      );
      if (report.invoices.length === 0) empty();
      else {
        const cols: Col[] = [{ w: 75 }, { w: 145 }, { w: 70, align: "right" }, { w: 70, align: "right" }, { w: 70, align: "right" }, { w: W - 430, align: "center" }];
        header(cols, ["የደረሰኝ ቁጥር", "ደንበኛ", "ጠቅላላ", "የተከፈለ", "ቀሪ", "ሁኔታ"]);
        report.invoices.forEach((invoice, i) =>
          row(cols, [invoice.number, invoice.customer, money(invoice.total), money(invoice.paid), money(invoice.balance), STATUS[invoice.status]], i % 2 === 1),
        );
        totals([
          ["ጠቅላላ የተሸጠ", `SAR ${money(salesTotal)}`],
          ["ከነዚህ ደረሰኞች የተከፈለ", `SAR ${money(paidAgainst)}`],
          ["ጠቅላላ ቀሪ", `SAR ${money(outstanding)}`],
        ]);
      }

      // ---------- 5. returns ----------
      section(5, "ተመላሽ እቃዎች", "በሥራ ቀኑ የተመዘገቡ ተመላሾች።", report.returns.length ? 200 : 90);
      if (report.returns.length === 0) empty();
      else {
        for (const ret of report.returns) block(ret.customer, `${ret.number}  ·  ለደረሰኝ ${ret.invoice_number}  ·  ${when(ret.at)}`, ret.lines, "የተመላሽ ድምር");
        doc.y += 4;
        totals([["ጠቅላላ ተመላሽ", `SAR ${money(report.returns.reduce((sum, ret) => sum + ret.total, 0))}`]]);
      }

      // ---------- 6. drafts not sent ----------
      section(6, "ያልተላኩ ረቂቆች", "በሥራ ቀኑ ተፈጥረው እስካሁን እንደተላኩ ያልተመዘገቡ ረቂቆች።");
      if (report.drafts.length === 0) empty();
      else {
        const cols: Col[] = [{ w: 85 }, { w: 175 }, { w: 95 }, { w: 75 }, { w: W - 430, align: "right" }];
        header(cols, ["የረቂቅ ቁጥር", "ደንበኛ", "የተፈጠረበት", "ለቀን", "ጠቅላላ"]);
        report.drafts.forEach((draft, i) => row(cols, [draft.number, draft.customer, when(draft.at), dateLabel(draft.date), money(draft.total)], i % 2 === 1));
        totals([["ጠቅላላ ያልተላከ", `SAR ${money(report.drafts.reduce((sum, draft) => sum + draft.total, 0))}`]]);
      }
    }

    // ---------- page footers ----------
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc
        .font("R")
        .fontSize(8)
        .fillColor(MUTED)
        .text(`የዕለቱ የሥራ ሪፖርት · ${start.day} ${MONTHS[start.month]} ${start.year} · ገጽ ${i + 1} ከ ${range.count}`, L, doc.page.height - 32, {
          width: W,
          align: "center",
          lineBreak: false,
        });
    }
  });
}
