type NamedCustomer = { company_name?: string; contact_name?: string } | undefined;

/** Strips characters that aren't allowed in file names on common systems. */
function cleanName(name: string | undefined) {
  return (name ?? "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/**
 * File name for an invoice PDF (downloaded, or sent over WhatsApp): the
 * customer's company name, else their contact name, else `fallback` (e.g.
 * the invoice number).
 */
export function customerPdfFilename(customer: NamedCustomer, fallback: string) {
  const name = cleanName(customer?.company_name) || cleanName(customer?.contact_name) || cleanName(fallback) || "document";
  return `${name}.pdf`;
}

/**
 * Content-Disposition header value for `filename`. Customer names are often
 * non-ASCII (e.g. Amharic), so the real name goes in `filename*` (RFC 6266)
 * with an ASCII-only `filename` for clients that don't read it.
 */
export function contentDisposition(disposition: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
