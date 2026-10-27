import { Router } from "express";
import { deleteCustomerVisit, getVisits, markCustomerVisited, putCustomerVisit, saveCustomerLocation } from "../controllers/visits.controller.js";

export const visitsRouter = Router();

visitsRouter.get('/visits', getVisits);
visitsRouter.put('/customers/:id/visit', putCustomerVisit);
visitsRouter.delete('/customers/:id/visit', deleteCustomerVisit);
visitsRouter.post('/customers/:id/visit/done', markCustomerVisited);
visitsRouter.post('/customers/:id/location', saveCustomerLocation);
