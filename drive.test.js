import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveBackup, encodeBackup, decodeBackup, BACKUP_INTERVAL} from './drive.js';
import {emptyState, addTask, startRun, elapsed, activeRun} from './model.js';

function sample() {const s=emptyState(); addTask(s,'Focus',0,'task'); startRun(s,'task',25,100,'run'); return s;}
test('Drive snapshots preserve active timestamps and validate restored data',()=>{
  const s=sample(); const backup=decodeBackup(encodeBackup(s,200));
  assert.deepEqual(backup.data,s); assert.equal(backup.savedAt,200);
  assert.equal(elapsed(activeRun(backup.data),86400100),86400000);
  assert.equal(BACKUP_INTERVAL,1800000);
  assert.throws(()=>decodeBackup('{}'));
  assert.throws(()=>decodeBackup(JSON.stringify({app:'tempo',backupVersion:1,savedAt:200,data:{}})));
  assert.throws(()=>decodeBackup(encodeBackup(s).replace('"end":null','"end":0')));
});
test('upload creates a new private app-data snapshot with an in-memory bearer token',async()=>{
  let calls=0;
  const drive=new DriveBackup('token',async(url,options)=>{
    calls++; assert.equal(url,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime');
    assert.equal(options.method,'POST'); assert.equal(options.headers.Authorization,'Bearer token');
    assert.match(options.headers['Content-Type'],/^multipart\/related; boundary=tempo_/);
    assert.match(options.body,/"parents":\["appDataFolder"\]/);
    assert.match(options.body,/"savedAt":200/); assert.match(options.body,/"start":100/);
    return Response.json({id:'snapshot',createdTime:'2026-10-15T12:00:00Z'});
  });
  assert.equal((await drive.save(sample(),200)).id,'snapshot'); assert.equal(calls,1);
});
test('latest selects by Drive creation time, and restore validates the downloaded snapshot',async()=>{
  const drive=new DriveBackup('token',async(url)=>{
    if(url.includes('?alt=media')) {assert.match(url,/files\/snapshot\?alt=media$/);return new Response(encodeBackup(sample(),200));}
    const u=new URL(url); assert.equal(u.searchParams.get('spaces'),'appDataFolder');
    assert.equal(u.searchParams.get('orderBy'),'createdTime desc'); assert.equal(u.searchParams.get('pageSize'),'1');
    assert.match(u.searchParams.get('q'),/trashed = false/);
    return Response.json({files:[{id:'snapshot'}]});
  });
  const latest=await drive.latest(); assert.deepEqual((await drive.restore(latest)).data,sample());
});
test('empty Drive accounts are handled and failed uploads are never reported as success',async()=>{
  assert.equal(await new DriveBackup('token',async()=>Response.json({files:[]})).latest(),null);
  for(const status of [401,403,500]) {
    const drive=new DriveBackup('token',async()=>new Response('',{status}));
    await assert.rejects(()=>drive.save(sample()),status===401?/expired/:status===403?/denied/:/failed/);
  }
  await assert.rejects(()=>new DriveBackup('token',async()=>Response.json({})).save(sample()),/did not confirm/);
  await assert.rejects(()=>new DriveBackup('token',async()=>{throw Error('offline');}).save(sample()),/offline/);
});
