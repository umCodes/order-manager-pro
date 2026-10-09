import { Router } from "express";
import { getPrepOrders, savePrepStep } from "../controllers/prep.controller.js";

export const prepRouter = Router();

prepRouter.get('/prep/orders', getPrepOrders);
prepRouter.put('/prep/orders/:id/:step', savePrepStep);
