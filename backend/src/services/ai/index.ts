/**
 * AI features for WhatsApp orders. Everything they do lives under this
 * folder; the rest of the app imports only from here.
 *
 * For now: transcribing a voice note on request (ElevenLabs speech-to-text),
 * shown under the voice note in the chat. Nothing runs automatically, and
 * nothing here touches Zoho except reading a customer's preferred language.
 */
export {
    transcribeVoiceNote,
    getTranscript,
    getTranscripts,
    TranscriptionNotConfiguredError,
    type Transcript,
} from "./transcription/index.js"
