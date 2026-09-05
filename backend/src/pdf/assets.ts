import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Paths to the font and image files the templates draw with. Resolved
 * relative to this file, so they work the same from `src/` under tsx and
 * from `dist/` after a build (the build copies `src/assets` across).
 */
export const FONT_REGULAR = path.join(__dirname, "../assets/fonts/NotoSansEthiopic-Regular.ttf");
export const FONT_BOLD = path.join(__dirname, "../assets/fonts/NotoSansEthiopic-Bold.ttf");
export const FONT_ARABIC_REGULAR = path.join(__dirname, "../assets/fonts/NotoSansArabic-Regular.ttf");
export const FONT_ARABIC_BOLD = path.join(__dirname, "../assets/fonts/NotoSansArabic-Bold.ttf");
export const DEFAULT_LOGO = path.join(__dirname, "../assets/images/logo.png");
