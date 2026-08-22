import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

/** Icon button that copies the given text to the clipboard, with a brief confirmation state. */
export default function CopyButton({ getText }: { getText: () => string | Promise<string> }) {
  const [status, setStatus] = useState<"idle" | "loading" | "copied">("idle");

  function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    Promise.resolve(getText())
      .then((text) => navigator.clipboard.writeText(text))
      .then(() => {
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 1500);
      })
      .catch(() => setStatus("idle"));
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-label="Copy list"
      title="Copy list"
    >
      {status === "copied" && <Check size={14} />}
      {status === "loading" && <Loader2 size={14} className="refresh-button__icon--spinning" />}
      {status === "idle" && <Copy size={14} />}
    </button>
  );
}
