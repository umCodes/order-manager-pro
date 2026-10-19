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

/**
 * Opens the PDF to look at, in a new tab or window: on a phone app (home
 * screen) that's the browser's own viewer, with its Done/back button,
 * rather than a preview inside the app that nothing can be tapped in.
 */
export function openPdfUrl(url: string) {
  window.open(url, "_blank");
}

/** Fetches the PDF as a file, ready to hand to the share sheet. */
export async function fetchPdfFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
  if (!response.ok) throw new Error(`Failed to load the PDF (${response.status})`);
  const blob = await response.blob();
  return new File([blob], filename, { type: "application/pdf" });
}

/** Whether this phone or browser can share a file through its share sheet. */
export function canShareFile(file: File) {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * Opens the share sheet with the file (WhatsApp, Telegram, Files, …). Must
 * be called straight from a tap, with the file already fetched — browsers
 * refuse to share after a wait. Where sharing files isn't supported, the
 * file is saved instead. Resolves false if the share sheet was dismissed.
 */
export async function sharePdfFile(file: File): Promise<boolean> {
  if (!canShareFile(file)) {
    const blobUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = file.name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  }
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
}
