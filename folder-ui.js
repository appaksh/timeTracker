import {FolderStore, DATA_FILE, rememberFolder} from './folder.js';

export function setupFolder({getState, replaceState, canSave, preferences = rememberFolder, schedule = (fn, ms) => window.setInterval?.(fn, ms)}) {
  const $ = id => document.getElementById(id);
  let store = null, connected = false, busy = true, queue = Promise.resolve(), saving = 0;
  let syncedState = null;
  const supported = typeof window.showDirectoryPicker === 'function';
  function message(text) { $('folder-status').textContent = text; }
  function render() {
    $('folder-name').textContent = store ? `${store.directory.name} / ${DATA_FILE}` : 'Browser storage';
    $('folder-choose').textContent = store ? 'Change folder' : 'Choose folder';
    $('folder-choose').disabled = !supported || busy || saving > 0;
    $('folder-resume').hidden = !store;
    $('folder-resume').textContent = connected ? 'Reload folder data' : 'Reconnect folder';
    $('folder-resume').disabled = busy || saving > 0;
    $('folder-save').hidden = !connected;
    $('folder-save').disabled = busy || saving > 0;
    $('folder-disconnect').hidden = !store;
    $('folder-disconnect').disabled = busy || saving > 0;
    $('storage-badge').textContent = connected ? (saving ? '● Saving to folder…' : '● Local folder connected') : '● Saved in this browser';
  }
  async function activate(candidate, interactive) {
    const permission = {mode:'readwrite'};
    let access = await candidate.directory.queryPermission(permission);
    if (access !== 'granted' && interactive) access = await candidate.directory.requestPermission(permission);
    if (access !== 'granted') { store = candidate; connected = false; message('Folder permission is needed. Click Reconnect folder. Changes continue to save in this browser.'); return false; }
    const data = await candidate.read();
    if (data) {
      if (JSON.stringify(data) !== JSON.stringify(getState())) {
        if (!confirm(`Load tasks and runs from ${candidate.directory.name}/${DATA_FILE}? This replaces the browser copy. Export your browser copy first if you want to keep it. Use only one version of Tempo at a time.`)) {
          connected = false; message('Folder loading cancelled. Your browser data is unchanged.'); return false;
        }
        if (!replaceState(data)) throw Error('Folder data could not be saved in the browser.');
      }
    } else {
      if (!interactive) { store = candidate; connected = false; message('The saved folder has no data file. Click Reconnect folder to create one from this browser.'); return false; }
      if (!canSave()) throw Error('Browser data is unreadable. Restore a backup before creating a folder file.');
      await candidate.write(getState());
    }
    store = candidate; connected = true;
    syncedState = JSON.stringify(getState());
    message('Folder connected. Task and timer changes save automatically. Use only one app window at a time.');
    return true;
  }
  function changed() {
    if (!connected || busy) return;
    const snapshot = structuredClone(getState()), target = store;
    saving++; render();
    queue = queue.then(async () => {
      if (!connected || store !== target) return;
      try {
        if (!canSave()) throw Error('Browser data cannot be read. Folder saving is paused.');
        await target.write(snapshot);
        syncedState = JSON.stringify(snapshot);
        message(`Saved to folder at ${new Date().toLocaleTimeString()}.`);
      } catch (error) {
        connected = false; message(`${error.message} Your latest changes remain in this browser. Reconnect or reload the folder before resuming.`);
      }
    }).finally(() => { saving--; render(); });
    return queue;
  }
  async function action(fn) {
    if (busy || saving) return;
    busy = true; render();
    try { await fn(); }
    catch (error) { message(`Folder access failed: ${error.message} Browser autosave remains available. Reconnect the folder to retry.`); }
    finally { busy = false; render(); }
  }
  $('folder-choose').onclick = () => action(async () => {
    // Must be invoked from the click so the browser can open its native picker.
    let directory;
    message('Waiting for a folder selection…');
    try { directory = await window.showDirectoryPicker({id:'tempo-data', mode:'readwrite'}); }
    catch (error) {
      if (error.name === 'AbortError') {
        message('The browser did not return a folder. If you cancelled, your storage is unchanged. If you selected a folder, try opening this app in desktop Chrome or Edge and choose it there. Browser autosave is still active.');
        return;
      }
      throw error;
    }
    if (!directory || directory.kind !== 'directory') throw Error('The browser did not provide a usable directory handle. Try desktop Chrome or Edge.');
    connected = false;
    const candidate = new FolderStore(directory);
    store = candidate;
    message('Folder selected. Checking access and loading data…');
    render();
    if (await activate(candidate, true)) {
      try { await preferences('set', directory); }
      catch { message('Folder connected for this session. The browser could not remember it; choose it again after reopening.'); }
    }
  });
  $('folder-resume').onclick = () => action(async () => {
    connected = false;
    await activate(store, true);
  });
  $('folder-save').onclick = changed;
  $('folder-disconnect').onclick = () => action(async () => {
    await preferences('delete'); store = null; connected = false;
    message('Using browser storage. Your folder file is preserved.');
  });
  (async () => {
    try {
      if (!supported) { message('Folder selection is unavailable in this browser. Use desktop Chrome or Edge, or continue with browser storage and JSON export.'); return; }
      const directory = await preferences('get');
      if (directory) { store = new FolderStore(directory); await activate(store, false); }
      else message('Choose a folder to share data between localhost and the hosted app. Select the same folder separately in each.');
    } catch (error) { connected = false; message('Folder could not be reopened: ' + error.message + ' Browser storage remains available.'); }
    finally { busy = false; render(); }
  })();
  async function refresh() {
    if (document.hidden || !connected || busy || saving) return;
    await action(async () => {
      try {
        if (await store.directory.queryPermission({mode:'readwrite'}) !== 'granted') {
          connected = false;
          message('Folder permission is needed. Click Reconnect folder. Changes continue to save in this browser.');
          return;
        }
        const candidate = new FolderStore(store.directory);
        const data = await candidate.read();
        if (candidate.expected === store.expected) return;
        if (!data) throw Error('The folder data file was removed. Reconnect to choose how to continue.');
        if (JSON.stringify(getState()) !== syncedState) throw Error('Both the browser and folder have changes. Export your browser copy, then reload the folder data to resolve the conflict.');
        if (!replaceState(data)) throw Error('Updated folder data could not be saved in this browser.');
        store = candidate;
        syncedState = JSON.stringify(data);
        message(`Updated from folder at ${new Date().toLocaleTimeString()}. Changes save automatically.`);
      } catch (error) {
        connected = false;
        message(`Automatic folder refresh paused: ${error.message} Browser data is preserved.`);
      }
    });
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener?.('focus', refresh);
  schedule(refresh, 2000);
  window.addEventListener?.('beforeunload', event => {
    if (saving > 0) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  return {changed, canEdit:() => !busy};
}
