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
 */
export async function downloadPdfUrl(url: string, filename: string): Promise<void> {
  let blobUrl: string;
  try {
    // Matches apiFetch's header (frontend/src/lib/api.ts) so this request
    // isn't intercepted by ngrok's browser-warning interstitial in dev.
    const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
    if (!response.ok) throw new Error(`Failed to load PDF (${response.status})`);
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
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers, so give
  // it a moment to start first.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
