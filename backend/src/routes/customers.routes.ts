import { Router } from "express";
import {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    setCustomerStatus,
    payCustomerBalance,
    getCustomerPayments,
    sendCustomerPaymentNotification,
    getCustomerDraftInvoices,
    addCustomerContact,
    updateCustomerContact,
    deleteCustomerContact,
    markCustomerContactPrimary,
    getCustomerVisits,
    markCustomerVisited,
    importCustomerVisits,
} from "../controllers/customers/index.js";

export const customersRouter = Router();

customersRouter.get('/customers', getCustomers);
// Before /customers/:id, so "visits" isn't taken for an id.
customersRouter.get('/customers/visits', getCustomerVisits);
customersRouter.post('/customers/visits/import', importCustomerVisits);
customersRouter.post('/customers/:id/visits', markCustomerVisited);
customersRouter.post('/customers', createCustomer);
customersRouter.get('/customers/:id', getCustomerById);
customersRouter.put('/customers/:id', updateCustomer);
customersRouter.patch('/customers/:id/status', setCustomerStatus);
customersRouter.get('/customers/:id/invoices/drafts', getCustomerDraftInvoices);
customersRouter.get('/customers/:id/payments', getCustomerPayments);
customersRouter.post('/customers/:id/payments', payCustomerBalance);
customersRouter.post('/customers/:id/payments/:paymentId/notify', sendCustomerPaymentNotification);
customersRouter.post('/customers/:id/contacts', addCustomerContact);
customersRouter.put('/customers/:id/contacts/:contactId', updateCustomerContact);
customersRouter.delete('/customers/:id/contacts/:contactId', deleteCustomerContact);
customersRouter.post('/customers/:id/contacts/:contactId/primary', markCustomerContactPrimary);

