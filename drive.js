import {parseState} from './model.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const BACKUP_INTERVAL = 30 * 60 * 1000;
const API = 'https://www.googleapis.com';
const BACKUP_NAME = 'tempo-backup-v1.json';

export function encodeBackup(state, now = Date.now()) {
  const data = parseState(JSON.stringify(state));
  return JSON.stringify({app:'tempo', backupVersion:1, savedAt:now, data});
}

export function decodeBackup(raw) {
  const backup = JSON.parse(raw);
  if (backup?.app !== 'tempo' || backup.backupVersion !== 1 || !Number.isFinite(backup.savedAt)) {
    throw new Error('This is not a supported Tempo backup.');
  }
  return {...backup, data:parseState(JSON.stringify(backup.data))};
}

export class DriveBackup {
  constructor(token, fetcher = globalThis.fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(path, options = {}) {
    const response = await this.fetcher(API + path, {
      ...options,
      headers:{...options.headers, Authorization:`Bearer ${this.token}`},
      signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Google session expired. Reconnect Google Drive to continue.');
      if (response.status === 403) throw new Error('Drive access was denied. Enable the Google Drive API and grant Tempo app-data access.');
      throw new Error(`Google Drive request failed (${response.status}). Try again when online.`);
    }
    return response;
  }

  async latest() {
    const query = new URLSearchParams({
      spaces:'appDataFolder', q:`name = '${BACKUP_NAME}' and trashed = false`,
      orderBy:'createdTime desc', pageSize:'1', fields:'files(id,createdTime)',
    });
    const result = await (await this.request('/drive/v3/files?' + query)).json();
    return result.files?.[0] ?? null;
  }

  async save(state, now = Date.now()) {
    // Each backup is a separate snapshot, so another device cannot overwrite an older backup.
    const boundary = 'tempo_' + crypto.randomUUID();
    const metadata = JSON.stringify({name:BACKUP_NAME, parents:['appDataFolder'], mimeType:'application/json'});
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${encodeBackup(state, now)}\r\n--${boundary}--`;
    const response = await this.request('/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime', {
      method:'POST', headers:{'Content-Type':`multipart/related; boundary=${boundary}`}, body,
    });
    const file = await response.json();
    if (!file.id) throw new Error('Google did not confirm the backup. Try again.');
    return file;
  }

  async restore(file) {
    const response = await this.request(`/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
    return decodeBackup(await response.text());
  }
}

let identityPromise;
export function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!identityPromise) {
    identityPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const timeout = setTimeout(() => {script.remove(); identityPromise = null; reject(new Error('Google sign-in could not load. Check your connection and try again.'));}, 20000);
      script.onload = () => {clearTimeout(timeout); resolve();};
      script.onerror = () => {clearTimeout(timeout); script.remove(); identityPromise = null; reject(new Error('Google sign-in could not load. Check your connection and try again.'));};
      document.head.append(script);
    });
  }
  return identityPromise;
}
