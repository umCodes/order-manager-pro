import { Resend } from "resend"
import { ENV } from "../../constants/env.js"

let client: Resend | undefined

function getResendClient(): Resend {
    if (!client) client = new Resend(ENV.RESEND_API_KEY)
    return client
}

export type EmailAttachment = {
    filename: string
    content: Buffer
}

export async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]) {
    try {
        const response = await getResendClient().emails.send({
            from: ENV.RESEND_FROM_EMAIL!,
            to,
            subject,
            html,
            ...(attachments?.length && { attachments }),
        })
        if (response.error) throw response.error
        return response.data
    } catch (error) {
        console.error("Error sending email via Resend:", error)
        throw error
    }
}
