import { redisClient } from "../config/redis.js"
import { BUSINESS_UTC_OFFSET_HOURS } from "../utils/businessDate.js"

/**
 * Backup lists: items posted to the channel for preparation without an
 * invoice (the Invoice tab's "Items Only" mode). Each one gets an id made of
 * the business time it was sent, read as is — BK-20261027154512 is
 * 2026-10-27 15:45:12 — so ids never depend on a counter Redis might lose.
 *
 * Kept in Redis for KEEP_DAYS from when it was sent, one key per list
 * (`backup-list:<id>`), plus the sorted set `backup-lists` (id by sent time)
 * to find them. Removing a list only marks it removed, so the daily report
 * can still tell what was left at the end of an earlier day.
 */

export type BackupListItem = {
    /** The item's number on the list's message (①, ②, … as 1, 2, …). */
    number: number
    item_id: string
    /** The catalog (English) name, for the report's kilograms. */
    name: string
    description: string
    quantity: number
    unit: string
}

export type BackupList = {
    id: string
    created_at: string
    items: BackupListItem[]
    chat_id: string
    message_id: number | null
    removed_at?: string
}

export const KEEP_DAYS = 30
const KEEP_SECONDS = KEEP_DAYS * 24 * 60 * 60
const INDEX_KEY = "backup-lists"
const listKey = (id: string) => `backup-list:${id}`

/** BK- and the business time (UTC+3) to the second, as YYYYMMDDHHmmss. */
export function backupListId(at: Date = new Date()): string {
    const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    const pad = (value: number) => String(value).padStart(2, "0")
    return `BK-${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}`
}

/** Rewrites a list, keeping the time it has left. */
async function save(list: BackupList) {
    const ttl = await redisClient.ttl(listKey(list.id))
    await redisClient.set(listKey(list.id), JSON.stringify(list), { EX: ttl > 0 ? ttl : KEEP_SECONDS })
}

async function read(id: string): Promise<BackupList | null> {
    const raw = await redisClient.get(listKey(id))
    return raw ? (JSON.parse(raw) as BackupList) : null
}

/**
 * Creates a list and posts it: `post` gets the list's id and returns the
 * Telegram message. The id is claimed before posting; if another list has
 * that second, the next free second is used. A failed post leaves nothing behind.
 */
export async function createBackupList(
    items: BackupListItem[],
    chatId: string,
    post: (id: string) => Promise<{ message_id: number }>,
): Promise<{ list: BackupList; message: { message_id: number } }> {
    const now = Date.now()
    let list: BackupList | null = null
    for (let offset = 0; offset < 60 && !list; offset++) {
        const candidate: BackupList = {
            id: backupListId(new Date(now + offset * 1000)),
            created_at: new Date(now).toISOString(),
            items,
            chat_id: chatId,
            message_id: null,
        }
        const claimed = await redisClient.set(listKey(candidate.id), JSON.stringify(candidate), { NX: true, EX: KEEP_SECONDS })
        if (claimed) list = candidate
    }
    if (!list) throw new Error("Couldn't pick an id for the backup list")

    let message
    try {
        message = await post(list.id)
    } catch (error) {
        await redisClient.del(listKey(list.id))
        throw error
    }

    list.message_id = message.message_id
    await save(list)
    await redisClient.zAdd(INDEX_KEY, { score: now, value: list.id })
    await redisClient.zRemRangeByScore(INDEX_KEY, 0, Date.now() - KEEP_SECONDS * 1000)
    return { list, message }
}

/** Every list still kept, removed ones included, newest first. */
async function allLists(): Promise<BackupList[]> {
    await redisClient.zRemRangeByScore(INDEX_KEY, 0, Date.now() - KEEP_SECONDS * 1000)
    const ids = await redisClient.zRange(INDEX_KEY, 0, -1, { REV: true })
    if (ids.length === 0) return []
    const raw = await redisClient.mGet(ids.map(listKey))
    const lists: BackupList[] = []
    const gone: string[] = []
    raw.forEach((entry, i) => {
        if (entry) lists.push(JSON.parse(entry) as BackupList)
        else gone.push(ids[i]!)
    })
    if (gone.length) await redisClient.zRem(INDEX_KEY, gone)
    return lists
}

/** The lists not removed, newest first. */
export async function listBackupLists(): Promise<BackupList[]> {
    return (await allLists()).filter((list) => !list.removed_at)
}

/** The lists that had been sent and not yet removed at `at`, oldest first. */
export async function backupListsRemainingAt(at: Date): Promise<BackupList[]> {
    const instant = at.getTime()
    return (await allLists())
        .filter((list) => Date.parse(list.created_at) < instant && (!list.removed_at || Date.parse(list.removed_at) >= instant))
        .reverse()
}

/** Marks a list removed. Returns it (as it was), or null if there's no such list or it's already removed. */
export async function removeBackupList(id: string): Promise<BackupList | null> {
    const list = await read(id)
    if (!list || list.removed_at) return null
    await save({ ...list, removed_at: new Date().toISOString() })
    return list
}

/** Marks removed the list posted as `messageId`, if any — for when its message is deleted from the Messages tab. */
export async function removeBackupListByMessage(messageId: number): Promise<void> {
    const list = (await listBackupLists()).find((entry) => entry.message_id === messageId)
    if (list) await removeBackupList(list.id)
}
