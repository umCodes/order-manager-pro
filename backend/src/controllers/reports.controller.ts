import type { Request, Response } from 'express';
import { requireAccessToken } from '../utils/requireAccessToken.js';
import { businessDayKey, previousBusinessDay } from '../utils/businessDate.js';
import { buildDailyReport } from '../services/dailyReport/report.js';
import { markReportHandedOver } from '../services/dailyReport/store.js';
import { createDailyReportPdfBuffer } from '../pdf/dailyReport.js';
import { getDailyReportWhatsAppSettings, sendDailyReportOnWhatsApp, settleReportDeliveries } from '../services/dailyReport/whatsapp.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The current business day and the one before it (4am-to-4am, business
 * time), for the report picker, plus whether WhatsApp sending is set up.
 * Also checks whether reports sent earlier have been delivered (Redis only).
 */
export async function getDailyReportDays(_req: Request, res: Response) {
    const today = businessDayKey();
    await settleReportDeliveries();
    const settings = await getDailyReportWhatsAppSettings().catch(() => ({ template: null, recipients: [] as string[] }));
    res.status(200).json({
        today,
        previous: previousBusinessDay(today),
        whatsapp: { template: settings.template?.name ?? null, recipients: settings.recipients.length },
    });
}

/**
 * Sends a business day's report (`{ day: "YYYY-MM-DD" }`) on WhatsApp to the
 * numbers chosen in Settings, with the chosen template. Responds with each
 * number's outcome; an error when nothing is set up or the template isn't
 * approved yet.
 */
export async function sendDailyReport(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured sending the report");
        const day = String(req.body?.day ?? "");
        if (!DAY_PATTERN.test(day)) throw new Error("day must be YYYY-MM-DD");
        if (day > businessDayKey()) throw new Error("That business day hasn't started yet");
        await settleReportDeliveries();
        const results = await sendDailyReportOnWhatsApp(access_token, day);
        res.status(200).json({ results });
    } catch (error) {
        console.error('Error sending the daily report on WhatsApp:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send the daily report' });
    }
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
