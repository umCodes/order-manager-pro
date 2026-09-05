import { Router } from "express";
import {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    payCustomerBalance,
    getCustomerDraftInvoices,
    addCustomerContact,
    updateCustomerContact,
    deleteCustomerContact,
    markCustomerContactPrimary,
} from "../controllers/customers/index.js";

export const customersRouter = Router();

customersRouter.get('/customers', getCustomers);
customersRouter.post('/customers', createCustomer);
customersRouter.get('/customers/:id', getCustomerById);
customersRouter.put('/customers/:id', updateCustomer);
customersRouter.get('/customers/:id/invoices/drafts', getCustomerDraftInvoices);
customersRouter.post('/customers/:id/payments', payCustomerBalance);
customersRouter.post('/customers/:id/contacts', addCustomerContact);
customersRouter.put('/customers/:id/contacts/:contactId', updateCustomerContact);
customersRouter.delete('/customers/:id/contacts/:contactId', deleteCustomerContact);
customersRouter.post('/customers/:id/contacts/:contactId/primary', markCustomerContactPrimary);

