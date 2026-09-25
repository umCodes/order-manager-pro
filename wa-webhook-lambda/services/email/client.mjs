import { Resend } from "resend";

let client;

function getResendClient() {
    if (!client) client = new Resend(process.env.RESEND_API_KEY);
    return client;
}

export async function sendEmail(to, subject, html, attachments) {
    try {
        const response = await getResendClient().emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to,
            subject,
            html,
            ...(attachments?.length && { attachments }),
        });
        if (response.error) throw response.error;
        return response.data;
    } catch (error) {
        console.error("Error sending email via Resend:", error);
        throw error;
    }
}
