# Tempo — Time Tracker

Run `npm start` with Node.js 18+ and open http://localhost:3000. Run checks with `npm test`. No installation or build step is needed.

If port 3000 is already in use, open the running app at that address or stop its terminal with Ctrl+C before restarting. To choose another port in PowerShell, run `$env:PORT=3001; npm start`. Keep using the same port to access the same browser data; each port has separate localStorage.

Add tasks and start runs with a target in minutes. Starting a run stops the previous one. Stop run preserves the open task; Complete task closes it and stops its active run. Completed tasks can be reopened. Targets show progress and overtime without stopping tracking. Elapsed time uses timestamps, including background tabs, browser restarts, and overnight runs.

Data is stored in localStorage for this browser and origin. Use Export backup regularly, and Restore backup to move data or recover it. Clearing browser data removes the local copy. Storage failures are shown and changes are not applied when saving fails. Optional Google Drive snapshots are described below; live cross-device synchronization and manual time editing are not included. Use one tab for mutations: storage events refresh other tabs, but simultaneous edits in multiple tabs are not transactionally coordinated. Clock adjustments affect elapsed time. Fonts fall back to system sans-serif when offline.

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
