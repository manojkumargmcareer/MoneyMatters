# MoneyMatters v1.0 — mobile-first finance, swing trade journal and safer month-end merge

MoneyMatters is an offline-first personal finance PWA prototype. It has no account system, analytics, paid APIs, or cloud backend. Its financial data is stored in IndexedDB in the current browser profile.

## v1.0 key workflow improvement

Mobile is intended as the daily source of truth. At month end, export an encrypted backup from mobile and use **Merge an encrypted backup** on desktop. Merge is additive: it adds missing records, updates matching IDs, keeps desktop-only records, and does not propagate deletions. If the same record changed on both devices, the imported mobile version wins for that record. No automatic sync is provided.

## Included in this MVP

- Dashboard with monthly income, expenses, net cash flow, account balances and six-month chart
- Income categories: Vigyanlabs Innovations Private Limited, IPO, Earn Karo, and custom “Others (Need To Specify)”
- Expense categories: Food, Transport, Village, Home, Recharges, Lended To, Unwanted Things, Wanted Things, and custom “Others (Need To Specify)”
- Optional note for every transaction
- Income, expense and inter-account transfer records
- Multiple accounts, bank/cash/wallet balances, and credit-card limit, outstanding and available-credit tracking
- Monthly category budgets
- Savings goals
- Manually tracked investment holdings and value updates
- Swing trade journal: entry/exit, stop loss, target, quantity, direction, setup, market/sector context, RSI, EMA/RSI/MACD/volume/breakout checklist, confidence/fear, rule-following, early exit, moved stop, lessons and optional chart links
- Trade journal metrics: realized gross P&L, win rate, monthly realized P&L and trade history (brokerage/taxes/slippage excluded)
- Bills/reminders with due dates and paid status
- Reports and monthly cash-flow summaries, category spending breakdown, and top five expenses for the month
- Ten money-related reminders/quotes on the dashboard
- JSON backup/restore (replace destination after confirmation)
- JSON and encrypted-backup merge for mobile-to-desktop month-end analysis; matching IDs update existing records, new records are added, and records absent from the imported backup are not deleted
- Passphrase-encrypted backup/restore using PBKDF2 + AES-GCM through Web Crypto
- Transaction CSV export and CSV import
- Responsive layout for mobile and desktop
- PWA shell caching for offline use after first successful load

## Run locally

A modern browser is required. To enable service workers and Web Crypto consistently, serve the folder over localhost.

### Python (free)
From this folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in Chrome, Edge, Firefox, or another modern browser.

### Node.js (optional)
Any static server works. No build step or package installation is required.

## Install on phone or computer

- **Desktop:** open the app through `http://localhost:8000` for local testing. For installation on another device, serve it over HTTPS. Browsers generally require HTTPS (or localhost) for PWA installation and service workers.
- **Android:** host the static files on an HTTPS origin you control, open in Chrome, then use the browser menu's **Install app** / **Add to Home screen** option.
- A no-cost static host may be used, but provider terms can change. The app itself does not depend on that host for cloud data. Once installed and cached, it can work offline; the local database is separate on each device.

## Recommended mobile-first workflow

- Record daily activity on Android; treat it as the source of truth.
- At month end, export an encrypted backup on mobile and transfer the file to the desktop.
- On desktop, use **Merge an encrypted backup** (not Restore) to add/update records without deleting desktop-only records. The first merge may add the phone's Cash/Bank accounts by matching name + type to avoid duplicates.
- Review the merge preview, then check account balances, monthly reports and trade journal.
- Before app updates and regularly during the month, export backups. Keep at least one encrypted copy off the phone and keep the passphrase separately.
- Merge creates an automatic pre-merge safety JSON download. It is unencrypted and must be stored privately.

## Backups and privacy

- Export JSON regularly and store it somewhere you control.
- The encrypted backup uses a passphrase-derived AES-256-GCM key. Choose a strong unique passphrase. If forgotten, it cannot be recovered.
- Restore replaces all existing MoneyMatters data after a confirmation. Back up current data before restoring. Merge is safer for mobile-to-desktop transfer, but is not a replacement for backups or a true sync system.
- CSV import expects the header columns `date,type,amount,category`; optional columns are `id,account,toAccount,note`. Account names are matched case-insensitively. Unknown accounts are mapped to the first existing account.
- CSV is for transaction interchange only. JSON is the complete backup format.
- Never enter bank passwords, card PINs, or internet-banking credentials.

## Important account note

For a credit-card account, enter the current outstanding amount as a positive opening amount and enter the card limit. Purchases recorded as expenses increase the amount owed; transfers into the card account reduce it. Review the displayed balance before relying on it for financial decisions.

## Data safety note for swing journal

The trading journal is stored in the same local browser database as other MoneyMatters data and is included in JSON and encrypted backups. A v0.3 backup has no swing-trade records; importing one will not contain history that was never saved in that backup. Keep current v1.0 backups, including the trading journal. Chart image URLs are links only; MoneyMatters does not upload or archive chart images.

## Known MVP limitations

1. No automatic device-to-device sync. Use the merge workflow to transfer mobile records to desktop. It is ID-based merging, not real-time sync; if the same record is edited independently on both devices, the imported version wins for that record. Deletes do not propagate through merge.
2. Recurring transactions are not auto-created yet; the Bills section currently tracks reminders and due dates.
3. Reminders appear inside the app; browser notifications are not enabled.
4. Investment values are manually entered; no live market prices or broker connections.
5. Net worth totals account balances. Investment holdings are displayed separately to avoid silently double-counting them.
6. This is an MVP, not a financial institution product. Test import/restore with sample data and retain backups.
7. IndexedDB is scoped to a browser origin/profile. Do not clear browser site data unless a backup exists.
8. For real use, further hardening should include automated tests, accessibility review, stronger restore preview/rollback, schema migrations and a clear data deletion/export audit.

## Suggested next milestones

- Automated recurring transaction generation with idempotency keys
- In-app reminder scheduling/notifications where browser support allows
- Safer CSV import preview and account/category mapping
- Budget rollover and custom date ranges
- Encrypted local database option and optional app lock
- Automated tests for balances, transfers, import/export and backup restoration
- Optional encrypted backup workflow to a user-chosen folder (browser permissions vary)


## v0.6 mobile UI improvements
- Improved responsive spacing, two-column monthly summary cards, and larger income/expense icons.
- Added clear icons to each navigation section and better touch targets for small screens.
- Bumped service-worker cache version so the new UI files can be fetched after deployment.
