import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, Mic, Paperclip, SendHorizontal, Trash2, X } from "lucide-react";
import Recorder from "opus-recorder";
import encoderPath from "opus-recorder/dist/encoderWorker.min.js?url";
import {
  MAX_WHATSAPP_UPLOAD_BYTES,
  sendWhatsAppChatMessage,
  sendWhatsAppMedia,
  type WhatsAppConversation,
} from "../lib/api";

/** Voice notes stop on their own at this length. */
const MAX_RECORDING_SECONDS = 5 * 60;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  phone: string;
  canReply: boolean;
  /** Shown above the input when replies aren't allowed. */
  closedNotice: string;
  /** Shown under the notice when replies aren't allowed (e.g. sending a template instead). */
  closedAction?: ReactNode;
  /** The message being replied to, quoted above the input; whatever is sent next quotes it. */
  replyTo?: { id: string; author: string; text: string } | null;
  onCancelReply?: () => void;
  onSent: (conversation: WhatsAppConversation) => void;
};

/**
 * The chat's reply box: text, an attachment (sent with the text as its
 * caption), or a voice note. Voice notes are recorded straight to Ogg/Opus
 * (opus-recorder) — the one audio format WhatsApp shows as a voice note,
 * and one browsers' own MediaRecorder mostly can't produce.
 */
export default function WhatsAppComposer({ phone, canReply, closedNotice, closedAction, replyTo, onCancelReply, onSent }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  // Whether the recording in progress should be sent (true) or thrown away when it stops.
  const sendRecordingRef = useRef(false);
  // A voice note is sent from the recorder's callback, so it reads the reply target from here.
  const replyToRef = useRef<string | undefined>(undefined);
  replyToRef.current = replyTo?.id;

  const isRecording = recordingSeconds !== null;

  // Picking "Reply" puts the cursor straight in the message box.
  useEffect(() => {
    if (replyTo?.id) inputRef.current?.focus();
  }, [replyTo?.id]);

  const filePreviewUrl = useMemo(() => (file?.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    },
    [filePreviewUrl],
  );

  // Tick the recording timer, and stop (and send) at the length limit.
  useEffect(() => {
    if (!isRecording) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed >= MAX_RECORDING_SECONDS) {
        finishRecording(true);
        return;
      }
      setRecordingSeconds(elapsed);
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  // Release the microphone if the chat closes mid-recording.
  useEffect(
    () => () => {
      sendRecordingRef.current = false;
      recorderRef.current?.close();
    },
    [],
  );

  function send(promise: Promise<WhatsAppConversation>, onSuccess?: () => void) {
    setIsSending(true);
    setError(null);
    promise
      .then((conversation) => {
        onSent(conversation);
        onSuccess?.();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to send"))
      .finally(() => setIsSending(false));
  }

  function handleSend() {
    if (isSending) return;
    const body = text.trim();
    if (file) {
      send(sendWhatsAppMedia(phone, file, { filename: file.name, ...(body && { caption: body }), replyTo: replyTo?.id }), () => {
        setFile(null);
        setText("");
      });
    } else if (body) {
      send(sendWhatsAppChatMessage(phone, body, replyTo?.id), () => setText(""));
    }
  }

  function handlePickFile(picked: File | undefined) {
    if (!picked) return;
    if (picked.size > MAX_WHATSAPP_UPLOAD_BYTES) {
      setError("Files are limited to 16 MB");
      return;
    }
    setError(null);
    setFile(picked);
  }

  async function startRecording() {
    setError(null);
    if (!Recorder.isRecordingSupported()) {
      setError("Voice recording isn't supported in this browser");
      return;
    }
    const recorder = new Recorder({
      encoderPath,
      encoderApplication: 2048, // tuned for voice
      encoderSampleRate: 48000,
      numberOfChannels: 1,
      streamPages: false,
    });
    sendRecordingRef.current = false;
    recorder.ondataavailable = (data: Uint8Array) => {
      if (!sendRecordingRef.current) return;
      const blob = new Blob([new Uint8Array(data)], { type: "audio/ogg" });
      send(sendWhatsAppMedia(phone, blob, { filename: `voice-${Date.now()}.ogg`, voice: true, replyTo: replyToRef.current }));
    };
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setRecordingSeconds(0);
    } catch {
      recorder.close();
      recorderRef.current = null;
      setError("Couldn't use the microphone — check the browser's permission");
    }
  }

  function finishRecording(shouldSend: boolean) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    sendRecordingRef.current = shouldSend;
    recorderRef.current = null;
    setRecordingSeconds(null);
    recorder.stop();
  }

  const hasContent = !!file || !!text.trim();

  return (
    <div className="wa-composer">
      {!canReply && <div className="wa-composer__notice">{closedNotice}</div>}
      {!canReply && closedAction}
      {error && <div className="form-error">{error}</div>}

      {replyTo && canReply && (
        <div className="wa-reply-bar">
          <div className="wa-quote wa-quote--composer">
            <span className="wa-quote__author">Replying to {replyTo.author}</span>
            <span className="wa-quote__text">{replyTo.text}</span>
          </div>
          <button type="button" className="wa-attachment__remove" onClick={onCancelReply} disabled={isSending} aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}

      {file && (
        <div className="wa-attachment">
          {filePreviewUrl ? (
            <img src={filePreviewUrl} alt="" className="wa-attachment__thumb" />
          ) : (
            <span className="wa-attachment__icon">
              <FileText size={18} />
            </span>
          )}
          <span className="wa-attachment__info">
            <span className="wa-attachment__name">{file.name}</span>
            <span className="wa-attachment__size">{formatSize(file.size)}</span>
          </span>
          <button
            type="button"
            className="wa-attachment__remove"
            onClick={() => setFile(null)}
            disabled={isSending}
            aria-label="Remove attachment"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isRecording ? (
        <div className="wa-composer__row wa-recording">
          <button
            type="button"
            className="wa-composer__icon-btn"
            onClick={() => finishRecording(false)}
            aria-label="Discard voice message"
            title="Discard"
          >
            <Trash2 size={18} />
          </button>
          <span className="wa-recording__indicator">
            <span className="wa-recording__dot" />
            {formatDuration(recordingSeconds ?? 0)}
          </span>
          <button
            type="button"
            className="wa-composer__send"
            onClick={() => finishRecording(true)}
            aria-label="Send voice message"
            title="Send"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      ) : (
        <div className="wa-composer__row">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => {
              handlePickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="wa-composer__icon-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canReply || isSending}
            aria-label="Attach a photo or file"
            title="Attach"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={inputRef}
            className="textarea wa-composer__input"
            rows={1}
            placeholder={!canReply ? "Replies unavailable" : file ? "Add a caption" : "Type a message"}
            value={text}
            disabled={!canReply || isSending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {hasContent || !canReply ? (
            <button
              type="button"
              className="wa-composer__send"
              onClick={handleSend}
              disabled={!canReply || isSending || !hasContent}
              aria-label="Send message"
              title="Send"
            >
              <SendHorizontal size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="wa-composer__send"
              onClick={startRecording}
              disabled={isSending}
              aria-label="Record a voice message"
              title="Record a voice message"
            >
              <Mic size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
