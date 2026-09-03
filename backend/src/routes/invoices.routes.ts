import { Router } from "express";
import {
  createInvoice,
  getDraftInvoices,
  updateInvoiceDate,
  updateInvoiceLineItems,
  resendInvoiceTelegramMessage,
  getInvoiceById,
  payInvoiceBalance,
  markInvoiceAsSent,
  splitInvoice,
} from "../controllers/invoices.controller.js";

const router = Router();

router.get("/invoices/drafts", getDraftInvoices);
router.get("/invoices/:id", getInvoiceById);
router.post("/invoices", createInvoice);
router.patch("/invoices/:id/date", updateInvoiceDate);
router.patch("/invoices/:id/line-items", updateInvoiceLineItems);
router.post("/invoices/:id/telegram/resend", resendInvoiceTelegramMessage);
router.post("/invoices/:id/split", splitInvoice);
router.post("/invoices/:id/payments", payInvoiceBalance);
router.post("/invoices/:id/status/sent", markInvoiceAsSent);

export default router;