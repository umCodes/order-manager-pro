import type { Request, Response } from 'express';
import { requireAccessToken } from '../utils/requireAccessToken.js';
import { businessDayKey, previousBusinessDay } from '../utils/businessDate.js';
import { buildDailyReport } from '../services/dailyReport/report.js';
import { markReportHandedOver } from '../services/dailyReport/store.js';
import { createDailyReportPdfBuffer } from '../pdf/dailyReport.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The current business day and the one before it (4am-to-4am, business time), for the report picker. */
export function getDailyReportDays(_req: Request, res: Response) {
    const today = businessDayKey();
    res.status(200).json({ today, previous: previousBusinessDay(today) });
}

/**
 * The daily report PDF for `?day=YYYY-MM-DD` (default: the last finished
 * business day). Works with nothing recorded too — the PDF then says so.
 * Downloading a finished day's report counts as handing it over: its data is
 * then kept 3 more days instead of 7 (see markReportHandedOver).
 */
export async function getDailyReportPdf(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured building the report");
        const requested = typeof req.query.day === "string" ? req.query.day : previousBusinessDay(businessDayKey());
        if (!DAY_PATTERN.test(requested)) throw new Error("day must be YYYY-MM-DD");
        if (requested > businessDayKey()) throw new Error("That business day hasn't started yet");

        const report = await buildDailyReport(access_token, requested);
        const pdf = await createDailyReportPdfBuffer(report);
        await markReportHandedOver(requested);

        res.setHeader("Content-Type", "application/pdf");
        const disposition = req.query.download === "1" ? "attachment" : "inline";
        res.setHeader("Content-Disposition", `${disposition}; filename="daily-report-${requested}.pdf"`);
        res.status(200).send(pdf);
    } catch (error) {
        console.error('Error building daily report:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to build the daily report' });
    }
}
