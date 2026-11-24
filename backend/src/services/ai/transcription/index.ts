import { downloadWhatsAppMedia } from "../../whatsapp/client.js"
import { getSavedContacts } from "../../whatsapp/chatStore.js"
import { ZohoGetCustomerById, findCustomerByPhone, getContactPreferredLanguage } from "../../zoho/customers/index.js"
import { ELEVENLABS_STT_MODEL } from "../../../constants/env.js"
import { speechToText, type SpeechToTextResult } from "./elevenlabs.js"
import { CURRENT_LANGUAGE_MODE, getTranscript, saveTranscript, type Transcript } from "./store.js"

export { getTranscript, getTranscripts, type Transcript } from "./store.js"
export { TranscriptionNotConfiguredError } from "./elevenlabs.js"

/** Voice notes being transcribed right now, so a second tap waits for the same result instead of paying twice. */
const inFlight = new Map<string, Promise<Transcript>>()

/**
 * The language the customer behind this number uses, from their Zoho
 * "preferred_language" (am / ar / en) — a number linked to a customer in the
 * app first, else matched by phone. Undefined when the number isn't a
 * customer's (or the lookup fails): ElevenLabs then detects the language.
 */
async function customerLanguage(accessToken: string, phone: string): Promise<string | undefined> {
    try {
        const saved = (await getSavedContacts())[phone]
        let customerId = saved && "customer_id" in saved ? saved.customer_id : undefined
        if (!customerId) customerId = (await findCustomerByPhone(accessToken, phone))?.contact?.contact_id
        if (!customerId) return undefined
        // The phone search doesn't return custom fields, so read the contact itself.
        const contact = await ZohoGetCustomerById(accessToken, customerId)
        return contact ? getContactPreferredLanguage(contact) : undefined
    } catch (error) {
        console.error(`[AI] Couldn't find ${phone}'s language, letting ElevenLabs detect it:`, error)
        return undefined
    }
}

/** No actual words — only silence, or sounds like "(music)" / "(laughter)". */
function hasSpeech(result: SpeechToTextResult) {
    const words = result.words.filter((w) => w.type === "word" && w.text.trim())
    if (result.words.length > 0) return words.length > 0
    // No word list: judge by the text without bracketed sound tags.
    return result.text.replace(/[([][^)\]]*[)\]]/g, "").trim().length > 0
}

/**
 * Transcribes one stored WhatsApp voice note with ElevenLabs and saves the
 * result, once: a voice note already transcribed returns its saved
 * transcript without calling ElevenLabs again.
 */
export async function transcribeVoiceNote(accessToken: string, phone: string, messageId: string, mediaId: string): Promise<Transcript> {
    const saved = await getTranscript(messageId)
    if (saved) return saved

    const pending = inFlight.get(messageId)
    if (pending) return pending

    const work = (async () => {
        const [{ buffer, mimeType }, language] = await Promise.all([
            downloadWhatsAppMedia(mediaId),
            CURRENT_LANGUAGE_MODE === "customer" ? customerLanguage(accessToken, phone) : undefined,
        ])
        const result = await speechToText(buffer, mimeType, language)
        const transcript: Transcript = {
            status: hasSpeech(result) ? "ok" : "no_speech",
            text: result.text.trim(),
            ...(result.language_code && { language: result.language_code }),
            ...(language && { requested_language: language }),
            model: ELEVENLABS_STT_MODEL,
            language_mode: CURRENT_LANGUAGE_MODE,
            transcribed_at: Date.now(),
        }
        await saveTranscript(messageId, transcript)
        console.log(`[AI] Transcribed voice note ${messageId} (${phone}) with ${ELEVENLABS_STT_MODEL}: ${transcript.status}, language=${transcript.language ?? "?"} (asked ${language ?? "detect"})`)
        return transcript
    })()

    inFlight.set(messageId, work)
    try {
        return await work
    } finally {
        inFlight.delete(messageId)
    }
}
