import { ENV } from "../../constants/env.js"

export type Methods = "GET" | "POST"

const WA_BASE_URL = `https://graph.facebook.com/v25.0/${ENV.WA_PHONE_NUMBER_ID}`

/** Calls the WhatsApp Cloud API, throwing the error body as-is on a non-2xx response. */
export async function WhatsAppApi(endPoint: string, method: Methods = "GET", body?: any) {
    try {
        const response = await fetch(`${WA_BASE_URL}/${endPoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${ENV.WA_TOKEN}`,
                ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            },
            ...(body && { body: JSON.stringify(body) }),
        })
        const data = await response.json()
        if (!response.ok) throw data
        return data
    } catch (error) {
        throw error
    }
}

/** Downloads inbound media (voice note, image, document, ...) by its media id: resolves the short-lived download URL, then fetches the bytes. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
        const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
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

/** Uploads a file (e.g. an invoice PDF) and returns its media id, for attaching to a template message. */
export async function uploadWhatsAppMedia(file: Buffer, filename: string, mimeType: string) {
    try {
        const form = new FormData()
        form.append("messaging_product", "whatsapp")
        form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename)

        const response = await fetch(`${WA_BASE_URL}/media`, {
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
