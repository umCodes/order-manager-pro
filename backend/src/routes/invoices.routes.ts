import { Router } from "express";
import {
  createInvoice,
  getDraftInvoices,
  getRecentInvoices,
  updateInvoiceDate,
  updateInvoiceLineItems,
  updateInvoiceCustomer,
  resendInvoiceTelegramMessage,
  resendInvoiceNotification,
  getInvoiceById,
  getInvoicePdf,
  payInvoiceBalance,
  markInvoiceAsSent,
  splitInvoice,
} from "../controllers/invoices/index.js";

export const invoicesRouter = Router();

invoicesRouter.get("/invoices/drafts", getDraftInvoices);
invoicesRouter.get("/invoices/recent", getRecentInvoices);
invoicesRouter.get("/invoices/:id", getInvoiceById);
invoicesRouter.get("/invoices/:id/pdf", getInvoicePdf);
invoicesRouter.post("/invoices", createInvoice);
invoicesRouter.patch("/invoices/:id/date", updateInvoiceDate);
invoicesRouter.patch("/invoices/:id/line-items", updateInvoiceLineItems);
invoicesRouter.patch("/invoices/:id/customer", updateInvoiceCustomer);
invoicesRouter.post("/invoices/:id/telegram/resend", resendInvoiceTelegramMessage);
invoicesRouter.post("/invoices/:id/split", splitInvoice);
invoicesRouter.post("/invoices/:id/payments", payInvoiceBalance);
invoicesRouter.post("/invoices/:id/status/sent", markInvoiceAsSent);
invoicesRouter.post("/invoices/:id/notify", resendInvoiceNotification);
