# Notes for Claude

## Telegram preparation tracking
The plan, progress and open questions live in `docs/telegram-prep-plan.md`. Read it before working on anything Telegram-, group-, shortage- or backup-list-related, and update its "Done" table and open questions as steps land.

Ground rules from that plan:
- Never change Zoho automatically for this feature. The only Zoho change allowed is a deliberate, confirmed action in the app (applying a shortage report to a draft's item). Anything more needs the owner's say-so.
- The group is the new workflow. The channel keeps its current job unchanged, but new features never read from or depend on it unless the owner asks.
- Only a Telegram Reply to an order message in the group counts; plain group text is ignored. The bot doesn't answer in the chat unless a step says so.
- Work in small steps on `claude/daily-report` (the testing branch), each deployed before the next starts.
