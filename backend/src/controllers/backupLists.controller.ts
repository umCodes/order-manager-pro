import type { Request, Response } from 'express';
import { listBackupLists, removeBackupList, withReportedAvailability } from '../services/backupLists.js';
import { TelegramDeleteMessage } from '../services/telegram/index.js';

/**
 * The backup lists not removed yet, newest first — the Items tab's "Backup
 * lists" section — with what was reported short on each in the Telegram group.
 */
export async function getBackupLists(_req: Request, res: Response) {
    try {
        res.status(200).json({ lists: await withReportedAvailability(await listBackupLists()) });
    } catch (error) {
        console.error('Error listing backup lists:', error);
        res.status(500).json({ error: 'Failed to load backup lists' });
    }
}

/**
 * Removes a backup list and deletes its channel message. The list goes
 * whether or not Telegram agrees (bots can't delete messages older than 48
 * hours), and the response says whether the message went too.
 */
export async function deleteBackupList(req: Request, res: Response) {
    try {
        const id = String(req.params.id ?? '');
        const list = await removeBackupList(id);
        if (!list) {
            res.status(404).json({ error: 'No such backup list' });
            return;
        }
        const { deletedFromTelegram, error } = list.message_id
            ? await TelegramDeleteMessage(list.message_id, list.chat_id)
            : { deletedFromTelegram: false, error: undefined };
        res.status(200).json({ ok: true, deleted_from_telegram: deletedFromTelegram, telegram_error: error });
    } catch (error) {
        console.error('Error removing backup list:', error);
        res.status(500).json({ error: 'Failed to remove backup list' });
    }
}
