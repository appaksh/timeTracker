import {DriveBackup, DRIVE_SCOPE, BACKUP_INTERVAL, loadGoogleIdentity} from './drive.js';

export function setupDrive({getState, canBackup, restoreState}) {
  const $ = id => document.getElementById(id);
  const SETTINGS = 'tempo.google-drive.v1';
  let settings = {}, drive = null, expiresAt = 0, busy = false, armed = false, nextBackup = 0;
  try { settings = JSON.parse(localStorage.getItem(SETTINGS)) || {}; } catch { /* Timer data is independent. */ }
  function persist() {
    try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); }
    catch { message('Backup preferences could not be saved on this device.'); }
  }
  function message(text) { $('drive-status').textContent = text; }
  function validSession() { return drive && Date.now() < expiresAt; }
  function render() {
    $('drive-connect').textContent = validSession() ? 'Reconnect / switch account' : 'Connect Google Drive';
    $('drive-connect').disabled = busy;
    $('drive-save').disabled = busy || !validSession();
    $('drive-restore').disabled = busy || !validSession();
    $('drive-disconnect').hidden = !drive;
    $('drive-disconnect').disabled = busy;
    $('drive-auto').checked = Boolean(settings.auto);
    $('drive-auto').disabled = busy;
    $('drive-last').textContent = settings.lastBackup ? `Last upload from this device: ${new Date(settings.lastBackup).toLocaleString()}` : 'No successful uploads from this device yet.';
    $('drive-next').textContent = settings.auto && armed && validSession()
      ? `Next backup around ${new Date(nextBackup).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}. Keep this app open.`
      : settings.auto ? 'Automatic backups paused. Connect, then back up or restore to begin.' : 'Automatic backups are off.';
  }
  function arm() { armed = true; nextBackup = Date.now() + BACKUP_INTERVAL; }
  async function operation(fn) {
    if (busy) return;
    if (!validSession()) { armed = false; message('Connect Google Drive to continue.'); render(); return; }
    busy = true; render();
    try { await fn(); }
    catch (error) { message(error.message); }
    finally { busy = false; render(); }
  }
  async function save() {
    await operation(async () => {
      if (!canBackup()) throw new Error('Local task data could not be read. Restore a valid backup before uploading.');
      message('Uploading backup…');
      await drive.save(structuredClone(getState()));
      settings.lastBackup = Date.now(); persist(); arm();
      message('Backup saved to Google Drive. You can now switch devices.');
    });
  }
  $('drive-connect').onclick = async () => {
    $('drive-client').value = settings.clientId || '';
    $('drive-setup-status').textContent = 'Loading Google sign-in…';
    $('drive-authorize').disabled = true;
    $('drive-origin').textContent = location.origin;
    $('drive-dialog').showModal();
    try { await loadGoogleIdentity(); $('drive-authorize').disabled = false; $('drive-setup-status').textContent = ''; }
    catch (error) { $('drive-setup-status').textContent = error.message; }
  };
  $('drive-setup').onsubmit = event => {
    event.preventDefault();
    const clientId = $('drive-client').value.trim();
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      $('drive-setup-status').textContent = 'Enter a Google OAuth client ID ending in .apps.googleusercontent.com.'; return;
    }
    settings.clientId = clientId; persist();
    $('drive-authorize').disabled = true;
    $('drive-setup-status').textContent = 'Finish connecting in the Google window.';
    const fail = text => { $('drive-authorize').disabled = false; $('drive-setup-status').textContent = text; };
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id:clientId, scope:DRIVE_SCOPE, include_granted_scopes:false,
        callback:response => {
          if (response.error || !response.access_token) { fail('Google connection was not completed. Try again.'); return; }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) { fail('Grant app-data access to back up to Google Drive.'); return; }
          drive = new DriveBackup(response.access_token);
          expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 60) * 1000;
          armed = false;
          $('drive-dialog').close();
          message('Connected. On a new device, restore latest first. Otherwise choose Back up now.');
          render();
        },
        error_callback:() => fail('Google sign-in was closed or blocked. Allow the sign-in popup and try again.'),
      });
      client.requestAccessToken({prompt:'select_account'});
    } catch (error) { fail(error.message); }
  };
  $('drive-cancel').onclick = () => $('drive-dialog').close();
  $('drive-save').onclick = save;
  $('drive-restore').onclick = () => operation(async () => {
    message('Looking for the latest backup…');
    const file = await drive.latest();
    if (!file) { message('No Tempo backups found in this Google account. Choose Back up now on your original device.'); return; }
    const backup = await drive.restore(file);
    // Device clocks can differ; Drive creation time identifies the latest uploaded snapshot.
    const when = new Date(file.createdTime || backup.savedAt).toLocaleString();
    const count = backup.data.tasks.length;
    if (!confirm(`Restore backup uploaded ${when} (${count} tasks, ${backup.data.runs.length} runs)? This replaces local data. Export a local backup first if you need to keep it. Any active timer will continue from its saved start time.`)) {
      message('Restore cancelled. Local data is unchanged.'); return;
    }
    if (!restoreState(backup.data)) throw new Error('Restore could not be saved locally. Check the storage error above.');
    arm(); message(`Restored backup uploaded ${when}. Ready to continue on this device.`);
  });
  $('drive-auto').onchange = () => {
    settings.auto = $('drive-auto').checked; persist();
    if (armed) nextBackup = Date.now() + BACKUP_INTERVAL;
    render();
  };
  $('drive-disconnect').onclick = () => {
    drive = null; expiresAt = 0; armed = false;
    message('Disconnected on this device. Your local tasks and Drive backups are preserved.'); render();
  };
  async function check() {
    if (busy) return;
    if (drive && !validSession()) {
      drive = null; armed = false;
      message('Google session expired. Reconnect, then back up or restore to resume automatic backups.'); render();
    }
    if (settings.auto && armed && validSession() && Date.now() >= nextBackup) {
      nextBackup = Date.now() + BACKUP_INTERVAL; // Failed uploads retry later, without a request loop.
      await save();
    }
  }
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('online', check);
  message('Connect to back up or restore. Use the same Google account and client ID on each device.');
  render();
}
