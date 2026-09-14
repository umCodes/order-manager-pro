/**
 * Saves or shares a file from the browser. iOS Safari — including when this
 * app is installed as a standalone PWA — does not reliably trigger a save
 * from a plain `<a download>` link; the only consistently working option
 * there is the Web Share API's file support (iOS 15+), which pops the
 * native share sheet with a "Save to Files" option (and a Quick Look
 * preview before saving). Everywhere else (desktop browsers, Android
 * Chrome), a plain blob download link works fine and is used instead.
 */
export async function shareOrDownloadFile(blob: Blob, filename: string, mimeType: string): Promise<void> {
  const file = new File([blob], filename, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // AbortError = the user dismissed the share sheet — that's a completed
      // interaction, not a failure, so don't fall through to a second prompt.
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
