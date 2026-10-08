import { ENV } from "../../constants/env.js"

export type Methods = "GET" | "POST" | "DELETE"

const GRAPH_BASE_URL = "https://graph.facebook.com/v25.0"

/**
 * Calls the WhatsApp Cloud API, throwing the error body as-is on a non-2xx
 * response. Logs the full outgoing request and the full response either
 * way — Meta's own error object (template name/language mismatches,
 * unapproved templates, parameter-count mismatches, …) is otherwise only
 * visible here, at the point of the actual HTTP call.
 */
export async function WhatsAppApi(endPoint: string, method: Methods = "GET", body?: any) {
    return GraphApi(`${ENV.WA_PHONE_NUMBER_ID}/${endPoint}`, method, body)
}

/** Same as WhatsAppApi, but for any Graph API path (e.g. the business account's message templates), not just the phone number's. */
export async function GraphApi(path: string, method: Methods = "GET", body?: any) {
    try {
        console.log(`[WhatsApp API] -> ${method} ${path}`, body ? JSON.stringify(body) : "(no body)")
        const response = await fetch(`${GRAPH_BASE_URL}/${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${ENV.WA_TOKEN}`,
                ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            },
            ...(body && { body: JSON.stringify(body) }),
        })
        const data = await response.json()
        console.log(`[WhatsApp API] <- ${response.status} ${method} ${path}`, JSON.stringify(data))
        if (!response.ok) throw data
        return data
    } catch (error) {
        throw error
    }
}

/** Downloads inbound media (voice note, image, document, ...) by its media id: resolves the short-lived download URL, then fetches the bytes. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
        const metaResponse = await fetch(`${GRAPH_BASE_URL}/${mediaId}`, {
            headers: { Authorization: `Bearer ${ENV.WA_TOKEN}` },
        })
        const meta = await metaResponse.json()
        if (!metaResponse.ok) throw meta

        const fileResponse = await fetch(meta.url, {
            headers: { Authorization: `Bearer ${ENV.WA_TOKEN}` },
        })
        if (!fileResponse.ok) throw new Error(`Failed to download WhatsApp media ${mediaId}: ${fileResponse.status}`)

        const buffer = Buffer.from(await fileResponse.arrayBuffer())
        return { buffer, mimeType: meta.mime_type }
    } catch (error) {
        throw error
    }
}

/**
 * Uploads a file through Meta's Resumable Upload API and returns its handle
 * — what a new template's media header needs as its example (Meta's
 * reviewers look at it). Different from uploadWhatsAppMedia, whose ids are
 * for sending messages.
 */
export async function uploadResumableFile(appId: string, file: Buffer, filename: string, mimeType: string): Promise<string> {
    const params = new URLSearchParams({ file_name: filename, file_length: String(file.length), file_type: mimeType })
    const session = await GraphApi(`${appId}/uploads?${params}`, "POST")
    const response = await fetch(`${GRAPH_BASE_URL}/${session.id}`, {
        method: "POST",
        headers: { Authorization: `OAuth ${ENV.WA_TOKEN}`, file_offset: "0" },
        body: new Uint8Array(file),
    })
    const data = await response.json()
    console.log(`[WhatsApp API] <- ${response.status} POST resumable upload of ${filename}`, JSON.stringify(data))
    if (!response.ok) throw data
    return data.h as string
}

/** Uploads a file (e.g. an invoice PDF) and returns its media id, for attaching to a template message. */
export async function uploadWhatsAppMedia(file: Buffer, filename: string, mimeType: string) {
    try {
        const form = new FormData()
        form.append("messaging_product", "whatsapp")
        form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename)

        const response = await fetch(`${GRAPH_BASE_URL}/${ENV.WA_PHONE_NUMBER_ID}/media`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${ENV.WA_TOKEN}`,
            },
            body: form,
        })
        const data = await response.json()
        if (!response.ok) throw data
        return data.id as string
    } catch (error) {
        throw error
    }
}
