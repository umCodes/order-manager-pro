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

| ✅ | **Step 3, shortage replies:** one item per line, `3 M`/`3 m`/`3 0` (missing) or `3 5` (5 available; `2.5`/`2,5` too). Lines not starting with a digit are notes; a reply with no item lines isn't a report. Every item line is checked (item on the message replied to, not reduced/removed there, not more than its quantity, not written twice, message not replaced by a resend), else nothing is saved and the bot replies (in Amharic) with what's wrong and the format. Amounts are in what the message shows (see Decisions). A saved report gets 👌. **Editing** a report replaces it: removing a line removes that item's report, removing every line cancels it (👌 taken off); every version is kept. Anyone in the group can report | Lambda |
| ✅ | **Shortages in the app (draft details part of step 5):** under each reported item a short badge: red "Missing 5kg", amber "Short 5kg · 10/15kg", or grey "OK now", with every report line, who sent it and when (✎ edited). Reported items no longer on the invoice are listed under the items | backend + app |

| ✅ | **Step 4, 👍 means prepared:** anyone's 👍 on an order message marks it prepared, taking it off undoes it (bots ignored). Status: grey **Not reported** (no 👍), green **Ready** (👍, nothing short), amber **Partial** (👍, something short). After a changes reply that adds items, that reply needs its own 👍 too (one that only lowers or removes doesn't). Shown on each draft in the drafts list, and on the draft page next to "Items" with who gave the 👍 and when. Item notes show only short items: the shortage, who reported it and when (not the report text) | backend + Lambda + app |

**Setup for step 4 (owner):** the bot must be an admin of the group, and the webhook must ask for reactions (`allowed_updates` including `message_reaction`); the group's allowed reactions must include 👍 and 👌.

**How shortages add up:** only the newest full order message counts, with the changes replies after it. The order needs each item's latest quantity; what's available is, over that message and the replies that add to it, what was reported (or the full amount where nothing was). A later report on the same message and item replaces the earlier one. So a quantity change after a report is taken into account automatically.

**Checking step 2** (no Telegram changes): `GET /api/telegram/group/messages/<group message id>` shows the order and items saved for a group message; `GET /api/telegram/group/replies` lists the latest recognised replies. Orders posted before step 2 was deployed have no link.

## Next steps

### Step 5: show it in the app
- ~~Drafts list badge~~ and ~~draft details~~: done with steps 3 and 4.
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

## Decisions
- **Everything in Telegram is in Amharic,** including the bot's replies.
- **Reports are read in what the Telegram message shows, not Zoho's units:** kilograms by default (a box shows as 10ኪሎ, so `1 15` on it is 15kg); a plain count when the message has no ኪሎ after the number (packs); for an item shown in grams (ግራም), a whole number is grams and a fraction kilograms. The app shows shortages the same way (kg, or a count).
- **Badges in the app are short:** item notes "Missing 5kg" / "Short 5kg · 10/15kg" with who reported and when (no report text, nothing for items that aren't short); order status Ready / Partial / Not reported.
- Missing is `m`, `M` or `0` (`3 0` is the same as `3 M`), nothing else.
- Anyone in the group can report shortages and give 👍.
- Corrections are made by editing the report message (Telegram doesn't tell bots about deletions).
- Confirmation reaction: 👌 (bots can only use Telegram's reaction list, which has no ✅; 👍 means "prepared"). Owner can change it.
- Everything in a report must show in the app.

## Open questions
1. **Allocation (step 7):**
   - What makes backup stock usable: a 👍 on the list?
   - Does an order's Telegram message still ask preparers for the allocated part?
   - What happens to allocations when a draft is edited, deleted or voided?
2. **Redis durability:** reports and lists must survive restarts. Does the Redis plan save to disk? The provider and plan in `REDIS_URL` tell.
