import { Router } from "express";
import { getPrepOrders, savePrepShipments } from "../controllers/prep.controller.js";

export const prepRouter = Router();

prepRouter.get('/prep/orders', getPrepOrders);
prepRouter.put('/prep/orders/:id/shipped', savePrepShipments);
