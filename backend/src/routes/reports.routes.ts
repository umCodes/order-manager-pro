import { Router } from "express";
import { getDailyReportDays, getDailyReportPdf, scheduledDailyReport, sendDailyReport } from "../controllers/reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get('/reports/daily/days', getDailyReportDays);
reportsRouter.get('/reports/daily', getDailyReportPdf);
reportsRouter.post('/reports/daily/send', sendDailyReport);
reportsRouter.post('/reports/daily/scheduled', scheduledDailyReport);
