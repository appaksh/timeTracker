# Tempo — Time Tracker

Run `npm start` with Node.js 18+ and open http://localhost:3000. Run checks with `npm test`. No installation or build step is needed.

If port 3000 is already in use, open the running app at that address or stop its terminal with Ctrl+C before restarting. To choose another port in PowerShell, run `$env:PORT=3001; npm start`. Keep using the same port to access the same browser data; each port has separate localStorage.

Add tasks and start runs with a target in minutes. Starting a run stops the previous one. Stop run preserves the open task; Complete task closes it and stops its active run. Completed tasks can be reopened. Targets show progress and overtime without stopping tracking. Elapsed time uses timestamps, including background tabs, browser restarts, and overnight runs.

Data is stored in localStorage for this browser and origin. Use Export backup regularly, and Restore backup to move data or recover it. Clearing browser data removes the local copy. Storage failures are shown and changes are not applied when saving fails. Optional Google Drive snapshots are described below; live cross-device synchronization and manual time editing are not included. Use one tab for mutations: storage events refresh other tabs, but simultaneous edits in multiple tabs are not transactionally coordinated. Clock adjustments affect elapsed time. Fonts fall back to system sans-serif when offline.

## Selectable local folder

Under **Storage location**, choose a folder in a supported desktop browser (Chrome or Edge). Tempo uses `tempo-data.json` in that folder:

- If the file already exists, validate and load it before enabling folder autosave. If it differs from this browser's data, loading requires confirmation. Cancel to keep the browser copy; export it first if you need both copies.
- If the folder has no data file, create it using the current browser's tasks and runs.
- Every successful task/timer change saves to browser storage immediately, then queues a folder write. Wait for **Saved to folder** before closing or switching versions. Active time is timestamp-based and needs no per-second disk writes.
- **Save now** writes the current browser data. **Reload folder data** reads changes from the other version. **Use browser storage only** disconnects without deleting the file.

Choose the same folder separately from localhost and the hosted site. Each origin remembers its folder handle in IndexedDB, but the browser may require **Reconnect folder** after reopening. The browser exposes the folder name rather than an editable absolute path. An HTTPS host or localhost is required. Unsupported browsers keep browser storage and manual JSON export/restore available.

Use only one app window/version at a time. Connected tabs automatically read external changes on focus, on returning to the tab, and every 2 seconds while visible. Refreshes update the browser copy without writing back to the file. If both copies have changes, or permission/file validation fails, folder access pauses and browser data is preserved. External changes are also checked before every write. This is conflict detection, not a cross-origin database transaction: truly simultaneous writers are not supported. Deleted/corrupt files, revoked permission, and disk failures do not trigger automatic replacement of existing data. Reconnect and resolve the folder state explicitly. No files leave your device through the local-folder feature.

For GitHub Pages, upload `folder.js` and `folder-ui.js` along with the updated `app.js`, `index.html`, and `style.css`. No server or package changes are needed on Pages. Restart the local Node server to pick up its new module routes.

## Google Drive backups

Use **Connect Google Drive** in the app to configure Google authorization. This is snapshot backup and restore for one device at a time, not live synchronization. Local autosave continues independently of Google.

One-time setup:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable the Google Drive API. No shared database or hosted server is required.
2. Configure Google Auth Platform branding and audience. When using Testing status, add your Google account as a test user.
3. Create an OAuth client of type **Web application**. Add `http://localhost:3000` as an Authorized JavaScript origin. If you use another origin, add it as well. Remote origins generally require HTTPS. No redirect URI or client secret is used by this browser token flow.
4. Paste the client ID into the app and continue with Google. Use the **same OAuth client ID and Google account on every device**. App-data storage is tied to the Google project/application.

On the original device, choose **Back up now**. Optionally enable **Back up every 30 minutes**. On another device, connect and **Restore latest** before making changes. A restore replaces local tasks/runs after confirmation; active runs retain their timestamps and continue tracking. Export local data first if you want to preserve it. Automatic uploads are armed only after a successful manual backup or restore in the current connection, preventing a fresh install from uploading empty data immediately.

Backups use the narrow `drive.appdata` scope and live in Drive's hidden application-data folder. Each successful upload creates a separate JSON snapshot; the app restores the most recently created snapshot using Drive's server timestamp. Older snapshots are retained, consume Drive storage, and are not automatically pruned. They are not visible as ordinary files in My Drive. Downloadable local JSON exports remain available separately.

Access tokens are held only in memory. Google browser tokens expire: the UI pauses automatic backups and asks you to reconnect. Reloading also requires reconnecting and manually backing up or restoring before automatic uploads resume. There is no unattended token refresh. Backups run only while the app is open, connected, and authorized; sleep and browser throttling can delay them. Missed intervals trigger one upload when the app resumes, not one per missed interval. Failures keep the previous successful-backup timestamp and are shown in the backup panel. Before shutdown, use **Back up now** and wait for confirmation.

The app must still be available on each device (run this project locally on each computer, or separately host the static app on an HTTPS origin registered with Google). Google Drive stores backups; it does not host the app. No Google credentials are included in this repository. A real account authorization/upload round trip must be verified after providing your own client ID.
