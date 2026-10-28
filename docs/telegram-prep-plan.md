# Telegram preparation tracking: the plan

## Goal
Preparers work in a Telegram **group**. They reply to an order to report missing items, and react 👍 when it's prepared. The app shows each order's preparation status and its shortages.

**Ground rules**
- **Zoho is never touched by any of this:** no invoice, quantity, total, payment or stock changes.
- **The group is the new workflow; the channel is not part of it.** The channel keeps doing its current job unchanged until the switch-over, but no new feature reads from it or depends on it, unless the owner asks for that feature to include the channel.
- **Only a real reply counts:** a message sent with Telegram's Reply on a specific order message in the group. Plain text in the group is ignored.
- **The bot doesn't answer in the chat** unless a step says so (e.g. the confirmation reaction in step 3).
- **Each step is small,** tested on `claude/daily-report` (the testing branch; `main` takes it later), and deployed before the next one starts.

## Done
| | What | Where |
|---|---|---|
| ✅ | **Numbered items** ①②③ on every order. Numbers stay fixed per order, and each general item line gets its own | backend |
| ✅ | **Backup lists**: `BK-YYYYMMDDHHmmss` ID with "ትርፍ" under it, items stored for 30 days, shown on the Items page and in the daily report | backend + app |
| ✅ | **Step 1, receive:** the Lambda gets Telegram updates at `/telegram`, checks the secret, ignores repeats, and keeps the last 200 | Lambda |
| ✅ | **Group copy:** every channel message is sent, replied to, edited and deleted in the group too, and each copy is linked back to its original | backend |
| ✅ | **The Lambda deploys itself** from GitHub on every push | GitHub Actions |
| ✅ | **`TELEGRAM_GROUP_CHATID` set on Render** | setup |
| ✅ | **Step 2, link group messages to orders:** each order, changes reply and backup list posted to the group saves group message ID → order (invoice ID or BK ID) and its numbered items (number, Zoho item ID, item key, description, unit, quantity; on a changes reply, what changed). Replies to them are recognised and recorded. The bot's temporary answers are removed | backend + Lambda |

**Checking step 2** (no Telegram changes): `GET /api/telegram/group/messages/<group message id>` shows the order and items saved for a group message; `GET /api/telegram/group/replies` lists the latest recognised replies. Orders posted before step 2 was deployed have no link.

## Next steps

### Step 3: shortage commands
- **Formats:**
  - `3 M`: item ③ is completely missing.
  - `3 5`: only 5 of item ③ is available, in the item's own unit. Decimals like `2.5` are allowed.
- **Checks:**
  - the item number exists on that order
  - the available amount is no more than the amount ordered
  - only a reply to an order counts
- **Valid report:** saved (order, item, ordered quantity and unit, available or missing, who reported it, when, and the Telegram IDs), and the bot reacts to the report message to confirm it.
- **Invalid report:** a short reply showing the expected format.
- **Repeats and edits:** a repeat send is ignored. An edited report replaces the earlier one, and the history is kept.
- **Deleted reports:** Telegram doesn't tell bots about deletions, so a correction command is needed instead (see the open questions).

### Step 4: 👍 means ready
- 👍 from a group member on an order marks it **prepared**. Removing the 👍 sends it back to pending.
- The bot's own confirmation reaction on a report is **never** counted as "prepared".
- The status comes from the saved data:
  - **Pending:** no 👍.
  - **Ready:** 👍, no shortages.
  - **Ready with shortages:** 👍, with one or more shortages.

### Step 5: show it in the app
- **Drafts list:** a status badge on each order.
- **Draft details:** each short item shows ordered / available / short. Amber means partly available, red means completely missing.
- **Sent invoices:** nothing changes.
- **Items page:** reported shortages are shown without counting anything twice.

### Step 6: backup lists in the group
- The same `3 M` / `3 5` replies work on `BK-` lists, and the saved list shows what's actually available.
- The daily report's "remaining backup items" uses the reported amounts.

### Step 7: allocate backup stock to orders (needs decisions first)
- Take available backup quantities and assign them to new orders' items: matched by item ID and unit, partial amounts allowed, never assigned twice, every assignment recorded.
- Not started until the open questions below are answered.

### Step 8: switch over
- Orders go to the group only, and the channel copy ends.
- The Lambda deploy workflow switches from `claude/daily-report` to `main` after merging.

## Open questions (needed before steps 3, 4 and 7)
1. **Word for "missing":** only `M`, or also an Amharic letter, e.g. `የ`?
2. **Correcting a mistake:** a command like `3 OK` to cancel item ③'s report?
3. **Who can report and confirm:** anyone in the group, or only certain people?
4. **Confirmation reaction:** 👌, 🫡 or ✍? Bots can't use ✅.
5. **Order changes after a report:** if item ③'s quantity changes, should its report be kept, or marked "needs re-check"?
6. **Allocation (step 7):**
   - What makes backup stock usable: a 👍 on the list?
   - Does an order's Telegram message still ask preparers for the allocated part?
   - What happens to allocations when a draft is edited, deleted or voided?
7. **Redis durability:** reports and lists must survive restarts. Does the Redis plan save to disk? The provider and plan in `REDIS_URL` tell.
