import { renderToBuffer } from "./documentFactory.js";
import { FONT_ETHIOPIC_MERGED_BOLD, FONT_ETHIOPIC_MERGED_REGULAR } from "./assets.js";
import { businessDayWindow, businessTimeParts } from "../utils/businessDate.js";
import { toAmharicUnit } from "../utils/units.js";
import { drawMixedLine, registerArabicFonts } from "./mixedText.js";
import type { PersonOrder, PersonReport, PreparationReportData } from "../services/preparationReport.js";
import type { PreparationStatus } from "../services/telegram/groupOrders.js";

/**
 * The preparation report (A4, Amharic, large print): who in the Telegram
 * group prepared which invoices and backup lists on a business day — all
 * from the group (👍, shortage reports, ❤️). Every order is a row with the
 * preparers' status as an icon (drawn, so they print the same everywhere)
 * and a word; items they reported short are listed under it. For everyone:
 * a legend, a summary per person, each person's page, and the orders
 * nobody confirmed. For one person: their page.
 */

const WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
const MONTHS = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];

const INK = "#111827";
const SECOND = "#4b5563";
const RULE = "#d1d5db";
const BAND = "#f3f4f6";
const ACCENT = "#7f1d1d";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const GREY = "#9ca3af";
const BLUE = "#2563eb";
const MARGIN = 36;

type IconKind = "ok" | "partial" | "missing" | "unknown" | "problem" | "pending" | "none" | "person" | "invoice" | "list" | "report";
type Mark = { icon: IconKind; text: string; color: string };

const PREPARERS: Record<PreparationStatus, Mark> = {
  ready: { icon: "ok", text: "ዝግጁ", color: GREEN },
  partial: { icon: "partial", text: "በከፊል", color: AMBER },
  missing: { icon: "missing", text: "የለም", color: RED },
  not_reported: { icon: "unknown", text: "አልተዘገበም", color: GREY },
};
const HOW: Record<PersonOrder["how"], string> = {
  thumb: "ዝግጁ ብሏል",
  report: "የጎደለ ሪፖርት",
  all_missing: "ሁሉም የለም ብሏል",
  seen: "አይቷል",
};

