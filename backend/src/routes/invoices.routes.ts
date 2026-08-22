import { Router } from "express";
import {
  createInvoice,
  getDraftInvoices,
  updateInvoiceDate,
  resendInvoiceTelegramMessage,
  getInvoiceById,
  payInvoiceBalance,
  markInvoiceAsSent,
} from "../controllers/invoices.controller.js";

const router = Router();

router.get("/invoices/drafts", getDraftInvoices);
router.get("/invoices/:id", getInvoiceById);
router.post("/invoices", createInvoice);
router.patch("/invoices/:id/date", updateInvoiceDate);
router.post("/invoices/:id/telegram/resend", resendInvoiceTelegramMessage);
router.post("/invoices/:id/payments", payInvoiceBalance);
router.post("/invoices/:id/status/sent", markInvoiceAsSent);

export default router;