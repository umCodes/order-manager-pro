import { FONT_MENBERE_BOLD, FONT_MENBERE_REGULAR } from "./assets.js";
import { drawMixedLine } from "./mixedText.js";
import { businessTimeParts } from "../utils/businessDate.js";
import type { DriverDayAction, DriverDayStop } from "../services/dailyReport/report.js";

/**
 * The driver's day: the pages that open the daily report. Phone-sized and
 * dark, set in Menbere. Each stop at a customer is a dot with the time and
 * the customer's name, and under it, indented, everything done there in
 * order with its own time: an invoice (number, then its amount and how many
 * items), a return (the same) or a payment (its amount). Colour tells them
 * apart; there are no boxes or lines. Runs on over as many pages as needed.
 * Arabic names are drawn with the Arabic fonts (see mixedText.ts), which
 * must already be registered on the document.
 */

/** The page size of the driver's day (points): about a phone screen. */
export const DRIVER_DAY_PAGE: [number, number] = [380, 694];

const BG = "#121417";
const INK = "#f3f4f6";
const MUTE = "#7d8590";
const SOFT = "#c9ced6";
const RULE = "#2a2f36";
const COLOR: Record<DriverDayAction["kind"], string> = { invoice: "#7aa8ff", return: "#f4b65a", payment: "#4fd685" };
const LABEL: Record<DriverDayAction["kind"], string> = { invoice: "ደረሰኝ", return: "ተመላሽ", payment: "ክፍያ" };

const M = 24;
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (value: number) => String(Math.round(value * 1000) / 1000);
const time = (iso: string) => businessTimeParts(new Date(iso)).time;

/**
 * Draws the driver's day starting on the current page, which must be a
 * fresh DRIVER_DAY_PAGE page; adds more such pages as it runs on. Page
 * numbers are left to the caller.
 */
export function drawDriverDay(doc: PDFKit.PDFDocument, stops: DriverDayStop[], heading: { weekday: string; date: string }) {
  doc.registerFont("MR", FONT_MENBERE_REGULAR);
  doc.registerFont("MB", FONT_MENBERE_BOLD);
  const [PW, PH] = DRIVER_DAY_PAGE;
  const W = PW - M * 2;
  const BOTTOM = PH - 46;
  const TX = M + 14;
  const NX = M + 80;
  const IX = NX + 10;

  const paint = () => doc.rect(0, 0, PW, PH).fill(BG);
  paint();
  let y = M + 4;
  const ensure = (height: number) => {
    if (y + height <= BOTTOM) return;
    doc.addPage({ size: DRIVER_DAY_PAGE, margin: 0 });
    paint();
    y = M + 4;
  };
  /** An amount with a small "SAR" after it; returns the width drawn. */
  const amount = (text: string, x: number, top: number, size: number, color: string) => {
    doc.font("MB").fontSize(size).fillColor(color).text(text, x, top, { lineBreak: false });
    const width = doc.widthOfString(text);
    doc.font("MR").fontSize(size - 3).fillColor(MUTE).text("SAR", x + width + 4, top + 3, { lineBreak: false });
    return width + 4 + doc.widthOfString("SAR");
  };

  // ---------- heading ----------
  doc.font("MB").fontSize(24).fillColor(INK).text("የሹፌሩ ቀን", M, y, { lineBreak: false });
  doc.font("MB").fontSize(12.5).fillColor(INK).text(heading.weekday, M, y + 3, { width: W, align: "right", lineBreak: false });
  doc.font("MR").fontSize(10.5).fillColor(MUTE).text(heading.date, M, y + 19, { width: W, align: "right", lineBreak: false });
  y += 44;

  const actions = stops.flatMap((stop) => stop.actions);
  const total = (kind: DriverDayAction["kind"]) => actions.filter((action) => action.kind === kind).reduce((sum, action) => sum + action.amount, 0);
  const customers = new Set(stops.map((stop) => stop.customer.toLowerCase())).size;
  // Customers is a short number; the three amounts share the rest.
  const first = 52;
  const col = (W - first) / 3;
  const stat = (label: string, x: number, draw: (top: number) => void) => {
    doc.font("MR").fontSize(10).fillColor(MUTE).text(label, x, y, { lineBreak: false });
    draw(y + 14);
  };
  stat("ደንበኞች", M, (top) => doc.font("MB").fontSize(12).fillColor(INK).text(String(customers), M, top, { lineBreak: false }));
  stat("ደረሰኝ", M + first, (top) => amount(money(total("invoice")), M + first, top, 11.5, COLOR.invoice));
  stat("ክፍያ", M + first + col, (top) => amount(money(total("payment")), M + first + col, top, 11.5, COLOR.payment));
  stat("ተመላሽ", M + first + col * 2, (top) => amount(money(total("return")), M + first + col * 2, top, 11.5, COLOR.return));
  y += 38;
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(RULE).stroke();
  y += 20;

  // ---------- stops ----------
  const actionHeight = (action: DriverDayAction) => (action.kind === "payment" ? 22 : 40);
  for (const stop of stops) {
    ensure(26 + (stop.actions[0] ? actionHeight(stop.actions[0]) : 0));
    doc.circle(M + 4, y + 8, 4).fill(INK);
    doc.font("MB").fontSize(12).fillColor(INK).text(time(stop.at), TX, y + 1, { width: NX - TX - 6, lineBreak: false });
    drawMixedLine(doc, stop.customer, NX, y - 1, { font: "MB", bold: true, size: 14.5, color: INK, width: W - (NX - M) });
    y += 26;
    for (const action of stop.actions) {
      ensure(actionHeight(action));
      doc.font("MR").fontSize(10).fillColor(MUTE).text(time(action.at), TX, y + 2, { lineBreak: false });
      doc.font("MB").fontSize(12).fillColor(COLOR[action.kind]).text(LABEL[action.kind], IX, y, { lineBreak: false });
      const labelWidth = doc.widthOfString(LABEL[action.kind]);
      if (action.kind === "payment") {
        amount(money(action.amount), IX + labelWidth + 10, y, 12, INK);
      } else {
        doc.font("MR").fontSize(10.5).fillColor(MUTE).text(action.number, IX + labelWidth + 10, y + 1.5, { lineBreak: false });
        y += 18;
        const width = amount(`${action.kind === "return" ? "−" : ""}${money(action.amount)}`, IX + 12, y, 11.5, INK);
        doc.font("MR").fontSize(10.5).fillColor(SOFT).text(`·   ${count(action.items ?? 0)} እቃዎች`, IX + 12 + width + 8, y + 1, { lineBreak: false });
      }
      y += 22;
    }
    y += 12;
  }
}
