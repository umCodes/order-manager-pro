import express from "express";
import invoicesRouter from "./routes/invoices.routes.js";
import itemsRouter from "./routes/items.routes.js";
import { refreshZohoToken } from "./middlewares/zoho_refresh_tokens.middleware.js";
import { validateEnv } from "./middlewares/env_validate.middleware.js";
import cors from 'cors';
import { customersRouter } from "./routes/customers.routes.js";
import { connectRedis } from './config/redis.js';
import telegramRouter from "./routes/telegram.routes.js";
import zohoUsageRouter from "./routes/zoho-usage.routes.js";
import waWebhookRouter from "./routes/wa-webhook.routes.js";
import { IS_PRODUCTION, FRONTEND_URL, ENV } from "./constants/env.js";
import { createInvoicePdf } from "./utils/pdf.js";
import { ZohoGetDrafts, ZohoGetInvoiceById } from "./services/zoho/invoices.js";

connectRedis().catch((error) => console.error('Failed to connect to Redis', error));

async function getZohoAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: ENV.CLIENT_ID!,
    client_secret: ENV.CLIENT_SECRET!,
    refresh_token: ENV.ZOHO_REFRESH_TOKEN!,
    redirect_uri: ENV.REDIRECT_URI!,
    grant_type: "refresh_token",
  });

  const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: "POST" });
  const data = await response.json();
  if (data.error) throw new Error(data.error_description || "Failed to refresh Zoho token");
  return `Bearer ${data.access_token}`;
}

async function testDraftInvoicePdf() {
  const headers = await getZohoAccessToken();
  const drafts = await ZohoGetDrafts(headers);
  const draft = drafts?.[0];
  if (!draft) {
    console.log("No draft invoices found in Zoho, skipping test.pdf generation");
    return;
  }

  const invoice = await ZohoGetInvoiceById(headers, draft.invoice_id);

  await createInvoicePdf("./test.pdf", {
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    date: invoice.date,
    lineItems: invoice.line_items.map((item: any) => ({
      description: item.description,
      itemName: item.name,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
    })),
    totalPrice: invoice.total,
    paidAmount: invoice.payment_made,
    discountAmount: invoice.sub_total + invoice.tax_total + invoice.shipping_charge + invoice.adjustment - invoice.total,
  });

  console.log(`test.pdf created from draft ${invoice.invoice_number}`);
}

testDraftInvoicePdf().catch((error) => console.error("Failed to create test.pdf from draft", error));

const app = express();
const port = process.env.PORT || 3000;

if (IS_PRODUCTION && !FRONTEND_URL) {
    throw new Error("FRONTEND_URL must be set in production");
}

app.use(express.json());
app.use(cors({
    origin: IS_PRODUCTION
        ? FRONTEND_URL
        : [/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/, /^http:\/\/localhost:\d+$/]
}));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(waWebhookRouter);

const apiRouters = [
    telegramRouter,
    invoicesRouter,
    itemsRouter,
    customersRouter,
    zohoUsageRouter
];

app.use('/api', validateEnv, refreshZohoToken, ...apiRouters);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});