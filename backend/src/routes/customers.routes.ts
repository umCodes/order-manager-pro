import { Router } from "express";
import { getCustomers, getCustomerById, payCustomerBalance, getCustomerDraftInvoices, getCustomerDraftToMergeInto } from "../controllers/customers.controller.js";

export const customersRouter = Router();

customersRouter.get('/customers', getCustomers);
customersRouter.get('/customers/:id', getCustomerById);
customersRouter.get('/customers/:id/invoices/drafts', getCustomerDraftInvoices);
customersRouter.get('/customers/:id/invoices/draft-to-merge-into', getCustomerDraftToMergeInto);
customersRouter.post('/customers/:id/payments', payCustomerBalance);

