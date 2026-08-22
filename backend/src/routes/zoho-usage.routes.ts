import { Router } from "express";
import { getZohoRequestCount } from '../controllers/zoho-usage.controller.js';

export const zohoUsageRouter = Router();

zohoUsageRouter.get('/zoho-usage', getZohoRequestCount);

export default zohoUsageRouter;