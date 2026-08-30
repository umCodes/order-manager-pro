import { Router } from "express";
import { getCustomers, getCustomerById, createCustomer, updateCustomer, payCustomerBalance, getCustomerDraftInvoices } from "../controllers/customers.controller.js";

export const customersRouter = Router();

customersRouter.get('/customers', getCustomers);
customersRouter.post('/customers', createCustomer);
customersRouter.get('/customers/:id', getCustomerById);
customersRouter.put('/customers/:id', updateCustomer);
customersRouter.get('/customers/:id/invoices/drafts', getCustomerDraftInvoices);
customersRouter.post('/customers/:id/payments', payCustomerBalance);

