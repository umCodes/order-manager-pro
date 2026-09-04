/**
 * Loads a PDF into a hidden iframe and triggers the browser's native print
 * dialog once it's loaded, instead of just opening it in a new tab and
 * relying on the user to find the print button themselves.
 *
 * The PDF is fetched as a blob and loaded via a same-origin `blob:` URL
 * rather than the API's own URL directly — the frontend and backend are
 * typically on different origins (different ngrok tunnels in dev, different
 * Render services in production), and `iframe.contentWindow.print()` throws
 * a cross-origin security error on a cross-origin iframe, which would
 * otherwise silently fall back to just opening a new tab every time.
 *
 * This only works where the browser's built-in PDF viewer honors
 * `contentWindow.print()` (desktop Chrome/Firefox/Edge/Safari) — some mobile
 * browsers and in-app webviews block programmatic printing of PDFs
 * entirely, in which case this falls back to opening the PDF in a new tab
 * so it's still viewable.
 */
export async function printPdfUrl(url: string): Promise<void> {
  let blobUrl: string;
  try {
    // Matches apiFetch's header (frontend/src/lib/api.ts) so this request
    // isn't intercepted by ngrok's browser-warning interstitial in dev.
    const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
    if (!response.ok) throw new Error(`Failed to load PDF (${response.status})`);
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = blobUrl;

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    URL.revokeObjectURL(blobUrl);
  };

  let printed = false;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      printed = true;
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      // Give the print dialog time to open before removing the iframe —
      // removing it immediately can cancel the print job in some browsers.
      setTimeout(cleanup, 1000);
    }
  };

  // If the iframe never loads (blocked, unsupported, network issue), fall
  // back to a plain new-tab open after a timeout rather than doing nothing.
  setTimeout(() => {
    if (!printed) {
      window.open(url, "_blank", "noopener,noreferrer");
      cleanup();
    }
  }, 5000);

  document.body.appendChild(iframe);
}
