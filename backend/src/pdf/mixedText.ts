import { FONT_ARABIC_MERGED_BOLD, FONT_ARABIC_MERGED_REGULAR } from "./assets.js";

/**
 * Draws one line of text that may contain Arabic (e.g. a customer's Arabic
 * name) in a document otherwise set in the Ethiopic font. PDFKit shapes an
 * Arabic word correctly (letters joined) but doesn't order words right to
 * left, and drops spaces between Arabic words — so text with Arabic is
 * drawn word by word: Arabic words in the Arabic font, the rest in the
 * document's font, laid out with a simple bidi: an Arabic-first line reads
 * right to left (Latin words and numbers inside it keep their own order),
 * and Arabic phrases inside a Latin/Amharic line are reversed in place.
 * Text without Arabic is drawn with a single doc.text call, unchanged.
 */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LTR_LETTER = /[A-Za-zÀ-ɏሀ-᎟ⶀ-⷟]/;

type Dir = "R" | "L" | "N";
type Token = { text: string; space: boolean; dir: Dir };

export type MixedTextOptions = {
  /** The document's own font for non-Arabic text ("R"/"B" in the report). */
  font: string;
  bold?: boolean;
  size: number;
  color: string;
  width: number;
  align?: "left" | "right" | "center" | undefined;
};

export function hasArabic(text: string) {
  return ARABIC.test(text);
}

/** Registers the Arabic fonts on `doc` under the names drawMixedLine uses. */
export function registerArabicFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Arabic-R", FONT_ARABIC_MERGED_REGULAR);
  doc.registerFont("Arabic-B", FONT_ARABIC_MERGED_BOLD);
}

function tokenize(text: string): Token[] {
  return text
    .split(/(\s+)/)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^\s+$/.test(part)) return { text: " ", space: true, dir: "N" as Dir };
      const dir: Dir = ARABIC.test(part) ? "R" : LTR_LETTER.test(part) ? "L" : "N";
      return { text: part, space: false, dir };
    });
}

/**
 * Visual (left-to-right drawing) order of the tokens. Neutral words
 * (numbers, punctuation) take the line's direction; spaces stay between
 * the words around them.
 */
function visualOrder(tokens: Token[]): Token[] {
  const firstStrong = tokens.find((t) => t.dir !== "N")?.dir ?? "L";
  const base: Dir = firstStrong === "R" ? "R" : "L";
  const resolved = tokens.map((t) => (t.space || t.dir !== "N" ? t : { ...t, dir: base }));

  // Group into runs of the same direction; a space joins the run when the words on both sides share it.
  const runs: { dir: Dir; tokens: Token[] }[] = [];
  resolved.forEach((token, i) => {
    let dir = token.dir;
    if (token.space) {
      const before = resolved.slice(0, i).reverse().find((t) => !t.space)?.dir;
      const after = resolved.slice(i + 1).find((t) => !t.space)?.dir;
      dir = before && before === after ? before : base;
    }
    const last = runs[runs.length - 1];
    if (last && last.dir === dir) last.tokens.push(token);
    else runs.push({ dir, tokens: [token] });
  });

  const ordered = base === "R" ? [...runs].reverse() : runs;
  return ordered.flatMap((run) => (run.dir === "R" ? [...run.tokens].reverse() : run.tokens));
}

function fontOf(token: Token, options: MixedTextOptions) {
  if (token.dir === "R" && !token.space) return options.bold ? "Arabic-B" : "Arabic-R";
  return options.font;
}

function widthOf(doc: PDFKit.PDFDocument, tokens: Token[], options: MixedTextOptions) {
  return tokens.reduce((sum, token) => {
    doc.font(fontOf(token, options)).fontSize(options.size);
    return sum + doc.widthOfString(token.text);
  }, 0);
}

/**
 * Draws `text` on one line within `width` at (x, y), aligned as asked and
 * cut with "…" if it doesn't fit (dropping words from the end of the text).
 */
export function drawMixedLine(doc: PDFKit.PDFDocument, text: string, x: number, y: number, options: MixedTextOptions) {
  if (!hasArabic(text)) {
    doc.font(options.font).fontSize(options.size).fillColor(options.color);
    doc.text(text, x, y, { width: options.width, align: options.align ?? "left", lineBreak: false, ellipsis: true });
    return;
  }

  let tokens = tokenize(text.trim());
  if (widthOf(doc, tokens, options) > options.width) {
    const ellipsis: Token = { text: "…", space: false, dir: "N" };
    while (tokens.length > 1 && widthOf(doc, [...tokens, ellipsis], options) > options.width) tokens = tokens.slice(0, -1);
    while (tokens.length && tokens[tokens.length - 1]!.space) tokens = tokens.slice(0, -1);
    tokens = [...tokens, ellipsis];
  }

  const visual = visualOrder(tokens);
  const total = widthOf(doc, visual, options);
  const offset = options.align === "right" ? options.width - total : options.align === "center" ? (options.width - total) / 2 : 0;
  let cursor = x + Math.max(0, offset);
  // The Arabic font's ascent differs from the document font's, so every word
  // is drawn on the baseline the document font would use at `y`, keeping
  // Arabic and Latin/Amharic words on one line.
  doc.font(options.font).fontSize(options.size);
  const baselineY = y + ((doc as any)._font.ascender / 1000) * options.size;
  doc.fillColor(options.color);
  for (const token of visual) {
    doc.font(fontOf(token, options)).fontSize(options.size);
    if (!token.space) doc.text(token.text, cursor, baselineY, { lineBreak: false, baseline: "alphabetic" });
    cursor += doc.widthOfString(token.text);
  }
}
