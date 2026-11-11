/** Calls a Telegram Bot API method with the bot's token (TELEGRAM_TOKEN) and returns Telegram's answer ({ ok, result | description }). */
export async function telegramApi(method, body) {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) throw new Error("TELEGRAM_TOKEN isn't set");
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return response.json();
}
