import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { CRON_SECRET } from '../constants/env.js';
import { redisClient } from '../config/redis.js';
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

/** Set once a day's report was sent by the scheduler, so a repeated call doesn't send it twice. */
const AUTO_SENT_KEY = (day: string) => `daily-report:auto-sent:${day}`;

/** Compared with spaces, line breaks and quotes around either value ignored (easy to paste in by accident). */
function secretMatches(given: string | undefined) {
    const clean = (value: string | undefined) => (value ?? '').trim().replace(/^["']|["']$/g, '').trim();
    const expected = clean(CRON_SECRET);
    const received = clean(given);
    if (!expected || !received) return false;
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by a scheduler (cron-job.org) just after 4am business time: sends
 * the business day that just ended on WhatsApp, to the template and numbers
 * chosen in Settings. Needs the X-Cron-Secret header to match CRON_SECRET.
 * Sends each day once at most — a repeated or retried call is skipped. It
 * answers at once (202) and sends in the background, so a slow send (or a
 * server waking from sleep) doesn't make the scheduler time out; the result
 * is logged, and a day whose send failed for every number can be retried.
 */
export async function scheduledDailyReport(req: Request, res: Response) {
    if (!CRON_SECRET?.trim()) {
        res.status(503).json({ error: 'CRON_SECRET is not set on the server' });
        return;
    }
    if (!secretMatches(req.get('X-Cron-Secret'))) {
        res.status(401).json({ error: req.get('X-Cron-Secret') ? 'X-Cron-Secret does not match CRON_SECRET' : 'The X-Cron-Secret header is missing' });
        return;
    }

    try {
        const access_token = requireAccessToken(req, "A problem occured sending the report");
        const day = previousBusinessDay(businessDayKey());
        // Checked before answering, so the scheduler's log shows it as a failure.
        const settings = await getDailyReportWhatsAppSettings();
        if (!settings.template || settings.recipients.length === 0) {
            res.status(400).json({ day, error: "Choose the daily report's WhatsApp template and numbers in Settings first" });
            return;
        }
        const claimed = await redisClient.set(AUTO_SENT_KEY(day), new Date().toISOString(), { NX: true, EX: 3 * 24 * 60 * 60 });
        if (!claimed) {
            res.status(200).json({ day, skipped: 'Already sent' });
            return;
        }
        res.status(202).json({ day, sending: true });

        try {
            await settleReportDeliveries();
            const results = await sendDailyReportOnWhatsApp(access_token, day);
            console.log(`Daily report ${day} sent by the scheduler:`, JSON.stringify(results));
            if (!results.some((r) => r.ok)) await redisClient.del(AUTO_SENT_KEY(day));
        } catch (error) {
            console.error(`Daily report ${day}: the scheduled send failed`, error);
            await redisClient.del(AUTO_SENT_KEY(day)).catch(() => {});
        }
    } catch (error) {
        console.error('Daily report: the scheduled send failed', error);
        if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send the daily report' });
    }
}
