import { Router } from "express";
import { getDailyReportDays, getDailyReportPdf } from "../controllers/reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get('/reports/daily/days', getDailyReportDays);
reportsRouter.get('/reports/daily', getDailyReportPdf);
