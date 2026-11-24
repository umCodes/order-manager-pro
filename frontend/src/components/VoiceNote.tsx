import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Copy, Loader2, Pause, Play, RotateCw } from "lucide-react";
import { transcribeWhatsAppVoiceNote, type VoiceNoteTranscript, type WhatsAppMessage } from "../lib/api";

const BAR_COUNT = 34;
const SPEEDS = [1, 1.5, 2] as const;
/** Fired when a voice note starts, so any other one playing stops — one at a time, like WhatsApp. */
const PLAY_EVENT = "wa-voice-note-play";

const LANGUAGE_NAMES: Record<string, string> = {
  am: "Amharic", amh: "Amharic",
  ar: "Arabic", ara: "Arabic",
  en: "English", eng: "English",
  om: "Oromo", orm: "Oromo",
  ti: "Tigrinya", tir: "Tigrinya",
  so: "Somali", som: "Somali",
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Stand-in bar heights (0.25–1) until the real waveform is read: steady per message, so it doesn't jump around. */
function placeholderBars(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    hash = Math.imul(hash ^ (i + 1), 16777619);
    return 0.25 + (((hash >>> 0) % 1000) / 1000) * 0.75;
  });
}

/** The recording's loudness in BAR_COUNT slices (0.12–1), and its duration — or undefined if the browser can't decode it. */
async function readWaveform(blob: Blob): Promise<{ bars: number[]; duration: number } | undefined> {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return undefined;
  const context = new AudioContextClass();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / BAR_COUNT));
    const levels = Array.from({ length: BAR_COUNT }, (_, bar) => {
      let sum = 0;
      for (let i = bar * size; i < Math.min(samples.length, (bar + 1) * size); i++) sum += samples[i] * samples[i];
      return Math.sqrt(sum / size);
    });
    const peak = Math.max(...levels, 0.0001);
    return { bars: levels.map((level) => 0.12 + (level / peak) * 0.88), duration: audio.duration };
  } catch {
    return undefined;
  } finally {
    context.close().catch(() => {});
  }
}

/**
 * A voice note in a chat bubble: play / pause, a waveform that fills as it
 * plays (tap or drag it to jump), elapsed / total time and playback speed.
 * Under it, the transcript — or a Transcribe button, which asks ElevenLabs
 * once and keeps the result for everyone.
 */
export default function VoiceNote({ phone, message, url, blob }: { phone: string; message: WhatsAppMessage; url: string | null; blob: Blob | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const fallbackBars = useMemo(() => placeholderBars(message.id), [message.id]);
  const [bars, setBars] = useState(fallbackBars);

  // The one just asked for here, else the saved one the conversation came with (e.g. someone else asked).
  const [requested, setRequested] = useState<VoiceNoteTranscript | undefined>();
  const transcript = requested ?? message.transcript;
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copyTranscript = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    readWaveform(blob).then((result) => {
      if (cancelled || !result) return;
      setBars(result.bars);
      // Some browsers report Ogg recordings' length as Infinity; the decoded length is right.
      if (Number.isFinite(result.duration)) setDuration((d) => (Number.isFinite(d) && d > 0 ? d : result.duration));
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    const stopIfOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== message.id) audioRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, stopIfOther);
    return () => window.removeEventListener(PLAY_EVENT, stopIfOther);
  }, [message.id]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: message.id }));
      audio.playbackRate = speed;
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekTo = (clientX: number) => {
    const audio = audioRef.current;
    const wave = waveRef.current;
    if (!audio || !wave || !(duration > 0)) return;
    const rect = wave.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = fraction * duration;
    setCurrent(audio.currentTime);
  };

  const transcribe = async () => {
    setTranscribing(true);
    setTranscribeError(null);
    try {
      setRequested(await transcribeWhatsAppVoiceNote(phone, message.id));
    } catch (error) {
      setTranscribeError(error instanceof Error ? error.message : "Couldn't transcribe");
    } finally {
      setTranscribing(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const languageName = transcript?.language ? LANGUAGE_NAMES[transcript.language.toLowerCase()] ?? transcript.language.toUpperCase() : undefined;

  return (
    <div className="wa-voice">
      <div className="wa-voice__player">
        {url && (
          <audio
            ref={audioRef}
            src={url}
            preload="metadata"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            onDurationChange={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={(e) => {
              setPlaying(false);
              e.currentTarget.currentTime = 0;
              setCurrent(0);
            }}
          />
        )}
        <button
          type="button"
          className="wa-voice__play"
          onClick={togglePlay}
          disabled={!url}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
        >
          {!url ? <Loader2 size={18} className="wa-voice__spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="wa-voice__play-icon" />}
        </button>

        <div className="wa-voice__body">
          <div
            ref={waveRef}
            className="wa-voice__wave"
            role="slider"
            aria-label="Voice message position"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
            }}
            onKeyDown={(e) => {
              const audio = audioRef.current;
              if (!audio || !(duration > 0)) return;
              if (e.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 2);
              if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 2);
            }}
          >
            {bars.map((height, i) => (
              <span
                key={i}
                className={`wa-voice__bar${(i + 0.5) / bars.length <= progress ? " wa-voice__bar--played" : ""}`}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            ))}
          </div>
          <div className="wa-voice__times">
            <span>{formatTime(playing || current > 0 ? current : duration)}</span>
            <button type="button" className="wa-voice__speed" onClick={cycleSpeed} aria-label="Playback speed">
              {speed}×
            </button>
          </div>
        </div>
      </div>

      {transcript ? (
        <div className={`wa-voice__transcript${transcript.status === "no_speech" ? " wa-voice__transcript--empty" : ""}`}>
          <div className="wa-voice__transcript-label">
            <AudioLines size={12} />
            {transcript.status === "no_speech" ? "No clear speech" : "Transcript"}
            {languageName && transcript.status === "ok" && <span className="wa-voice__lang">{languageName}</span>}
            {transcript.status === "ok" && transcript.text && (
              <button
                type="button"
                className={`wa-voice__copy${copied ? " wa-voice__copy--done" : ""}`}
                onClick={() => copyTranscript(transcript.text)}
                aria-label={copied ? "Transcript copied" : "Copy transcript"}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          {transcript.status === "ok" && (
            <p className="wa-voice__transcript-text" dir="auto">
              {transcript.text}
            </p>
          )}
        </div>
      ) : (
        <div className="wa-voice__actions">
          <button type="button" className="wa-voice__transcribe" onClick={transcribe} disabled={transcribing}>
            {transcribing ? <Loader2 size={13} className="wa-voice__spin" /> : transcribeError ? <RotateCw size={13} /> : <AudioLines size={13} />}
            {transcribing ? "Transcribing…" : transcribeError ? "Try again" : "Transcribe"}
          </button>
          {transcribeError && <span className="wa-voice__error">{transcribeError}</span>}
        </div>
      )}
    </div>
  );
}
