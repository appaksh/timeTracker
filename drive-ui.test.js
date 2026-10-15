import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDrive} from './drive-ui.js';
import {encodeBackup, BACKUP_INTERVAL} from './drive.js';
import {emptyState, addTask} from './model.js';

test('automatic backups require an explicit first action, run at 30 minutes, and pause on expiry', async t => {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{textContent:'',value:'',disabled:false,hidden:false,checked:false,showModal(){},close(){}});
    return elements.get(id);
  };
  let now=1000, interval, tokenOptions, uploads=0, failUpload=false, local=emptyState();
  const remote=emptyState(); addTask(remote,'From another device',0,'remote');
  const storage=new Map([['tempo.google-drive.v1',JSON.stringify({clientId:'example.apps.googleusercontent.com',auto:true})]]);
  t.mock.method(Date,'now',()=>now);
  const replace=(name,value)=>{const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});};
  replace('document',{getElementById:element,addEventListener(){}});
  replace('location',{origin:'http://localhost:3000'});
  replace('localStorage',{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
  replace('setInterval',fn=>{interval=fn;});
  replace('addEventListener',()=>{});
  replace('confirm',()=>true);
  replace('google',{accounts:{oauth2:{initTokenClient:options=>{tokenOptions=options;return {requestAccessToken(){options.callback({access_token:'secret',expires_in:3600});}};},hasGrantedAllScopes:()=>true}}});
  replace('fetch',async (url)=>{
    if(url.includes('/upload/')) {if(failUpload)throw Error('offline');uploads++;return Response.json({id:'backup'});}
    if(url.includes('alt=media'))return new Response(encodeBackup(remote,now));
    return Response.json({files:[{id:'backup',createdTime:'2026-10-15T00:00:00Z'}]});
  });
  setupDrive({getState:()=>local,canBackup:()=>true,restoreState:s=>{local=s;return true;}});
  await element('drive-connect').onclick();
  element('drive-setup').onsubmit({preventDefault(){}});
  assert.equal(element('drive-save').disabled,false);
  now+=BACKUP_INTERVAL; await interval(); assert.equal(uploads,0,'connecting must not upload empty local state');
  await element('drive-restore').onclick(); assert.equal(local.tasks[0].id,'remote');
  now+=BACKUP_INTERVAL-1; await interval(); assert.equal(uploads,0);
  // Renew authorization to keep the token valid for the due upload, then explicitly arm.
  tokenOptions.callback({access_token:'secret',expires_in:3600});
  await element('drive-save').onclick(); assert.equal(uploads,1);
  const saved=JSON.parse(storage.get('tempo.google-drive.v1')).lastBackup;
  failUpload=true; await element('drive-save').onclick();
  assert.equal(JSON.parse(storage.get('tempo.google-drive.v1')).lastBackup,saved);
  assert.match(element('drive-status').textContent,/offline/);
  failUpload=false;
  now+=BACKUP_INTERVAL; await interval(); assert.equal(uploads,2,'automatic upload after 30 minutes');
  now+=BACKUP_INTERVAL; await interval(); assert.equal(uploads,2,'expired sessions must not upload');
  assert.match(element('drive-status').textContent,/expired/);
  assert.equal(element('drive-save').disabled,true);
  assert.ok(!storage.get('tempo.google-drive.v1').includes('secret'),'access tokens never enter localStorage');
});
