import { describeMessage } from "./messageContent.mjs";
import { getWhatsAppMedia } from "../services/whatsapp/client.mjs";
import { findCustomerByPhone, summarizeCustomer } from "../services/zoho/customers.mjs";
import { sendEmail } from "../services/email/client.mjs";

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
}

function contentHtml(content) {
    if (content.type === "text") {
        return `<p><strong>Message:</strong> ${escapeHtml(content.text)}</p>`;
    }
    if (content.mediaId) {
        const caption = content.caption ? `<p><strong>Caption:</strong> ${escapeHtml(content.caption)}</p>` : "";
        const filename = content.filename ? `<p><strong>Filename:</strong> ${escapeHtml(content.filename)}</p>` : "";
        return `<p><strong>Type:</strong> ${escapeHtml(content.type)} (attached below)</p>${caption}${filename}`;
    }
    if (content.type === "location") {
        return `<p><strong>Location:</strong> ${content.latitude}, ${content.longitude} ${escapeHtml(content.name ?? "")}</p>`;
    }
    return `<p><strong>Type:</strong> ${escapeHtml(content.type)} (no preview available)</p>`;
}

function customerHtml(customer) {
    if (!customer) return "<p><strong>Zoho contact:</strong> no match found</p>";
    const parts = [
        `<p><strong>Zoho contact:</strong> ${escapeHtml(customer.name || customer.companyName || "Unnamed")}</p>`,
    ];
    if (customer.companyName) parts.push(`<p><strong>Company:</strong> ${escapeHtml(customer.companyName)}</p>`);
    if (customer.outstandingBalance != null) {
        parts.push(`<p><strong>Outstanding balance:</strong> ${escapeHtml(customer.outstandingBalance)}</p>`);
    }
    return parts.join("\n");
}

async function buildAttachment(content) {
    if (!content.mediaId) return undefined;
    try {
        const { buffer, mimeType } = await getWhatsAppMedia(content.mediaId);
        const extension = mimeType?.split("/")[1]?.split(";")[0] ?? "bin";
        return {
            filename: content.filename ?? `${content.type}.${extension}`,
            content: buffer.toString("base64"),
        };
    } catch (error) {
        console.error(`Error downloading media ${content.mediaId} for email attachment:`, error);
        return undefined;
    }
}

/** Emails a notification for every inbound WhatsApp message, including sender info, Zoho contact match, and content/attachment. */
export async function notifyByEmail(message) {
    const to = process.env.WA_NOTIFY_EMAIL_TO;
    if (!to) {
        console.log("WA_NOTIFY_EMAIL_TO not set, skipping email notification");
        return;
    }

    const content = describeMessage(message);

    let customer;
    try {
        customer = summarizeCustomer(await findCustomerByPhone(message.from));
    } catch (error) {
        console.error(`Error looking up Zoho contact for ${message.from}:`, JSON.stringify(error));
    }

    const attachment = await buildAttachment(content);

    const html = [
        `<p><strong>From:</strong> ${escapeHtml(message.from)}</p>`,
        customerHtml(customer),
        contentHtml(content),
    ].join("\n");

    await sendEmail(to, `New WhatsApp message from ${message.from}`, html, attachment ? [attachment] : undefined);
}
