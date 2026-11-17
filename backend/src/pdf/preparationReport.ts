import { renderToBuffer } from "./documentFactory.js";
import { FONT_ETHIOPIC_MERGED_BOLD, FONT_ETHIOPIC_MERGED_REGULAR } from "./assets.js";
import { businessDayWindow, businessTimeParts } from "../utils/businessDate.js";
import { toAmharicUnit } from "../utils/units.js";
import { drawMixedLine, registerArabicFonts } from "./mixedText.js";
import type { PersonOrder, PersonReport, PreparationReportData } from "../services/preparationReport.js";
import type { PreparationStatus } from "../services/telegram/groupOrders.js";

/**
 * The preparation report (A4, Amharic, large print like the daily report):
 * who in the Telegram group prepared which invoices and backup lists on a
 * business day. For everyone: a summary table per person, then each
 * person's orders on a page of their own, then the orders nobody confirmed.
 * For one person: only their page.
 */

const WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
const MONTHS = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
const STATUS: Record<PreparationStatus, { text: string; fill: string; ink: string }> = {
  ready: { text: "ዝግጁ", fill: "#dcfce7", ink: "#14532d" },
  partial: { text: "በከፊል", fill: "#fef3c7", ink: "#78350f" },
  missing: { text: "የለም", fill: "#fee2e2", ink: "#7f1d1d" },
  not_reported: { text: "አልተዘገበም", fill: "#e5e7eb", ink: "#374151" },
};
const HOW: Record<PersonOrder["how"], string> = {
  thumb: "ተዘጋጅቷል ብሏል",
  report: "የጎደለ ሪፖርት ልኳል",
  all_missing: "ሁሉም የለም ብሏል",
  seen: "አይቷል",
};

const INK = "#000000";
const SECOND = "#374151";
const RULE = "#9ca3af";
const BAND = "#e5e7eb";
const STRIPE = "#f3f4f6";
const ACCENT = "#7f1d1d";
const MARGIN = 36;

const time = (iso: string) => businessTimeParts(new Date(iso)).time;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const orderLabel = (order: { order_number: string }) => order.order_number;
const kindLabel = (order: { kind: string }) => (order.kind === "backup_list" ? "ትርፍ ዝርዝር" : "ደረሰኝ");
const shortText = (order: PersonOrder) =>
  order.short.map((item) => `${item.description} ${item.available === 0 ? "የለም" : `−${round3(item.short)} ${toAmharicUnit(item.unit)}`}`).join("፣ ");

type Col = { w: number; align?: "left" | "right" | "center" };
type Cell = string | { main: string; sub?: string | undefined; bold?: boolean; badge?: PreparationStatus };

