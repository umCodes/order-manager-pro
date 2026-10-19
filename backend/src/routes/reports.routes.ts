import { Router } from "express";
import { getDailyReportDays, getDailyReportPdf, sendDailyReport } from "../controllers/reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get('/reports/daily/days', getDailyReportDays);
reportsRouter.get('/reports/daily', getDailyReportPdf);
reportsRouter.post('/reports/daily/send', sendDailyReport);
