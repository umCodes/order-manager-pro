import { ENV } from "../../constants/env.js"

export type Methods = "GET" | "POST"

const WA_BASE_URL = `https://graph.facebook.com/v25.0/${ENV.WA_PHONE_NUMBER_ID}`

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
