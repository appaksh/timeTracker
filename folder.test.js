import test from 'node:test';
import assert from 'node:assert/strict';
import {FolderStore, DATA_FILE} from './folder.js';
import {setupFolder} from './folder-ui.js';
import {emptyState, addTask, startRun, activeRun, elapsed} from './model.js';

function directory(initial = null) {
  const dir = {name:'My time', kind:'directory', content:initial, permission:'granted', fail:false, writes:0,
    async queryPermission(){return this.permission;}, async requestPermission(){return this.permission;},
    async getFileHandle(name, options={}) {
      assert.equal(name,DATA_FILE);
      if(this.content===null&&!options.create) throw Object.assign(Error('missing'),{name:'NotFoundError'});
      return {
        getFile:async()=>({text:async()=>dir.content}),
        createWritable:async()=>{
          let pending;
          return {write:async raw=>{if(dir.fail)throw Error('Disk full');pending=raw;},close:async()=>{dir.content=pending;dir.writes++;},abort:async()=>{}};
        },
      };
    },
  };return dir;
}
function sample(name='Task') {const s=emptyState();addTask(s,name,0,'task');startRun(s,'task',25,100,'run');return s;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('empty folder creates a validated file and preserves active timestamps on reopening',async()=>{
  const dir=directory(),store=new FolderStore(dir);
  await assert.rejects(()=>store.write(sample()),/Read the folder/);
  assert.equal(await store.read(),null);await store.write(sample());
  const reopened=await new FolderStore(dir).read();
  assert.deepEqual(reopened,sample());assert.equal(elapsed(activeRun(reopened),86400100),86400000);
});
test('corrupt files are not overwritten, external edits and file deletion pause saving',async()=>{
  const corrupt=directory('{broken'),broken=new FolderStore(corrupt);
  await assert.rejects(()=>broken.read());await assert.rejects(()=>broken.write(sample()));
  assert.equal(corrupt.content,'{broken');assert.equal(corrupt.writes,0);
  const dir=directory(JSON.stringify(sample())),store=new FolderStore(dir);
  await store.read();dir.content=JSON.stringify(sample('Other app'));
  await assert.rejects(()=>store.write(sample()),/changed in another/);assert.equal(dir.writes,0);
  await store.read();dir.content=null;await assert.rejects(()=>store.write(sample()),/changed in another/);
});
test('failed disk writes preserve the prior file',async()=>{
  const original=JSON.stringify(sample()),dir=directory(original),store=new FolderStore(dir);
  await store.read();dir.fail=true;
  await assert.rejects(()=>store.write(sample('Change')),/Disk full/);
  assert.equal(dir.content,original);assert.equal(store.expected,original);
});

function ui(t,{dir=null,permission='granted',accept=true,supported=true,pickerError=null}={}) {
  const elements=new Map(),element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,hidden:false});return elements.get(id);
  };
  const events={};let local=emptyState(), remembered=dir;
  function replace(name,value) {const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});}
  const picked=dir||directory();picked.permission=permission;
  replace('window',supported?{showDirectoryPicker:async()=>{if(pickerError)throw pickerError;return picked;},addEventListener:(name,fn)=>{events[name]=fn;}}:{});
  replace('document',{getElementById:element,hidden:false,addEventListener:(name,fn)=>{events[name]=fn;}});
  replace('confirm',()=>accept);
  const controller=setupFolder({getState:()=>local,canSave:()=>true,replaceState:s=>{local=s;return true;},schedule:(fn,ms)=>{assert.equal(ms,2000);events.poll=fn;},preferences:async(action,handle)=>{if(action==='get')return remembered;if(action==='set')remembered=handle;else remembered=null;}});
  return {element,controller,picked,events,get local(){return local;},set local(s){local=s;},get remembered(){return remembered;}};
}
test('folder UI loads existing data and queues rapid changes without losing the latest state',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample()))});await settle();
  assert.deepEqual(setup.local,sample());
  setup.local=sample('First');const first=setup.controller.changed();
  setup.local=sample('Latest');const last=setup.controller.changed();
  await Promise.all([first,last]);assert.deepEqual(JSON.parse(setup.picked.content),sample('Latest'));
  assert.match(setup.element('folder-status').textContent,/Saved to folder/);
  setup.picked.content=JSON.stringify(sample('External'));
  await setup.events.visibilitychange();
  assert.match(setup.element('folder-status').textContent,/Updated from folder/);
  assert.equal(setup.local.tasks[0].name,'External');
  assert.equal(setup.picked.writes,2,'refresh must not write stale data back');
});
test('choose and disconnect retain the file and the current browser copy',async t=>{
  const setup=ui(t);await settle();setup.local=sample();
  await setup.element('folder-choose').onclick();assert.deepEqual(JSON.parse(setup.picked.content),sample());
  assert.equal(setup.remembered,setup.picked);
  await setup.element('folder-disconnect').onclick();assert.equal(setup.remembered,null);
  assert.deepEqual(setup.local,sample());assert.deepEqual(JSON.parse(setup.picked.content),sample());
});
test('denied permission keeps browser storage available without touching folder contents',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample())),permission:'denied'});await settle();
  assert.equal(setup.local.tasks.length,0);assert.equal(setup.picked.writes,0);
  assert.equal(setup.controller.canEdit(),true);assert.match(setup.element('folder-status').textContent,/permission is needed/);
});
test('cancelling a folder-data replacement never enables autosave',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample())),accept:false});await settle();
  setup.local=sample('Browser');await setup.controller.changed();
  assert.equal(JSON.parse(setup.picked.content).tasks[0].name,'Task');assert.equal(setup.picked.writes,0);
});
test('unsupported browsers retain browser autosave and export',async t=>{
  const setup=ui(t,{supported:false});await settle();
  assert.equal(setup.element('folder-choose').disabled,true);assert.equal(setup.controller.canEdit(),true);
  assert.match(setup.element('folder-status').textContent,/unavailable/);
});
test('picker AbortError produces visible guidance instead of silently leaving the initial status',async t=>{
  const setup=ui(t,{pickerError:Object.assign(Error('Aborted'),{name:'AbortError'})});await settle();
  await setup.element('folder-choose').onclick();
  assert.match(setup.element('folder-status').textContent,/browser did not return a folder/);
  assert.equal(setup.element('folder-name').textContent,'Browser storage');
  assert.equal(setup.element('folder-choose').disabled,false);
  assert.equal(setup.picked.writes,0);
});
test('file-access AbortError keeps the selected folder visible and offers reconnect',async t=>{
  const setup=ui(t);await settle();
  setup.picked.getFileHandle=async()=>{throw Object.assign(Error('File access aborted'),{name:'AbortError'});};
  await setup.element('folder-choose').onclick();
  assert.equal(setup.element('folder-name').textContent,'My time / tempo-data.json');
  assert.match(setup.element('folder-status').textContent,/File access aborted/);
  assert.equal(setup.element('folder-resume').hidden,false);
});
test('visible tabs poll for external changes and focus refreshes active timers',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample()))});await settle();
  setup.picked.content=JSON.stringify(sample('Polled'));
  await setup.events.poll();assert.equal(setup.local.tasks[0].name,'Polled');
  setup.picked.content=JSON.stringify(sample('Focused'));
  await setup.events.focus();assert.equal(setup.local.tasks[0].name,'Focused');
  assert.equal(activeRun(setup.local).start,100);assert.equal(setup.picked.writes,0);
});
test('automatic refresh preserves unsaved browser edits on conflict',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample()))});await settle();
  setup.local=sample('Unsaved browser');setup.picked.content=JSON.stringify(sample('External'));
  await setup.events.poll();assert.equal(setup.local.tasks[0].name,'Unsaved browser');
  assert.match(setup.element('folder-status').textContent,/Both the browser and folder have changes/);
  assert.equal(setup.element('folder-save').hidden,true);assert.equal(setup.picked.writes,0);
});
test('automatic refresh pauses on corrupt data or revoked permission',async t=>{
  const setup=ui(t,{dir:directory(JSON.stringify(sample()))});await settle();
  setup.picked.content='{invalid';await setup.events.poll();
  assert.deepEqual(setup.local,sample());assert.match(setup.element('folder-status').textContent,/refresh paused/);
  setup.picked.content=JSON.stringify(sample());await setup.element('folder-resume').onclick();
  setup.picked.permission='prompt';await setup.events.focus();
  assert.match(setup.element('folder-status').textContent,/permission is needed/);
  assert.equal(setup.picked.writes,0);
});
