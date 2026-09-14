import { customersRouter } from "./customers.routes.js";
import { invoicesRouter } from "./invoices.routes.js";
import { itemsRouter } from "./items.routes.js";
import { telegramRouter } from "./telegram.routes.js";
import { whatsappRouter } from "./whatsapp.routes.js";
import { zohoUsageRouter } from "./zoho-usage.routes.js";

export { waWebhookRouter } from "./wa-webhook.routes.js";

/**
 * Everything mounted under /api, behind env validation and the Zoho token
 * refresh. The WhatsApp webhook is exported separately because Meta calls it
 * directly and it must sit outside both of those.
 */
export const apiRouters = [
    telegramRouter,
    whatsappRouter,
    invoicesRouter,
    itemsRouter,
    customersRouter,
    zohoUsageRouter,
];
