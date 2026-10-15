import {parseState} from './model.js';

export const DATA_FILE = 'tempo-data.json';

export class FolderStore {
  constructor(directory) { this.directory = directory; this.expected = undefined; }
  async raw() {
    try { return await (await (await this.directory.getFileHandle(DATA_FILE)).getFile()).text(); }
    catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
  }
  async read() {
    const raw = await this.raw();
    const state = raw === null ? null : parseState(raw);
    this.expected = raw;
    return state;
  }
  async write(state) {
    const raw = JSON.stringify(parseState(JSON.stringify(state)), null, 2);
    if (this.expected === undefined) throw Error('Read the folder data before saving.');
    if (await this.raw() !== this.expected) throw Error('The folder file changed in another app or tab. Folder saving is paused. Reload the folder data before continuing; export your browser copy first if needed.');
    const file = await this.directory.getFileHandle(DATA_FILE, {create:true});
    const stream = await file.createWritable();
    try { await stream.write(raw); await stream.close(); }
    catch (error) { try { await stream.abort(); } catch {} throw error; }
    this.expected = raw;
  }
}

export async function rememberFolder(action, handle) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tempo-local-folder', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Folder preferences are blocked by another tab. Close it and retry.'));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('settings', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('settings');
      const result = action === 'get' ? store.get('directory') : action === 'delete' ? store.delete('directory') : store.put(handle, 'directory');
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || Error('Folder preferences could not be saved.')); };
    };
  });
}
