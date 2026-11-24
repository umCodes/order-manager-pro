# Notes for Claude

## Telegram preparation tracking
The plan, progress and open questions live in `docs/telegram-prep-plan.md`. Read it before working on anything Telegram-, group-, shortage- or backup-list-related, and update its "Done" table and open questions as steps land.

Ground rules from that plan:
- Never change Zoho automatically for this feature. The only Zoho change allowed is a deliberate, confirmed action in the app (applying a shortage report to a draft's item). Anything more needs the owner's say-so.
- The group is the new workflow. The channel keeps its current job unchanged, but new features never read from or depend on it unless the owner asks.
- Only a Telegram Reply to an order message in the group counts; plain group text is ignored. The bot doesn't answer in the chat unless a step says so.
- Work in small steps on `claude/daily-report` (the testing branch), each deployed before the next starts.

## Dangerous actions need a careful confirmation (always)
Any action that's hard or impossible to undo, or that reaches customers or Zoho, must be guarded in the app. This is a standing rule for every new feature, not only when asked. Examples: deleting or voiding something, recording or changing money, sending or resending messages to customers, ignoring things for good, and bulk actions.
- **Always a confirm step that says exactly what will happen:** what, how many, to whom, and whether it can be undone. Never `window.confirm`.
- **"Load then shoot" with a pause:** the first tap only loads the button ("Wait..." for about 1.5s, taps ignored), then the next tap confirms. Use `ConfirmModal` with `requireDoubleTap`, or `useConfirmArmedAction` for a button outside a modal. A quick double-tap must never be enough.
- **Type to confirm for the most destructive actions** (deleting an account, a customer or anything with history): the person types the thing's name, shown as the input's placeholder, and the confirm button stays disabled until it matches. It's deliberate friction, so they know exactly what they're deleting.
- **The server checks too:** a destructive endpoint refuses without an explicit confirmation in the request (e.g. `confirm: "ignore"`), so a stray call can't do it.
- **Undoable or harmless actions don't need this.** Don't add friction to everyday taps.
