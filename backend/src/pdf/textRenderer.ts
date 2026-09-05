import { FONT_ARABIC_BOLD, FONT_ARABIC_REGULAR, FONT_BOLD, FONT_REGULAR } from "./assets.js";

const ETHIOPIC_RANGE = /[ሀ-፿]/;
const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/;

type Script = "ethiopic" | "arabic" | "latin";

/** The drawing helpers a template gets back from createTextRenderer. */
export type TextRenderer = ReturnType<typeof createTextRenderer>;

/**
 * Registers the mixed-script fonts on `doc` and returns a set of drawing
 * helpers that split any string into Ethiopic/Arabic/Latin runs and draw
 * each with a font that actually has glyphs for it (Noto Sans
 * Ethiopic/Arabic have no Latin/digit glyphs, and Helvetica has no
 * Ethiopic/Arabic glyphs). Shared by every template so this glyph-fallback
 * logic exists in exactly one place.
 */
export function createTextRenderer(doc: PDFKit.PDFDocument, currency: string) {
    const baseFontSize = 11;
    const currencyFontSize = 7;
    const suffixFontSize = 9;

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold", FONT_BOLD);
    doc.registerFont("Arabic", FONT_ARABIC_REGULAR);
    doc.registerFont("Arabic-Bold", FONT_ARABIC_BOLD);
    doc.registerFont("Latin", "Helvetica");
    doc.registerFont("Latin-Bold", "Helvetica-Bold");

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

    // Truncates text with a trailing "…" so its rendered width fits within
    // maxWidth — used to keep long item names from overflowing into the
    // next column instead of wrapping (this text engine doesn't wrap).
    const truncateToWidth = (text: string, bold: boolean, fontSize: number, maxWidth: number) => {
      if (mixedTextWidth(text, bold, fontSize) <= maxWidth) return text;
      const ellipsis = "…";
      const ellipsisWidth = mixedTextWidth(ellipsis, bold, fontSize);
      let result = "";
      for (const char of text) {
        const candidate = result + char;
        if (mixedTextWidth(candidate, bold, fontSize) + ellipsisWidth > maxWidth) break;
        result = candidate;
      }
      return result + ellipsis;
    };

    // Draws mixed-script text left-to-right at (x, y), switching fonts per
    // run. Does not support line wrapping; pass maxWidth to truncate
    // (with an ellipsis) instead of overflowing into whatever's next.
    const drawMixedText = (
      text: string,
      x: number,
      y: number,
      options: { bold?: boolean | undefined; fontSize?: number; color?: string | undefined; maxWidth?: number } = {}
    ) => {
      const { bold = false, fontSize = baseFontSize, color, maxWidth } = options;
      const renderText = maxWidth !== undefined ? truncateToWidth(text, bold, fontSize, maxWidth) : text;
      if (color) doc.fillColor(color);
      let cursorX = x;
      for (const run of splitRuns(renderText)) {
        doc.font(fontFor(run.script, bold)).fontSize(fontSize);
        doc.text(run.text, cursorX, y, { lineBreak: false });
        cursorX += doc.widthOfString(run.text);
      }
      if (color) doc.fillColor("black");
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
    // suffix small+bold, so it matches the weight column's styling. Pass
    // `right` instead of `x` to right-align the whole "<quantity> <unit>" run.
    const measureQtyUnitWidth = (quantity: number, unit: string) =>
      mixedTextWidth(`${quantity}`, false, baseFontSize) + 3 + mixedTextWidth(unit, true, suffixFontSize);

    const drawQtyUnit = (quantity: number, unit: string, x: number, y: number, options?: { right?: number }) => {
      const numberText = `${quantity}`;
      const startX = options?.right !== undefined ? options.right - measureQtyUnitWidth(quantity, unit) : x;
      drawMixedText(numberText, startX, y);
      const numberWidth = mixedTextWidth(numberText, false, baseFontSize);
      const suffixY = y + (baseFontSize - suffixFontSize) / 2;
      drawMixedText(unit, startX + numberWidth + 3, suffixY, { bold: true, fontSize: suffixFontSize });
    };

    const measureMoneyWidth = (value: number) => {
      const amountText = `(${value.toFixed(2)})`;
      const currencyWidth = mixedTextWidth(currency, true, currencyFontSize);
      const amountWidth = mixedTextWidth(amountText, false, baseFontSize);
      return currencyWidth + 2 + amountWidth;
    };

    const drawMoney = (value: number, x: number, y: number, options?: { right?: number; color?: string | undefined }) => {
      const amountText = `${value.toFixed(1)}`;
      const currencyWidth = mixedTextWidth(currency, true, currencyFontSize);

      const startX = options?.right !== undefined
        ? options.right - measureMoneyWidth(value)
        : x;

      drawMixedText(currency, startX, y, { bold: true, fontSize: currencyFontSize, color: options?.color });
      drawMixedText(amountText, startX + currencyWidth + 2, y - (baseFontSize - currencyFontSize) / 2, {
        fontSize: baseFontSize,
        color: options?.color,
      });
    };

    return {
      baseFontSize,
      currencyFontSize,
      suffixFontSize,
      mixedTextWidth,
      drawMixedText,
      drawQuantityCalc,
      drawQtyUnit,
      drawMoney,
    };
}
