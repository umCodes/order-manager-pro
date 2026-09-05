import PDFDocument from "pdfkit";
import fs from "fs";

/** Draws the whole document onto a fresh PDFKit document. */
type RenderFn = (doc: PDFKit.PDFDocument) => void;

/** Writes a rendered PDF to disk, resolving once the file is fully flushed. */
export function renderToFile(
  filePath: string,
  options: PDFKit.PDFDocumentOptions,
  render: RenderFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(options);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    render(doc);

    doc.end();

    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

/** Renders a PDF straight to memory — used for anything that gets sent rather than stored. */
export function renderToBuffer(
  options: PDFKit.PDFDocumentOptions,
  render: RenderFn,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(options);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    render(doc);

    doc.end();
  });
}
