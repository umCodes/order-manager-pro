import { useState } from "react";
import { Check, ClipboardCheck, Copy, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "ready" | "copied";

/**
 * Icon button that requires two clicks: the first loads the text (showing a
 * "ready" state once done), the second copies it to the clipboard.
 */
export default function CopyButton({ getText }: { getText: () => string | Promise<string> }) {
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState<string | null>(null);

  function handleClick() {
    if (status === "loading") return;

    if (status === "ready" && text !== null) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setStatus("copied");
          setTimeout(() => {
            setStatus("idle");
            setText(null);
          }, 1500);
        })
        .catch(() => setStatus("ready"));
      return;
    }

    setStatus("loading");
    Promise.resolve(getText())
      .then((loadedText) => {
        setText(loadedText);
        setStatus("ready");
      })
      .catch(() => setStatus("idle"));
  }

  const label =
    status === "ready" ? "Copy list (loaded, click to copy)" : status === "copied" ? "Copied" : "Load list to copy";

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-label={label}
      title={label}
    >
      {status === "copied" && <Check size={14} />}
      {status === "loading" && <Loader2 size={14} className="refresh-button__icon--spinning" />}
      {status === "ready" && <ClipboardCheck size={14} />}
      {status === "idle" && <Copy size={14} />}
    </button>
  );
}
