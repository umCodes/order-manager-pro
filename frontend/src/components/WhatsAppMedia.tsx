import { useEffect, useState } from "react";
import { FileText, ImageOff } from "lucide-react";
import { fetchWhatsAppMedia, type WhatsAppMessage } from "../lib/api";

/**
 * Loads a message's media as a blob URL (through the backend, which fetches
 * it from WhatsApp) — fetched rather than used as a plain src so the request
 * carries the same headers as every other API call.
 */
function useMediaUrl(phone: string, messageId: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchWhatsAppMedia(phone, messageId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [phone, messageId]);

  return { url, failed };
}

/** The image / voice note / video / file inside a chat bubble. */
export default function WhatsAppMedia({ phone, message }: { phone: string; message: WhatsAppMessage }) {
  const { url, failed } = useMediaUrl(phone, message.id);
  const filename = message.media?.filename ?? (message.type === "document" ? "Document" : message.type);

  if (failed) {
    return (
      <div className="wa-media__unavailable">
        <ImageOff size={14} /> {message.media?.voice ? "Voice message" : filename} unavailable
      </div>
    );
  }

  if (message.type === "image" || message.type === "sticker") {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="wa-media__image-link">
        <img src={url} alt={message.text || "Image"} className="wa-media__image" />
      </a>
    ) : (
      <div className="wa-media__placeholder wa-media__placeholder--image" />
    );
  }

  if (message.type === "audio") {
    return url ? (
      <audio controls src={url} className="wa-media__audio" preload="metadata" />
    ) : (
      <div className="wa-media__placeholder wa-media__placeholder--audio" />
    );
  }

  if (message.type === "video") {
    return url ? (
      <video controls src={url} className="wa-media__video" preload="metadata" />
    ) : (
      <div className="wa-media__placeholder wa-media__placeholder--image" />
    );
  }

  return (
    <a
      className={`wa-media__file${url ? "" : " wa-media__file--loading"}`}
      href={url ?? undefined}
      download={filename}
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      <FileText size={20} />
      <span className="wa-media__file-name">{filename}</span>
    </a>
  );
}
