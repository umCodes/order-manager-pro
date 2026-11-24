import { ELEVENLABS_API_KEY, ELEVENLABS_STT_MODEL } from "../../../constants/env.js"

const SPEECH_TO_TEXT_URL = "https://api.elevenlabs.io/v1/speech-to-text"

/** What ElevenLabs heard: the full text, the language it used, and each word / sound it picked out. */
export type SpeechToTextResult = {
    text: string
    /** ISO 639 code of the language ElevenLabs transcribed in. */
    language_code?: string
    /** How sure it was of that language (0–1). */
    language_probability?: number
    /** "word", "spacing" or "audio_event" (e.g. "(laughter)"). */
    words: { text: string; type: string }[]
}

export class TranscriptionNotConfiguredError extends Error {
    constructor() {
        super("Transcription isn't set up (ELEVENLABS_API_KEY is missing)")
    }
}

/**
 * Sends one audio file to ElevenLabs speech-to-text. `languageCode` (ISO
 * 639-1, e.g. "am") tells it which language to expect; without it, ElevenLabs
 * detects the language itself. Sounds such as laughter or music come back as
 * "audio_event" words, so they can be told apart from speech.
 */
export async function speechToText(audio: Buffer, mimeType: string, languageCode?: string): Promise<SpeechToTextResult> {
    if (!ELEVENLABS_API_KEY) throw new TranscriptionNotConfiguredError()

    const form = new FormData()
    form.append("model_id", ELEVENLABS_STT_MODEL)
    if (languageCode) form.append("language_code", languageCode)
    form.append("tag_audio_events", "true")
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType || "audio/ogg" }), "voice-note.ogg")

    const response = await fetch(SPEECH_TO_TEXT_URL, {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: form,
    })
    const body: any = await response.json().catch(() => ({}))
    if (!response.ok) {
        const detail = body?.detail
        const message = typeof detail === "string" ? detail : detail?.message ?? `HTTP ${response.status}`
        throw new Error(`ElevenLabs speech-to-text failed: ${message}`)
    }

    return {
        text: typeof body.text === "string" ? body.text : "",
        ...(typeof body.language_code === "string" && { language_code: body.language_code }),
        ...(typeof body.language_probability === "number" && { language_probability: body.language_probability }),
        words: Array.isArray(body.words)
            ? body.words.map((w: any) => ({ text: String(w?.text ?? ""), type: String(w?.type ?? "word") }))
            : [],
    }
}
