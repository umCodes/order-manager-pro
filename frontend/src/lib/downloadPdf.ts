/**
 * Downloads a PDF from the backend straight to the user's device as a file,
 * instead of opening it in a viewer or print dialog.
 *
 * The PDF is fetched as a blob and saved via a same-origin `blob:` URL on a
 * temporary `<a download>` link — the frontend and backend are typically on
 * different origins (different ngrok tunnels in dev, different Render
 * services in production), and browsers ignore the `download` attribute on
 * cross-origin links, so pointing the link at the API URL directly would
 * just navigate to the PDF instead of saving it.
 *
 * If the fetch fails (network issue, blocked request), this falls back to
 * navigating to the API URL with `?download=1`, which makes the backend
 * respond with `Content-Disposition: attachment` so the browser still saves
 * the file rather than displaying it.
 *
 * The file is saved under the name the backend gives it in
 * Content-Disposition (e.g. the customer's company name for invoices),
 * falling back to `filename`.
 */
export async function downloadPdfUrl(url: string, filename: string): Promise<void> {
  let blobUrl: string;
  let savedName: string;
  try {
    // Matches apiFetch's header (frontend/src/lib/api.ts) so this request
    // isn't intercepted by ngrok's browser-warning interstitial in dev.
    const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
    if (!response.ok) throw new Error(`Failed to load PDF (${response.status})`);
    savedName = filenameFromDisposition(response.headers.get("Content-Disposition")) ?? filename;
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);
  } catch {
    const fallbackUrl = new URL(url, window.location.href);
    fallbackUrl.searchParams.set("download", "1");
    window.location.assign(fallbackUrl.toString());
    return;
  }

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = savedName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers, so give
  // it a moment to start first.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/** The file name in a Content-Disposition header, preferring the UTF-8 `filename*` form. */
function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // Malformed encoding: fall through to the plain form.
    }
  }
  return /filename\s*=\s*"([^"]*)"/i.exec(header)?.[1] || undefined;
}