const time = (iso: string) => businessTimeParts(new Date(iso)).time;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const amount = (value: number, unit: string) => `${round3(value)} ${toAmharicUnit(unit)}`.trim();
const kindLabel = (order: { kind: string }) => (order.kind === "backup_list" ? "ትርፍ ዝርዝር" : "ደረሰኝ");

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

    // ---------- icons (vector, centred on cx/cy) ----------
    function icon(kind: IconKind, cx: number, cy: number, r = 7, color?: string) {
      doc.save();
      switch (kind) {
        case "ok":
          doc.circle(cx, cy, r).fill(color ?? GREEN);
          doc.moveTo(cx - r * 0.45, cy + r * 0.02).lineTo(cx - r * 0.1, cy + r * 0.38).lineTo(cx + r * 0.5, cy - r * 0.35);
          doc.lineWidth(r * 0.28).lineCap("round").lineJoin("round").strokeColor("#ffffff").stroke();
          break;
        case "partial":
          doc.circle(cx, cy, r - 0.6).lineWidth(1.2).strokeColor(color ?? AMBER).stroke();
          doc.path(`M ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 0 0 ${cx} ${cy + r - 0.6} Z`).fill(color ?? AMBER);
          break;
        case "missing":
          doc.circle(cx, cy, r).fill(color ?? RED);
          doc.moveTo(cx - r * 0.38, cy - r * 0.38).lineTo(cx + r * 0.38, cy + r * 0.38);
          doc.moveTo(cx + r * 0.38, cy - r * 0.38).lineTo(cx - r * 0.38, cy + r * 0.38);
          doc.lineWidth(r * 0.28).lineCap("round").strokeColor("#ffffff").stroke();
          break;
        case "unknown":
          doc.circle(cx, cy, r - 0.6).lineWidth(1.2).dash(1.6, { space: 1.6 }).strokeColor(color ?? GREY).stroke();
          doc.undash();
          doc.circle(cx, cy, r * 0.18).fill(color ?? GREY);
          break;
        case "problem":
          doc.moveTo(cx, cy - r).lineTo(cx + r * 1.05, cy + r * 0.85).lineTo(cx - r * 1.05, cy + r * 0.85).closePath().fill(color ?? RED);
          doc.moveTo(cx, cy - r * 0.35).lineTo(cx, cy + r * 0.2).lineWidth(r * 0.24).lineCap("round").strokeColor("#ffffff").stroke();
          doc.circle(cx, cy + r * 0.55, r * 0.13).fill("#ffffff");
          break;
        case "pending":
          doc.circle(cx, cy, r - 0.6).lineWidth(1.2).strokeColor(color ?? GREY).stroke();
          doc.moveTo(cx, cy - r * 0.5).lineTo(cx, cy).lineTo(cx + r * 0.4, cy + r * 0.25);
          doc.lineWidth(1.2).lineCap("round").strokeColor(color ?? GREY).stroke();
          break;
        case "none":
          doc.moveTo(cx - r * 0.5, cy).lineTo(cx + r * 0.5, cy).lineWidth(1.2).strokeColor(GREY).stroke();
          break;
        case "person":
          doc.circle(cx, cy - r * 0.35, r * 0.38).fill(color ?? INK);
          doc.path(`M ${cx - r * 0.75} ${cy + r * 0.85} A ${r * 0.75} ${r * 0.75} 0 0 1 ${cx + r * 0.75} ${cy + r * 0.85} Z`).fill(color ?? INK);
          break;
        case "invoice":
        case "list":
          doc.roundedRect(cx - r * 0.7, cy - r * 0.9, r * 1.4, r * 1.8, 1.5).lineWidth(1.2).strokeColor(color ?? INK).stroke();
          for (const dy of [-0.4, 0, 0.4]) doc.moveTo(cx - r * 0.38, cy + r * dy).lineTo(cx + r * 0.38, cy + r * dy);
          doc.lineWidth(1).strokeColor(color ?? INK).stroke();
          break;
        case "report":
          doc.roundedRect(cx - r * 0.9, cy - r * 0.7, r * 1.8, r * 1.25, 2).fill(color ?? BLUE);
          doc.moveTo(cx - r * 0.3, cy + r * 0.5).lineTo(cx - r * 0.55, cy + r * 0.95).lineTo(cx + r * 0.1, cy + r * 0.5).fill(color ?? BLUE);
          break;
      }
      doc.restore();
    }

    /** An icon then a word, in its colour, from x. */
    function mark(m: Mark, x: number, cy: number, width: number) {
      icon(m.icon, x + 8, cy);
      doc.font("B").fontSize(11.5).fillColor(m.color === GREY ? SECOND : m.color);
      doc.text(m.text, x + 20, cy - 7.5, { width: width - 22, lineBreak: false, ellipsis: true });
    }

    // ---------- tables ----------
    type Col = { w: number; align?: "left" | "right" | "center" };
    function header(cols: Col[], labels: string[]) {
      ensure(70);
      const y = doc.y;
      doc.rect(L, y, W, 26).fill(BAND);
      let x = L;
      doc.font("B").fontSize(11).fillColor(SECOND);
      cols.forEach((col, i) => {
        doc.text(labels[i] ?? "", x + 6, y + 7, { width: col.w - 12, align: col.align ?? "left", lineBreak: false });
        x += col.w;
      });
      doc.y = y + 26;
    }

    type Draw = (x: number, top: number, w: number, mid: number) => void;
    /** A row: each cell is drawn by its function (x, top, width, middle). */
    function row(cols: Col[], cells: Draw[], height: number, fill?: string) {
      ensure(height);
      const y = doc.y;
      if (fill) doc.rect(L, y, W, height).fill(fill);
      let x = L;
      cols.forEach((col, i) => {
        cells[i]?.(x + 6, y, col.w - 12, y + height / 2);
        x += col.w;
      });
      doc.y = y + height;
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.6).strokeColor(RULE).stroke();
    }

    const text =
      (value: string, options: { bold?: boolean; size?: number; color?: string; align?: "left" | "right" | "center"; sub?: string } = {}): Draw =>
      (x, _top, w, mid) => {
        const size = options.size ?? 12.5;
        const y = options.sub ? mid - size - 1 : mid - size / 2 - 2;
        const align = options.align ?? "left";
        drawMixedLine(doc, value, x, y, { font: options.bold ? "B" : "R", bold: !!options.bold, size, color: options.color ?? INK, width: w, align });
        if (options.sub) drawMixedLine(doc, options.sub, x, mid + 3, { font: "R", size: 9.5, color: SECOND, width: w, align });
      };
    const markCell =
      (m: Mark): Draw =>
      (x, _top, w, mid) =>
        mark(m, x, mid, w);

    function stats(entries: [string, number, IconKind, string][]) {
      ensure(70);
      const gap = 8;
      const w = (W - gap * (entries.length - 1)) / entries.length;
      const y = doc.y + 4;
      entries.forEach(([label, value, kind, color], i) => {
        const x = L + i * (w + gap);
        doc.roundedRect(x, y, w, 58, 8).fill(BAND);
        icon(kind, x + 20, y + 20, 8, color);
        doc.font("B").fontSize(22).fillColor(kind === "problem" && value > 0 ? RED : INK).text(String(value), x + 36, y + 7, { width: w - 44, lineBreak: false });
        doc.font("R").fontSize(10).fillColor(SECOND).text(label, x + 12, y + 38, { width: w - 20, lineBreak: false, ellipsis: true });
      });
      doc.y = y + 70;
    }

    let sectionsDrawn = 0;
    function section(title: string, note: string, kind?: IconKind) {
      if (sectionsDrawn++ > 0) {
        doc.addPage();
        doc.y = MARGIN;
      }
      const y = doc.y;
      if (kind) icon(kind, L + 11, y + 14, 11, ACCENT);
      drawMixedLine(doc, title, L + (kind ? 30 : 0), y, { font: "B", bold: true, size: 22, color: INK, width: W - 30 });
      doc.moveTo(L, y + 36).lineTo(L + W, y + 36).lineWidth(2.5).strokeColor(ACCENT).stroke();
      doc.y = y + 44;
      if (note) {
        doc.font("R").fontSize(11).fillColor(SECOND).text(note, L, doc.y, { width: W });
        doc.y += 4;
      }
      doc.y += 6;
    }

    function empty(message = "ምንም የለም።", kind: IconKind = "ok") {
      ensure(44);
      const y = doc.y + 4;
      doc.roundedRect(L, y, W, 34, 6).fill(BAND);
      icon(kind, L + 18, y + 17, 7);
      doc.font("R").fontSize(12.5).fillColor(SECOND).text(message, L + 34, y + 9, { width: W - 44, lineBreak: false });
      doc.y = y + 42;
    }

    function legend() {
      ensure(80);
      const y = doc.y;
      doc.roundedRect(L, y, W, 50, 8).lineWidth(0.8).strokeColor(RULE).stroke();
      doc.font("B").fontSize(10.5).fillColor(SECOND).text("ምልክቶች", L + 12, y + 8, { lineBreak: false });
      const items: Mark[] = [
        { icon: "ok", text: "ዝግጁ", color: GREEN },
        { icon: "partial", text: "በከፊል", color: AMBER },
        { icon: "missing", text: "የለም", color: RED },
        { icon: "unknown", text: "አልተዘገበም", color: GREY },
      ];
      const colW = (W - 24) / 4;
      items.forEach((m, i) => mark(m, L + 12 + i * colW, y + 32, colW));
      doc.y = y + 60;
    }

    // ---------- one person ----------
    const invoicesOf = (person: PersonReport) => person.orders.filter((order) => order.kind === "invoice");
    const listsOf = (person: PersonReport) => person.orders.filter((order) => order.kind === "backup_list");

    const orderCols: Col[] = [{ w: 26, align: "right" }, { w: 190 }, { w: 150 }, { w: W - 366, align: "right" }];
    /** An item the preparers reported short, under its order: name (ordered), then what they said is available. */
    function shortRow(item: PersonOrder["short"][number]) {
      const m = item.available > 0 ? PREPARERS.partial : PREPARERS.missing;
      row(
        orderCols,
        [
          () => {},
          (x, top, w, mid) => {
            // A small connector to the order above.
            doc.moveTo(x + 2, top - 6).lineTo(x + 2, mid - 4).lineTo(x + 9, mid - 4).lineWidth(1).strokeColor(GREY).stroke();
            text(item.description, { size: 11, sub: `ታዝዟል ${amount(item.ordered, item.unit)}` })(x + 14, top, w - 14, mid);
          },
          (x, _t, w, mid) => {
            icon(m.icon, x + 6, mid, 5);
            drawMixedLine(doc, amount(item.available, item.unit), x + 16, mid - 7, { font: "B", bold: true, size: 11, color: m.color, width: w - 16 });
          },
          text(`−${amount(item.short, item.unit)}`, { size: 11, color: m.color, align: "right" }),
        ],
        36,
        "#fafafa",
      );
    }

    function orderRow(order: { order_number: string; items: number; short?: PersonOrder["short"] }, index: number, sub: string, preparers: Mark) {
      row(
        orderCols,
        [
          text(String(index + 1), { color: SECOND, align: "right" }),
          text(order.order_number, { bold: true, sub }),
          markCell(preparers),
          text(`${order.items} እቃዎች`, { color: SECOND, align: "right" }),
        ],
        44,
      );
      for (const item of order.short ?? []) shortRow(item);
    }

    function personPage(person: PersonReport) {
      section(person.name, "", "person");
      stats([
        ["ደረሰኞች", invoicesOf(person).length, "invoice", INK],
        ["ትርፍ ዝርዝሮች", listsOf(person).length, "list", INK],
        ["የጎደሉ ሪፖርቶች", person.reports, "report", BLUE],
      ]);
      if (person.orders.length === 0) {
        empty("በዚህ ቀን ያዘጋጀው ደረሰኝ የለም።", "unknown");
        return;
      }
      header(orderCols, ["#", "ደረሰኝ", "ሁኔታ", "እቃዎች"]);
      person.orders.forEach((order, i) =>
        orderRow(order, i, `${time(order.at)} · ${order.kind === "backup_list" ? "ትርፍ · " : ""}${HOW[order.how]}`, PREPARERS[order.status]),
      );
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
    doc.y += 12;
    legend();

    if (personId) {
      if (single) {
        personPage(single);
      } else {
        empty("በዚህ ቀን ያዘጋጀው ደረሰኝ የለም።", "unknown");
      }
    } else {
      // ---------- summary ----------
      const unreported = report.unreported.filter((order) => order.kind === "invoice").length;
      const prepared = new Set(report.people.flatMap((person) => invoicesOf(person).map((order) => order.order_id))).size;
      const reports = report.people.reduce((sum, person) => sum + person.reports, 0);
      section("ማጠቃለያ", "", "person");
      stats([
        ["የተዘጋጁ ደረሰኞች", prepared, "ok", GREEN],
        ["የጎደሉ ሪፖርቶች", reports, "report", BLUE],
        ["ያልተዘገቡ ደረሰኞች", unreported, "unknown", GREY],
      ]);
      const summaryCols: Col[] = [{ w: W - 300 }, { w: 100, align: "right" }, { w: 100, align: "right" }, { w: 100, align: "right" }];
      if (report.people.length === 0) empty("በዚህ ቀን ማንም ያዘጋጀው ደረሰኝ የለም።", "unknown");
      else {
        header(summaryCols, ["ስም", "ደረሰኞች", "ትርፍ", "ሪፖርቶች"]);
        report.people.forEach((person) =>
          row(
            summaryCols,
            [
              (x, _t, w, mid) => {
                icon("person", x + 7, mid, 7, SECOND);
                drawMixedLine(doc, person.name, x + 20, mid - 9, { font: "B", bold: true, size: 12.5, color: INK, width: w - 20 });
              },
              text(String(invoicesOf(person).length), { align: "right" }),
              text(String(listsOf(person).length), { align: "right" }),
              text(String(person.reports), { align: "right" }),
            ],
            36,
          ),
        );
      }

      for (const person of report.people) personPage(person);

      section("ያልተዘገቡ ደረሰኞች", "በዚህ ቀን ተልከው ማንም ዝግጁ መሆናቸውን ያላረጋገጠላቸው።", "unknown");
      if (report.unreported.length === 0) empty("ሁሉም ደረሰኞች ተዘግበዋል።");
      else {
        header(orderCols, ["#", "ደረሰኝ", "ሁኔታ", "እቃዎች"]);
        report.unreported.forEach((order, i) => orderRow(order, i, `${time(order.posted_at)} · ${kindLabel(order)}`, PREPARERS.not_reported));
      }
    }

    // ---------- page numbers ----------
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc
        .font("B")
        .fontSize(10)
        .fillColor(SECOND)
        .text(`ገጽ ${i + 1} ከ ${range.count}`, L, doc.page.height - 36, { width: W, align: "center", lineBreak: false });
    }
  });
}
