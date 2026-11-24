import { redisClient } from "../../../config/redis.js"
import { ELEVENLABS_STT_MODEL, ELEVENLABS_USE_CUSTOMER_LANGUAGE } from "../../../constants/env.js"

/**
 * Voice note transcripts, one per WhatsApp message id, kept as long as the
 * chat history itself (7 days): `ai:transcript:<message id>` → JSON.
 */
const TTL_SECONDS = 7 * 24 * 60 * 60

export type Transcript = {
    /** "ok": speech was found. "no_speech": nothing understandable (silence, noise, only sounds). */
    status: "ok" | "no_speech"
    text: string
    /** Language ElevenLabs transcribed in (ISO 639). */
    language?: string
    /** The language it was told to expect (from the customer), if any — otherwise it detected one. */
    requested_language?: string
    /** The ElevenLabs model that made it. */
    model?: string
    /** "detect": ElevenLabs worked out the language. "customer": it was told the customer's. */
    language_mode?: LanguageMode
    transcribed_at: number
}

export type LanguageMode = "detect" | "customer"

/** How transcripts are made right now. */
export const CURRENT_LANGUAGE_MODE: LanguageMode = ELEVENLABS_USE_CUSTOMER_LANGUAGE ? "customer" : "detect"

/** Made the way transcripts are made now — one made with another model or language setting can be redone. */
function isCurrent(transcript: Transcript) {
    return transcript.model === ELEVENLABS_STT_MODEL && transcript.language_mode === CURRENT_LANGUAGE_MODE
}

const keyFor = (messageId: string) => `ai:transcript:${messageId}`

export async function getTranscript(messageId: string): Promise<Transcript | undefined> {
    return (await getTranscripts([messageId]))[messageId]
}

/** The saved transcripts among these message ids, made with the current settings (ids without one are left out). */
export async function getTranscripts(messageIds: string[]): Promise<Record<string, Transcript>> {
    if (messageIds.length === 0) return {}
    const values = await redisClient.mGet(messageIds.map(keyFor))
    const found: Record<string, Transcript> = {}
    values.forEach((raw, index) => {
        const id = messageIds[index]
        if (!raw || !id) return
        try {
            const transcript: Transcript = JSON.parse(raw)
            if (isCurrent(transcript)) found[id] = transcript
        } catch {
            // A malformed entry is treated as not transcribed yet.
        }
    })
    return found
}

export async function saveTranscript(messageId: string, transcript: Transcript) {
    await redisClient.set(keyFor(messageId), JSON.stringify(transcript), { EX: TTL_SECONDS })
}