export function createPreparationReportPdfBuffer(report: PreparationReportData, personId?: string): Promise<Buffer> {
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
    function section(title: string, note: string) {
      if (sectionsDrawn++ > 0) {
        doc.addPage();
        doc.y = MARGIN;
      }
      const y = doc.y;
      drawMixedLine(doc, title, L, y, { font: "B", bold: true, size: 22, color: INK, width: W });
      doc.moveTo(L, y + 34).lineTo(L + W, y + 34).lineWidth(2.5).strokeColor(ACCENT).stroke();
      doc.font("R").fontSize(11.5).fillColor(SECOND).text(note, L, y + 42, { width: W });
      doc.y += 14;
    }

    function empty(text = "ምንም የለም።") {
      doc.font("R").fontSize(12.5).fillColor(SECOND).text(text, L + 6, doc.y + 2);
      doc.y += 6;
    }

    const invoicesOf = (person: PersonReport) => person.orders.filter((order) => order.kind === "invoice");
    const listsOf = (person: PersonReport) => person.orders.filter((order) => order.kind === "backup_list");

    const orderCols: Col[] = [{ w: 28, align: "right" }, { w: 172 }, { w: 72 }, { w: 82, align: "center" }, { w: W - 354 }];
    function personPage(person: PersonReport) {
      const invoices = invoicesOf(person).length;
      const lists = listsOf(person).length;
      section(person.name, `${invoices} ደረሰኞች · ${lists} ትርፍ ዝርዝሮች · ${person.reports} የጎደሉ ሪፖርቶች`);
      if (person.orders.length === 0) {
        empty("በዚህ ቀን ያዘጋጀው ደረሰኝ የለም።");
      } else {
        header(orderCols, ["#", "ደረሰኝ", "ሰዓት", "ሁኔታ", "የጎደሉ እቃዎች"]);
        person.orders.forEach((order, i) =>
          row(
            orderCols,
            [
              String(i + 1),
              { main: orderLabel(order), bold: true, sub: `${kindLabel(order)} · ${HOW[order.how]}` },
              time(order.at),
              { main: "", badge: order.status },
              order.short.length ? { main: shortText(order), sub: `${order.items} እቃዎች` } : { main: "—", sub: `${order.items} እቃዎች` },
            ],
            i % 2 === 1,
          ),
        );
      }
      totalBox([
        ["የተዘጋጁ ደረሰኞች", String(invoices)],
        ["ትርፍ ዝርዝሮች", String(lists)],
        ["የጎደሉ ሪፖርቶች", String(person.reports)],
      ]);
    }

    // ---------- page 1 heading ----------
    const start = businessTimeParts(businessDayWindow(report.day).start);
    const made = businessTimeParts(report.generatedAt);
    const single = personId ? report.people[0] : undefined;
    doc.font("B").fontSize(26).fillColor(INK).text("የዝግጅት ሪፖርት", L, MARGIN);
    doc.font("B").fontSize(16).fillColor(ACCENT).text(`${WEEKDAYS[start.weekday]} ${start.day} ${MONTHS[start.month]} ${start.year}`, L, doc.y + 4);
    doc.font("R").fontSize(11).fillColor(SECOND).text(`የተዘጋጀው፦ ${made.day} ${MONTHS[made.month]} ${made.time}`, L, doc.y + 4);
    if (!report.isComplete) {
      doc.font("B").fontSize(11).fillColor(ACCENT).text("ይህ የሥራ ቀን ገና አላለቀም — እስካሁን የተመዘገበው ብቻ ነው።", L, doc.y + 4, { width: W });
    }
    doc.y += 8;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.8).strokeColor(RULE).stroke();
    doc.y += 18;

    if (personId) {
      if (single) personPage(single);
      else {
        section("?", "");
        empty("በዚህ ቀን ያዘጋጀው ደረሰኝ የለም።");
      }
    } else {
      // ---------- summary ----------
      const summaryCols: Col[] = [{ w: W - 300 }, { w: 100, align: "right" }, { w: 100, align: "right" }, { w: 100, align: "right" }];
      section("ማጠቃለያ", "በቴሌግራም ቡድኑ ውስጥ እያንዳንዱ ሰው ያዘጋጃቸው ደረሰኞች እና ትርፍ ዝርዝሮች።");
      if (report.people.length === 0) empty("በዚህ ቀን ማንም ያዘጋጀው ደረሰኝ የለም።");
      else {
        header(summaryCols, ["ስም", "ደረሰኞች", "ትርፍ", "ሪፖርቶች"]);
        report.people.forEach((person, i) =>
          row(
            summaryCols,
            [{ main: person.name, bold: true }, String(invoicesOf(person).length), String(listsOf(person).length), String(person.reports)],
            i % 2 === 1,
          ),
        );
      }
      totalBox([
        ["ያልተዘገቡ ደረሰኞች", String(report.unreported.filter((order) => order.kind === "invoice").length)],
      ]);

      for (const person of report.people) personPage(person);

      // ---------- nobody confirmed ----------
      const unreportedCols: Col[] = [{ w: 28, align: "right" }, { w: 200 }, { w: 120 }, { w: W - 348, align: "right" }];
      section("ያልተዘገቡ ደረሰኞች", "በዚህ ቀን ተልከው ማንም ዝግጁ መሆናቸውን ያላረጋገጠላቸው።");
      if (report.unreported.length === 0) empty();
      else {
        header(unreportedCols, ["#", "ደረሰኝ", "የተላከበት ሰዓት", "እቃዎች"]);
        report.unreported.forEach((order, i) =>
          row(unreportedCols, [String(i + 1), { main: orderLabel(order), bold: true, sub: kindLabel(order) }, time(order.posted_at), String(order.items)], i % 2 === 1),
        );
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
