import { redisClient } from "../../../config/redis.js"
import { ELEVENLABS_STT_MODEL } from "../../../constants/env.js"

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
    /** The ElevenLabs model that made it. One made by another model counts as not transcribed, so it can be redone. */
    model?: string
    transcribed_at: number
}

const keyFor = (messageId: string) => `ai:transcript:${messageId}`

export async function getTranscript(messageId: string): Promise<Transcript | undefined> {
    return (await getTranscripts([messageId]))[messageId]
}

/** The saved transcripts among these message ids, made by the current model (ids without one are left out). */
export async function getTranscripts(messageIds: string[]): Promise<Record<string, Transcript>> {
    if (messageIds.length === 0) return {}
    const values = await redisClient.mGet(messageIds.map(keyFor))
    const found: Record<string, Transcript> = {}
    values.forEach((raw, index) => {
        const id = messageIds[index]
        if (!raw || !id) return
        try {
            const transcript: Transcript = JSON.parse(raw)
            if (transcript.model === ELEVENLABS_STT_MODEL) found[id] = transcript
        } catch {
            // A malformed entry is treated as not transcribed yet.
        }
    })
    return found
}

export async function saveTranscript(messageId: string, transcript: Transcript) {
    await redisClient.set(keyFor(messageId), JSON.stringify(transcript), { EX: TTL_SECONDS })
}
