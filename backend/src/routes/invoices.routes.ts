import { Router } from "express";
import {
  createInvoice,
  getDraftInvoices,
  updateInvoiceDate,
  updateInvoiceLineItems,
  updateInvoiceCustomer,
  resendInvoiceTelegramMessage,
  getInvoiceById,
  getInvoicePdf,
  payInvoiceBalance,
  markInvoiceAsSent,
  splitInvoice,
} from "../controllers/invoices.controller.js";

const router = Router();

router.get("/invoices/drafts", getDraftInvoices);
router.get("/invoices/:id", getInvoiceById);
router.get("/invoices/:id/pdf", getInvoicePdf);
router.post("/invoices", createInvoice);
router.patch("/invoices/:id/date", updateInvoiceDate);
router.patch("/invoices/:id/line-items", updateInvoiceLineItems);
router.patch("/invoices/:id/customer", updateInvoiceCustomer);
router.post("/invoices/:id/telegram/resend", resendInvoiceTelegramMessage);
router.post("/invoices/:id/split", splitInvoice);
router.post("/invoices/:id/payments", payInvoiceBalance);
router.post("/invoices/:id/status/sent", markInvoiceAsSent);

export default router;