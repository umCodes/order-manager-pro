# Telegram preparation tracking: the plan

## Goal
Preparers work in a Telegram **group**. They reply to an order to report missing items, and react 👍 when it's prepared. The app shows each order's preparation status and its shortages.

**Ground rules**
- **Zoho is never touched by any of this:** no invoice, quantity, total, payment or stock changes.
- **The channel workflow keeps running unchanged** until the group features are finished.
- **Each step is small,** tested on `claude/daily-report`, and deployed before the next one starts.

## Done
| | What | Where |
|---|---|---|
| ✅ | **Numbered items** ①②③ on every order. Numbers stay fixed per order, and each general item line gets its own | backend |
| ✅ | **Backup lists**: `BK-YYYYMMDDHHmmss` ID with "ትርፍ" under it, items stored for 30 days, shown on the Items page and in the daily report | backend + app |
| ✅ | **Step 1, receive:** the Lambda gets Telegram updates at `/telegram`, checks the secret, ignores repeats, and keeps the last 200 | Lambda |
| ✅ | **Group copy:** every channel message is sent, replied to, edited and deleted in the group too, and each copy is linked back to its original | backend |
| ✅ | **The bot answers every message** with chat and message IDs (temporary) | Lambda |
| ✅ | **The Lambda deploys itself** from GitHub on every push | GitHub Actions |

**Setup still open on the owner's side:** `TELEGRAM_GROUP_CHATID` on Render (the `chat:` number from the bot's answer), with the backend deployed from `claude/daily-report`.

## Next steps

### Step 2: link a group reply to its order
- When someone replies in the group, find the order: group message → channel message (from the copy link) → invoice or backup list.
- Save the reverse link when an order is posted: channel message → invoice ID / BK ID. Today only invoice → message is stored.
- Only messages from the group count. The channel and other chats are ignored.
- The bot's temporary answer turns into "this is a reply to INV-000412", which makes testing easy.

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
- The bot's temporary answer is removed.
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
