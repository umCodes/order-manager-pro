import { Router } from "express";
import {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    setCustomerStatus,
    payCustomerBalance,
    getCustomerRecentPayments,
    sendCustomerPaymentNotification,
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
customersRouter.patch('/customers/:id/status', setCustomerStatus);
customersRouter.get('/customers/:id/invoices/drafts', getCustomerDraftInvoices);
customersRouter.get('/customers/:id/payments', getCustomerRecentPayments);
customersRouter.post('/customers/:id/payments', payCustomerBalance);
customersRouter.post('/customers/:id/payments/:paymentId/notify', sendCustomerPaymentNotification);
customersRouter.post('/customers/:id/contacts', addCustomerContact);
customersRouter.put('/customers/:id/contacts/:contactId', updateCustomerContact);
customersRouter.delete('/customers/:id/contacts/:contactId', deleteCustomerContact);
customersRouter.post('/customers/:id/contacts/:contactId/primary', markCustomerContactPrimary);

