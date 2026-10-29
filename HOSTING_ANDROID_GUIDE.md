# MoneyMatters: beginner guide to free static hosting and Android installation

This guide uses GitHub Pages as one possible free static host. Free plans and terms can change; this is not a lifetime guarantee. You can also keep running MoneyMatters locally without any hosting account.

## Before you start

- Keep this folder on your computer as your own source-code copy.
- Do **not** upload real MoneyMatters backup JSON files, transaction CSV files, app-lock recovery codes, passwords, or personal finance documents to the source repository.
- The repository contains the application code only. It should never contain your financial database or backups.
- The app's data is stored separately in each browser/device. Hosting the app does not sync data between devices.

## A. Create a GitHub repository

1. Open `https://github.com` and sign in or create an account.
2. Use the **New repository** action.
3. Name it `MoneyMatters` (or another simple name).
4. For the simplest free GitHub Pages setup, make the repository **Public**. Treat everything in a public repository as readable by anyone.
5. Create the repository. You do not need to add personal finance data or a database.

## B. Upload only application files

From the extracted `MoneyMatters_v0_5` folder, upload these files and folders to the repository's root:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/` (both PNG icon files)
- `README.md` (optional)
- `HOSTING_ANDROID_GUIDE.md` (optional)
- `BACKUP_TEST_CHECKLIST.md` (optional)

On GitHub, choose **Add file → Upload files**, drag those files/folders in, then commit the upload. Do not upload your exported backups or any personal data.

## C. Enable GitHub Pages

1. Open the repository's **Settings** tab.
2. Open **Pages** in the repository settings.
3. Under the build/deployment source, choose **Deploy from a branch** if offered.
4. Select branch `main` and folder `/ (root)`, then save.
5. Wait for the Pages deployment to finish. The Pages screen will show the published HTTPS URL. A project repository commonly uses a URL shaped like `https://YOUR-USERNAME.github.io/MoneyMatters/`; use the exact URL GitHub shows you.
6. Open that URL on your computer first. Confirm the dashboard loads before using your phone.

GitHub's interface can change. If the menu wording differs, use GitHub's official Pages documentation linked from the Pages settings.

## D. Install on Android

1. Connect your phone to the internet and open Chrome.
2. Visit the exact HTTPS URL shown by GitHub Pages.
3. Wait for the MoneyMatters dashboard to load completely.
4. Open Chrome's three-dot menu. Choose **Install app** or **Add to Home screen** if offered.
5. Confirm the installation and launch MoneyMatters from the new home-screen icon.
6. Add only sample records at first. Reload the app and confirm the sample records remain.
7. Open **Backup & restore**, export a JSON backup, and store it in a location you control.
8. Test restore using a copy of that sample backup before entering real data.

The app shell is cached for offline use after a successful online load, but browser cache eviction and storage cleanup can happen. Offline mode is not a backup.

## E. Move sample data from computer to phone

1. On the computer, open MoneyMatters at the hosted HTTPS URL (not `localhost`).
2. Add sample records and export a JSON backup.
3. Transfer that backup to your phone using a method you trust.
4. Open MoneyMatters on the phone, go to **Backup & restore**, and choose the JSON file.
5. Read the restore confirmation. Restore replaces the destination app's current data; it does not merge records.
6. Verify the transaction count and account balances. Keep the original backup until everything is checked.

## Privacy and security model

- The host serves application files; MoneyMatters's current code stores financial records in browser IndexedDB and does not intentionally upload transactions to a server.
- The app PIN is a casual-access privacy gate, not encryption of the live database.
- Encrypted JSON backup uses a passphrase, but losing the passphrase makes that backup unrecoverable.
- A public repository exposes application source code. Never put personal records or backups in it.
- If the hosted application code is changed by a compromised repository/account or hosting supply chain, future app loads could run altered code. Use account security (strong unique password and MFA), review updates, and keep a local source copy.
- Keep at least two backup copies in different places and periodically test restoring them.


## Month-end desktop analysis (v1.0)

1. Keep daily entry on Android.
2. On Android, open Backup & Restore and export an encrypted backup. Transfer the `.paisaos` file to the computer.
3. Open the desktop MoneyMatters at the same published GitHub Pages origin. Before merging, you may export an encrypted desktop backup too.
4. Open Backup & Restore → Merge an encrypted backup. Choose the mobile file and enter its passphrase. Review the preview carefully.
5. Confirm the merge, then check account balances, reports and swing trade records. Re-importing the same backup should not duplicate records with matching IDs.

Use Merge rather than Restore for month-end analysis. Restore replaces desktop data. Merge does not delete desktop records missing from the phone backup. If a record was edited on both devices, the imported version wins for that matching ID. Keep mobile as the only device for daily entries to avoid conflicts.
