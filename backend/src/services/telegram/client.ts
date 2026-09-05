import { ENV } from "../../constants/env.js"

export type Methods = "GET" | "POST"

/** Calls a Telegram Bot API method and returns the parsed response envelope ({ ok, result, … }). */
export async function TelegramApi(endPoint: string, method: Methods = "GET", body?: any) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_TOKEN}/${endPoint}`, {
                    method,
                    headers: {
                        ...(method === "POST" ? {'Content-Type': 'application/json'} : {})
                    },
                    ...(body && { body: JSON.stringify(body) })
                })
        const data = await response.json()
        return data
    } catch (error) {
        throw error
    }
}