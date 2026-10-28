# MoneyMatters backup and recovery test checklist

Use fake/sample financial data only during these tests. Do not rely on the app as your sole financial record until tests pass on your actual target browser/device.

## Test data

- Create a cash account with opening balance ₹1,000.
- Create a bank account with opening balance ₹5,000.
- Add ₹30,000 salary income to the bank account.
- Add ₹500 food expense from the bank account.
- Transfer ₹2,000 from bank to cash.
- Add a monthly food budget, one savings goal, one investment holding and one bill reminder.

## Expected core calculations

- Bank balance: ₹32,500 (₹5,000 + ₹30,000 − ₹500 − ₹2,000).
- Cash balance: ₹3,000 (₹1,000 + ₹2,000).
- Total account balance: ₹35,500.
- Income less expenses: ₹29,500 (transfers must not count as income or expense).

## JSON backup and restore

- Export a JSON backup.
- Check that it downloads and is not empty.
- Keep a duplicate of the backup; do not edit the only copy.
- Restore it into a separate clean browser profile or a test installation.
- Verify accounts, transactions, budgets, goals, investment and bill records, and balances.
- Test a malformed JSON file; it should be rejected before replacing live data.
- Test a valid backup with an invalid account reference; it should be rejected.
- Before any restore, confirm the pre-restore safety copy downloads and keep it until verification finishes.

## Encrypted backup

- Export using a passphrase of at least 8 characters; use a strong unique passphrase for real backups.
- Try restoring with the wrong passphrase; it should fail without changing the live database.
- Restore using the correct passphrase in a test environment.
- Keep the passphrase separately from the backup file.

## App PIN

- Set a PIN and save the recovery code separately.
- Reload the page and verify it asks for the PIN.
- Enter a wrong PIN; it should remain locked.
- Use the recovery code to reset the PIN.
- Verify that disabling the PIN does not delete records.
- Remember: the PIN is a privacy gate, not encryption of the live IndexedDB database.

## Device and offline behavior

- Reload after adding sample data.
- Close and reopen the browser.
- After the app has loaded online once, disconnect internet and test whether the app shell opens.
- Do not clear site data during testing unless a tested backup exists.
- Export a backup before app updates or device changes.

## Pass criteria

Do not begin using real financial data as the only record until you have verified successful backup export, successful restore, correct balances, and recovery from a wrong-passphrase attempt.


## Swing trade journal (v0.5)
- [ ] Add an open long trade with symbol, entry, quantity, stop loss, target, strategy and checklist.
- [ ] Confirm it appears as Open and is not counted in realized P&L.
- [ ] Add a closed trade with exit price and exit date; confirm gross P&L is `(exit - entry) × quantity` for Long and `(entry - exit) × quantity` for Short.
- [ ] Confirm win rate and current-month realized P&L update.
- [ ] Open the trade review and verify checklist, psychology, rule-following, early-exit, moved-stop and lesson fields.
- [ ] Export JSON and encrypted backup; confirm the backup contains `tradeJournal`.
- [ ] Restore the v0.5 backup into a test profile and verify the journal entries.
- [ ] Do not use a v0.3 backup as a way to restore trading history; older backups did not include the journal.


## v0.5 mobile-to-desktop merge tests

- [ ] On mobile, add a sample income, expense, and swing trade; export JSON and encrypted backup.
- [ ] On desktop, create a sample desktop-only record and export a desktop backup.
- [ ] Merge the mobile JSON backup into desktop; verify mobile records appear and desktop-only records remain.
- [ ] Merge the same mobile backup a second time; verify transaction/trade counts do not increase from duplicates.
- [ ] Verify default Cash/Bank accounts are not duplicated when names and types match.
- [ ] Verify transfer source/destination account IDs still point to the correct desktop accounts.
- [ ] Merge the encrypted backup with the correct passphrase; verify results.
- [ ] Try a wrong passphrase; verify no records are changed.
- [ ] Verify the pre-merge safety JSON downloads and store it privately (it is not encrypted).
- [ ] Confirm the merge preview accurately reports additions, updates and unchanged records.
