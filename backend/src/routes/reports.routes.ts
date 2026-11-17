import { Router } from "express";
import { getDailyReportDays, getDailyReportPdf, scheduledDailyReport, sendDailyReport, getPreparationReportPeople, getPreparationReportPdf } from "../controllers/reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get('/reports/daily/days', getDailyReportDays);
reportsRouter.get('/reports/daily', getDailyReportPdf);
reportsRouter.post('/reports/daily/send', sendDailyReport);
reportsRouter.post('/reports/daily/scheduled', scheduledDailyReport);
reportsRouter.get('/reports/preparation/people', getPreparationReportPeople);
reportsRouter.get('/reports/preparation', getPreparationReportPdf);
